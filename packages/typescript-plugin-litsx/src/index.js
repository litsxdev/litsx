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
export { runLitsxTypecheck } from "./typecheck.js";

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

function wrapDiagnostics(method, getVirtualization) {
  return (fileName) => {
    const diagnostics = method(fileName) ?? [];
    const virtualization = getVirtualization(fileName);

    if (!virtualization) {
      return diagnostics;
    }

    return diagnostics.map((diagnostic) => ({
      ...diagnostic,
      start:
        typeof diagnostic.start === "number"
          ? remapToolingTextSpanToOriginal(
              { start: diagnostic.start, length: diagnostic.length ?? 0 },
              virtualization,
            ).start
          : diagnostic.start,
      length:
        typeof diagnostic.start === "number"
          ? remapToolingTextSpanToOriginal(
              { start: diagnostic.start, length: diagnostic.length ?? 0 },
              virtualization,
            ).length
          : diagnostic.length,
      relatedInformation: diagnostic.relatedInformation?.map((info) => ({
        ...info,
        span: remapToolingTextSpanToOriginal(info.span, virtualization),
      })),
    }));
  };
}

function wrapSemanticDiagnostics(method, getVirtualization) {
  return (fileName) => {
    const diagnostics = wrapDiagnostics(method, getVirtualization)(fileName);
    const virtualization = getVirtualization(fileName);

    if (!virtualization?.authoredDiagnostics?.length) {
      return diagnostics;
    }

    return [...diagnostics, ...virtualization.authoredDiagnostics];
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

    for (const entry of filteredEntries) {
      if (!mergedEntries.some((candidate) => candidate.name === entry.name)) {
        mergedEntries.push(entry);
      }
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

      function buildVirtualization(fileName) {
        const snapshot = originalGetScriptSnapshot(fileName);

        if (!snapshot || !isRelevantFile(fileName)) {
          virtualizations.delete(fileName);
          return {
            snapshot,
            virtualization: null,
          };
        }

        const sourceText = readSnapshotText(snapshot);

        if (!looksLikeLitsxJsx(sourceText)) {
          virtualizations.delete(fileName);
          return {
            snapshot,
            virtualization: null,
          };
        }

        const virtualization = createToolingVirtualLitsxSource(sourceText, {
          plugins: getPluginsForFile(fileName),
        });

        if (virtualization.code === sourceText) {
          virtualizations.delete(fileName);
          return {
            snapshot,
            virtualization: null,
          };
        }

        const authoredDiagnostics = collectLitsxAuthoredDiagnostics(sourceText, ts, {
          plugins: getPluginsForFile(fileName),
        });

        virtualizations.set(fileName, {
          ...virtualization,
          authoredDiagnostics,
          sourceText,
        });

        return {
          snapshot,
          virtualization: {
            ...virtualization,
            authoredDiagnostics,
            sourceText,
          },
        };
      }

      function getVirtualization(fileName) {
        return virtualizations.get(fileName) ?? buildVirtualization(fileName).virtualization;
      }

      host.getScriptSnapshot = (fileName) => {
        const { snapshot, virtualization } = buildVirtualization(fileName);

        if (!virtualization) {
          return snapshot;
        }

        return createSnapshot(ts, virtualization.code);
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
      return fileNames.filter((fileName) => {
        if (!isRelevantFile(fileName) || !fs.existsSync(fileName)) {
          return false;
        }

        const sourceText = fs.readFileSync(fileName, "utf8");
        return looksLikeLitsxJsx(sourceText);
      });
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
