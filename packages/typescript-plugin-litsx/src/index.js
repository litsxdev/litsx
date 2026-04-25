import fs from "fs";

import {
  collectLitsxAuthoredDiagnostics,
  createToolingVirtualLitsxSource,
  decodeVirtualAttributeName,
  getLitsxAttributeCompletionNames,
  inferLitsxAttributeCompletionContext,
  looksLikeLitsxJsx,
  mapOriginalPositionToToolingVirtual,
  remapVirtualText,
  remapToolingTextSpanToOriginal,
} from "./virtual-source.js";
export { createLitsxTypecheckSession, runLitsxTypecheck } from "./typecheck.js";

const PROFILE_ENABLED = process.env.LITSX_PROFILE === "1";
const EXTERNAL_FILES_CACHE = new WeakMap();

function profilePhase(namespace, name, callback) {
  if (!PROFILE_ENABLED) {
    return callback();
  }

  const start = performance.now();
  try {
    return callback();
  } finally {
    globalThis.__litsxProfileEvents ??= [];
    globalThis.__litsxProfileEvents.push({
      namespace,
      name,
      durationMs: performance.now() - start,
    });
  }
}

function isRelevantFile(fileName) {
  return /\.(jsx|tsx)$/.test(fileName);
}

function readSnapshotText(snapshot) {
  return snapshot.getText(0, snapshot.getLength());
}

function createSnapshot(ts, sourceText) {
  return ts.ScriptSnapshot.fromString(sourceText);
}

function remapDisplayParts(parts) {
  return parts?.map((part) => ({
    ...part,
    text: remapVirtualText(part.text),
  }));
}

function remapNumericTextSpan(start, length, virtualization) {
  if (typeof start !== "number") {
    return null;
  }

  return remapToolingTextSpanToOriginal(
    { start, length: length ?? 0 },
    virtualization,
  );
}

function remapRelatedInformation(info, getVirtualization, fallbackVirtualization) {
  const virtualization = info.file?.fileName
    ? getVirtualization(info.file.fileName) ?? fallbackVirtualization
    : fallbackVirtualization;

  if (!virtualization) {
    return info;
  }

  const remappedStartLength = remapNumericTextSpan(info.start, info.length, virtualization);
  const remappedSpan = info.span
    ? remapToolingTextSpanToOriginal(info.span, virtualization)
    : info.span;

  return {
    ...info,
    ...(remappedStartLength
      ? {
        start: remappedStartLength.start,
        length: remappedStartLength.length,
      }
      : {}),
    span: remappedSpan,
  };
}

function wrapDiagnostics(method, getVirtualization) {
  return (fileName) => {
    const diagnostics = method(fileName) ?? [];
    const virtualization = getVirtualization(fileName);

    if (!virtualization) {
      return diagnostics;
    }

    return diagnostics.map((diagnostic) => {
      const remappedSpan = remapNumericTextSpan(
        diagnostic.start,
        diagnostic.length,
        virtualization,
      );

      return {
        ...diagnostic,
        ...(remappedSpan
          ? remappedSpan
          : {
            start: diagnostic.start,
            length: diagnostic.length,
          }),
        relatedInformation: diagnostic.relatedInformation?.map((info) => (
          remapRelatedInformation(info, getVirtualization, virtualization)
        )),
      };
    });
  };
}

function wrapSemanticDiagnostics(method, getVirtualization, getAuthoredDiagnostics) {
  return (fileName) => {
    const diagnostics = wrapDiagnostics(method, getVirtualization)(fileName);
    const authoredDiagnostics = getAuthoredDiagnostics(fileName);

    if (!authoredDiagnostics?.length) {
      return diagnostics;
    }

    return [...diagnostics, ...authoredDiagnostics];
  };
}

function wrapQuickInfo(method, getVirtualization) {
  return (fileName, position) => {
    const virtualization = getVirtualization(fileName);
    const mappedPosition = virtualization
      ? mapOriginalPositionToToolingVirtual(position, virtualization)
      : position;
    const info = method(fileName, mappedPosition);

    if (!info || !virtualization) {
      return info;
    }

    return {
      ...info,
      textSpan: remapToolingTextSpanToOriginal(info.textSpan, virtualization),
      displayParts: remapDisplayParts(info.displayParts),
      documentation: remapDisplayParts(info.documentation),
    };
  };
}

function wrapCompletions(method, getVirtualization) {
  return (fileName, position, options, formattingSettings) => {
    const virtualization = getVirtualization(fileName);
    const mappedPosition = virtualization
      ? mapOriginalPositionToToolingVirtual(position, virtualization)
      : position;
    const completions = method(fileName, mappedPosition, options, formattingSettings);
    const contextualEntries = virtualization
      ? getLitsxAttributeCompletionNames(
          inferLitsxAttributeCompletionContext(virtualization.sourceText, position),
        ).map((name, index) => ({
          name,
          kind: "property",
          kindModifiers: "",
          sortText: `0${index}`,
          insertText: name,
        }))
      : [];

    const filteredEntries = (completions?.entries ?? []).filter(
      (entry) => !decodeVirtualAttributeName(entry.name),
    );
    const mergedEntries = [...contextualEntries];
    const seenNames = new Set(contextualEntries.map((entry) => entry.name));

    for (const entry of filteredEntries) {
      if (seenNames.has(entry.name)) continue;
      seenNames.add(entry.name);
      mergedEntries.push(entry);
    }

    if (!completions && mergedEntries.length === 0) {
      return completions;
    }

    return {
      ...(completions ?? {}),
      entries: mergedEntries,
    };
  };
}

export default function init(modules) {
  const ts = modules.typescript;

  return {
    create(info) {
      const host = info.languageServiceHost;

      if (!host || typeof host.getScriptSnapshot !== "function") {
        return info.languageService;
      }

      const originalGetScriptSnapshot = host.getScriptSnapshot.bind(host);
      const virtualizations = new Map();

      function getPluginsForFile(fileName) {
        return fileName.endsWith(".tsx") ? ["typescript"] : [];
      }

      function getCachedRecord(fileName) {
        return virtualizations.get(fileName) ?? null;
      }

      function clearRecord(fileName) {
        virtualizations.delete(fileName);
      }

      function getOrBuildVirtualizationRecord(fileName) {
        const snapshot = originalGetScriptSnapshot(fileName);

        if (!snapshot || !isRelevantFile(fileName)) {
          clearRecord(fileName);
          return {
            snapshot,
            record: null,
          };
        }

        const cachedRecord = getCachedRecord(fileName);
        if (cachedRecord?.snapshot === snapshot) {
          return {
            snapshot,
            record: cachedRecord,
          };
        }

        const sourceText = readSnapshotText(snapshot);
        if (cachedRecord?.sourceText === sourceText) {
          cachedRecord.snapshot = snapshot;
          return {
            snapshot,
            record: cachedRecord,
          };
        }

        if (!looksLikeLitsxJsx(sourceText)) {
          clearRecord(fileName);
          return {
            snapshot,
            record: null,
          };
        }

        const parserPlugins = getPluginsForFile(fileName);
        const virtualization = profilePhase(
          "typescript-plugin",
          "tooling-virtualization",
          () => createToolingVirtualLitsxSource(sourceText, {
            plugins: parserPlugins,
          }),
        );

        if (virtualization.code === sourceText) {
          clearRecord(fileName);
          return {
            snapshot,
            record: null,
          };
        }

        const record = {
          ...virtualization,
          sourceText,
          parserPlugins,
          snapshot,
          virtualizedSnapshot: null,
          authoredDiagnostics: null,
          authoredDiagnosticsReady: false,
        };

        virtualizations.set(fileName, record);

        return {
          snapshot,
          record,
        };
      }

      function getVirtualization(fileName) {
        return getOrBuildVirtualizationRecord(fileName).record;
      }

      function getAuthoredDiagnostics(fileName) {
        const record = getVirtualization(fileName);
        if (!record) {
          return null;
        }

        if (!record.authoredDiagnosticsReady) {
          record.authoredDiagnostics = profilePhase(
            "typescript-plugin",
            "authored-diagnostics",
            () => collectLitsxAuthoredDiagnostics(record.sourceText, ts, {
              plugins: record.parserPlugins,
            }),
          );
          record.authoredDiagnosticsReady = true;
        }

        return record.authoredDiagnostics;
      }

      host.getScriptSnapshot = (fileName) => {
        const { snapshot, record } = getOrBuildVirtualizationRecord(fileName);

        if (!record) {
          return snapshot;
        }

        if (!record.virtualizedSnapshot) {
          record.virtualizedSnapshot = createSnapshot(ts, record.code);
        }

        return record.virtualizedSnapshot;
      };

      const languageService = info.languageService;

      return {
        ...languageService,
        getSyntacticDiagnostics: wrapDiagnostics(
          languageService.getSyntacticDiagnostics.bind(languageService),
          getVirtualization,
        ),
        getSemanticDiagnostics: wrapSemanticDiagnostics(
          languageService.getSemanticDiagnostics.bind(languageService),
          getVirtualization,
          getAuthoredDiagnostics,
        ),
        getSuggestionDiagnostics: wrapDiagnostics(
          languageService.getSuggestionDiagnostics.bind(languageService),
          getVirtualization,
        ),
        getQuickInfoAtPosition: wrapQuickInfo(
          languageService.getQuickInfoAtPosition.bind(languageService),
          getVirtualization,
        ),
        getCompletionsAtPosition: wrapCompletions(
          languageService.getCompletionsAtPosition.bind(languageService),
          getVirtualization,
        ),
      };
    },

    getExternalFiles(project) {
      const fileNames = project.getFileNames?.() ?? [];
      const projectVersion = project.getProjectVersion?.() ?? "";
      const cacheKey = `${projectVersion}:${fileNames.join("\0")}`;
      const cached = EXTERNAL_FILES_CACHE.get(project);
      if (cached?.cacheKey === cacheKey) {
        return cached.result;
      }

      const result = fileNames.filter((fileName) => {
        if (!isRelevantFile(fileName) || !fs.existsSync(fileName)) {
          return false;
        }

        const sourceText = fs.readFileSync(fileName, "utf8");
        return looksLikeLitsxJsx(sourceText);
      });
      EXTERNAL_FILES_CACHE.set(project, { cacheKey, result });
      return result;
    },
  };
}

export {
  collectLitsxAuthoredDiagnostics,
  createVirtualLitsxJsxSource,
  createToolingVirtualLitsxSource,
  decodeVirtualAttributeName,
  getLitsxAttributeCompletionNames,
  inferLitsxAttributeCompletionContext,
  looksLikeLitsxJsx,
  mapOriginalPositionToVirtual,
  mapOriginalPositionToToolingVirtual,
  remapVirtualText,
  remapTextSpanToOriginal,
  remapToolingTextSpanToOriginal,
} from "./virtual-source.js";
