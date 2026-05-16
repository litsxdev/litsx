import fs from "fs";

import {
  collectLitsxAuthoredDiagnostics,
  createToolingVirtualLitsxSource,
  decodeVirtualAttributeName,
  getLitsxAttributeCompletionNames,
  inferLitsxAttributeInfoAtPosition,
  inferLitsxStaticHoistInfoAtPosition,
  inferLitsxAttributeCompletionContext,
  inferLitsxMarkupCompletionContext,
  looksLikeLitsxJsx,
  mapOriginalPositionToToolingVirtual,
  remapVirtualText,
  remapToolingTextSpanToOriginal,
} from "./virtualization.js";
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
  return /\.(jsx|tsx|litsx)$/.test(fileName) || fileName.endsWith(".litsx.jsx");
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

function normalizeEscapedNewlines(text) {
  if (typeof text !== "string" || !text.includes("\\")) {
    return text;
  }

  return text
    .replace(/\\r\\n/g, "\r\n")
    .replace(/\\n/g, "\n");
}

function remapDocumentationParts(parts) {
  return parts?.map((part) => ({
    ...part,
    text: normalizeEscapedNewlines(remapVirtualText(part.text)),
  }));
}

function remapMessageText(messageText) {
  if (typeof messageText === "string") {
    return remapVirtualText(messageText);
  }

  if (!messageText || typeof messageText !== "object") {
    return messageText;
  }

  return {
    ...messageText,
    messageText: remapMessageText(messageText.messageText),
    next: messageText.next?.map(remapMessageText),
  };
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

function remapTextSpanField(record, fieldName, virtualization) {
  const span = record?.[fieldName];
  if (!span) {
    return record;
  }

  return {
    ...record,
    [fieldName]: remapToolingTextSpanToOriginal(span, virtualization),
  };
}

function remapFileSpanRecord(record, getVirtualization) {
  const virtualization = record?.fileName
    ? getVirtualization(record.fileName)
    : null;

  if (!virtualization) {
    return record;
  }

  let remapped = {
    ...record,
    textSpan: record.textSpan
      ? remapToolingTextSpanToOriginal(record.textSpan, virtualization)
      : record.textSpan,
  };

  remapped = remapTextSpanField(remapped, "contextSpan", virtualization);
  remapped = remapTextSpanField(remapped, "originalTextSpan", virtualization);

  return remapped;
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
    messageText: remapMessageText(info.messageText),
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
        messageText: remapMessageText(diagnostic.messageText),
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

    const warningCategory = 0;
    const authoredErrors = authoredDiagnostics.filter(
      (diagnostic) => diagnostic.category !== warningCategory,
    );

    if (authoredErrors.length === 0) {
      return diagnostics;
    }

    return [...diagnostics, ...authoredErrors];
  };
}

function wrapSyntacticDiagnostics(method, getVirtualization, getAuthoredDiagnostics, ts) {
  return (fileName) => {
    const diagnostics = wrapDiagnostics(method, getVirtualization)(fileName);
    const virtualization = getVirtualization(fileName);

    if (
      !(/\.[cm]?[jt]sx$/.test(fileName) || fileName.endsWith(".litsx") || fileName.endsWith(".litsx.jsx")) ||
      !virtualization
    ) {
      return diagnostics;
    }

    const authoredDiagnostics = getAuthoredDiagnostics(fileName);
    if (!authoredDiagnostics?.length) {
      return fileName.endsWith(".jsx") ? [] : diagnostics;
    }

    // TypeScript's JSX parser does not understand LitSX-authored syntax in
    // plain .jsx files, so its raw syntactic diagnostics are mostly parser
    // cascades. Replace them wholesale with authored diagnostics instead.
    if (fileName.endsWith(".jsx")) {
      const seen = new Set();
      return authoredDiagnostics.filter((diagnostic) => {
        const key = `${diagnostic.code}:${diagnostic.start}:${diagnostic.length}`;
        if (seen.has(key)) {
          return false;
        }
        seen.add(key);
        return true;
      });
    }

    const warningCategory = ts?.DiagnosticCategory?.Warning ?? 0;
    const authoredWarnings = authoredDiagnostics.filter(
      (diagnostic) => diagnostic.category === warningCategory,
    );

    if (authoredWarnings.length === 0) {
      return diagnostics;
    }

    const seen = new Set(
      diagnostics.map(
        (diagnostic) => `${diagnostic.code}:${diagnostic.start}:${diagnostic.length}`,
      ),
    );

    return [
      ...diagnostics,
      ...authoredWarnings.filter((diagnostic) => {
        const key = `${diagnostic.code}:${diagnostic.start}:${diagnostic.length}`;
        if (seen.has(key)) {
          return false;
        }
        seen.add(key);
        return true;
      }),
    ];
  };
}

function wrapDefinitionAtPosition(method, getVirtualization) {
  return (fileName, position) => {
    const virtualization = getVirtualization(fileName);
    const mappedPosition = virtualization
      ? mapOriginalPositionToToolingVirtual(position, virtualization)
      : position;
    const definitions = method?.(fileName, mappedPosition);

    if (!definitions?.length) {
      return definitions;
    }

    return definitions.map((definition) => remapFileSpanRecord(definition, getVirtualization));
  };
}

function wrapDefinitionAndBoundSpan(method, getVirtualization) {
  return (fileName, position) => {
    const virtualization = getVirtualization(fileName);
    const mappedPosition = virtualization
      ? mapOriginalPositionToToolingVirtual(position, virtualization)
      : position;
    const result = method?.(fileName, mappedPosition);

    if (!result) {
      return result;
    }

    return {
      ...result,
      textSpan: virtualization && result.textSpan
        ? remapToolingTextSpanToOriginal(result.textSpan, virtualization)
        : result.textSpan,
      definitions: result.definitions?.map((definition) => remapFileSpanRecord(definition, getVirtualization)),
    };
  };
}

function wrapReferences(method, getVirtualization) {
  return (fileName, position) => {
    const virtualization = getVirtualization(fileName);
    const mappedPosition = virtualization
      ? mapOriginalPositionToToolingVirtual(position, virtualization)
      : position;
    const references = method?.(fileName, mappedPosition);

    if (!references?.length) {
      return references;
    }

    return references.map((reference) => remapFileSpanRecord(reference, getVirtualization));
  };
}

function wrapRenameInfo(method, getVirtualization) {
  return (fileName, position, ...rest) => {
    const virtualization = getVirtualization(fileName);
    const mappedPosition = virtualization
      ? mapOriginalPositionToToolingVirtual(position, virtualization)
      : position;
    const info = method?.(fileName, mappedPosition, ...rest);

    if (!info || !virtualization || !info.triggerSpan) {
      return info;
    }

    return {
      ...info,
      triggerSpan: remapToolingTextSpanToOriginal(info.triggerSpan, virtualization),
    };
  };
}

function wrapRenameLocations(method, getVirtualization) {
  return (fileName, position, ...rest) => {
    const virtualization = getVirtualization(fileName);
    const mappedPosition = virtualization
      ? mapOriginalPositionToToolingVirtual(position, virtualization)
      : position;
    const locations = method?.(fileName, mappedPosition, ...rest);

    if (!locations?.length) {
      return locations;
    }

    return locations.map((location) => remapFileSpanRecord(location, getVirtualization));
  };
}

function wrapQuickInfo(method, getVirtualization) {
  return (fileName, position) => {
    const virtualization = getVirtualization(fileName);
    const mappedPosition = virtualization
      ? mapOriginalPositionToToolingVirtual(position, virtualization)
      : position;
    const info = method(fileName, mappedPosition);

    if (!virtualization) {
      return info;
    }

    function createHoistQuickInfo(hoistInfo, fallbackSpan = null) {
      return {
        kind: "function",
        kindModifiers: "",
        textSpan: hoistInfo
          ? {
            start: hoistInfo.start,
            length: hoistInfo.length,
          }
          : fallbackSpan,
        displayParts: [
          { text: hoistInfo?.name ?? "static hoist", kind: "functionName" },
          { text: "(...)", kind: "punctuation" },
          { text: ": ", kind: "punctuation" },
          { text: "static hoist", kind: "keyword" },
        ],
        documentation: [
          {
            text: hoistInfo?.documentation ?? "LitSX static hoist.",
            kind: "text",
          },
        ],
      };
    }

    if (!info) {
      const hoistInfo = inferLitsxStaticHoistInfoAtPosition(virtualization.sourceText, position);
      if (hoistInfo) {
        return createHoistQuickInfo(hoistInfo);
      }

      const attributeInfo = inferLitsxAttributeInfoAtPosition(virtualization.sourceText, position);
      if (!attributeInfo) {
        return info;
      }

      let kindLabel = "binding";
      let detail = "LitSX binding";

      if (attributeInfo.prefix === "@") {
        kindLabel = "event";
        detail = "LitSX event listener binding";
      } else if (attributeInfo.prefix === ".") {
        kindLabel = "property";
        detail = "LitSX property binding";
      } else if (attributeInfo.prefix === "?") {
        kindLabel = "boolean";
        detail = "LitSX boolean attribute binding";
      }

      return {
        kind: "property",
        kindModifiers: "",
        textSpan: {
          start: attributeInfo.start,
          length: attributeInfo.length,
        },
        displayParts: [
          { text: attributeInfo.name, kind: "propertyName" },
          { text: ": ", kind: "punctuation" },
          { text: kindLabel, kind: "keyword" },
        ],
        documentation: [
          {
            text: `${detail} for <${attributeInfo.tagName}>.`,
            kind: "text",
          },
        ],
      };
    }

    const hoistInfo = inferLitsxStaticHoistInfoAtPosition(virtualization.sourceText, position);
    if (hoistInfo) {
      return createHoistQuickInfo(hoistInfo);
    }

    const remappedDisplayParts = remapDisplayParts(info.displayParts);
    return {
      ...info,
      textSpan: remapToolingTextSpanToOriginal(info.textSpan, virtualization),
      displayParts: remappedDisplayParts,
      documentation: remapDocumentationParts(info.documentation),
    };
  };
}

function getLitsxCompletionMetadata(name) {
  if (typeof name !== "string" || name.length < 2) {
    return null;
  }

  if (name.startsWith("@")) {
    return {
      kind: "memberVariableElement",
      kindLabel: "event",
      detail: "LitSX event listener binding",
    };
  }

  if (name.startsWith(".")) {
    return {
      kind: "property",
      kindLabel: "property",
      detail: "LitSX property binding",
    };
  }

  if (name.startsWith("?")) {
    return {
      kind: "property",
      kindLabel: "boolean",
      detail: "LitSX boolean attribute binding",
    };
  }

  return null;
}

function createContextualReplacementSpan(context) {
  if (!context) {
    return undefined;
  }

  return {
    start: context.start + 1,
    length: Math.max(context.length - 1, 0),
  };
}

function createContextualCompletionEntries(virtualization, position) {
  if (!virtualization) {
    return [];
  }

  const context = inferLitsxAttributeCompletionContext(virtualization.sourceText, position);

  return getLitsxAttributeCompletionNames(context).map((name, index) => {
    const metadata = getLitsxCompletionMetadata(name);

    return {
      name,
      kind: metadata?.kind ?? "property",
      kindModifiers: "",
      sortText: `0${index}`,
      insertText: name.slice(1),
      filterText: name.slice(1),
      replacementSpan: createContextualReplacementSpan(context),
      source: "LitSX",
      data: {
        __litsxContextualCompletion: true,
      },
    };
  });
}

function wrapCompletions(method, getVirtualization) {
  return (fileName, position, options, formattingSettings) => {
    const virtualization = getVirtualization(fileName);
    const mappedPosition = virtualization
      ? mapOriginalPositionToToolingVirtual(position, virtualization)
      : position;
    const completions = method(fileName, mappedPosition, options, formattingSettings);
    const contextualEntries = createContextualCompletionEntries(virtualization, position);

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

function wrapCompletionEntryDetails(method, getVirtualization) {
  return (fileName, position, entryName, ...rest) => {
    const virtualization = getVirtualization(fileName);
    const metadata = getLitsxCompletionMetadata(entryName);

    if (virtualization && metadata) {
      const context = inferLitsxAttributeCompletionContext(virtualization.sourceText, position);
      if (context && getLitsxAttributeCompletionNames(context).includes(entryName)) {
        return {
          name: entryName,
          kind: metadata.kind,
          kindModifiers: "",
          displayParts: [
            { text: entryName, kind: "propertyName" },
            { text: ": ", kind: "punctuation" },
            { text: metadata.kindLabel, kind: "keyword" },
          ],
          documentation: [
            {
              text: `${metadata.detail} for <${context.tagName}>.`,
              kind: "text",
            },
          ],
          tags: [],
          codeActions: [],
        };
      }
    }

    if (typeof method !== "function") {
      return undefined;
    }

    const mappedPosition = virtualization
      ? mapOriginalPositionToToolingVirtual(position, virtualization)
      : position;
    const details = method(fileName, mappedPosition, entryName, ...rest);

    if (!details || !virtualization) {
      return details;
    }

    return {
      ...details,
      displayParts: remapDisplayParts(details.displayParts),
      documentation: remapDocumentationParts(details.documentation),
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
        return (fileName.endsWith(".tsx") || fileName.endsWith(".litsx")) ? ["typescript"] : [];
      }

      const originalGetScriptKind = typeof host.getScriptKind === "function"
        ? host.getScriptKind.bind(host)
        : null;

      host.getScriptKind = (fileName) => {
        if (fileName.endsWith(".litsx")) {
          return ts.ScriptKind.TSX;
        }

        if (fileName.endsWith(".litsx.jsx")) {
          return ts.ScriptKind.JSX;
        }

        return originalGetScriptKind?.(fileName);
      };

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
        getSyntacticDiagnostics: wrapSyntacticDiagnostics(
          languageService.getSyntacticDiagnostics.bind(languageService),
          getVirtualization,
          getAuthoredDiagnostics,
          ts,
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
        getCompletionEntryDetails: wrapCompletionEntryDetails(
          languageService.getCompletionEntryDetails?.bind(languageService),
          getVirtualization,
        ),
        getDefinitionAtPosition: wrapDefinitionAtPosition(
          languageService.getDefinitionAtPosition?.bind(languageService),
          getVirtualization,
        ),
        getDefinitionAndBoundSpan: wrapDefinitionAndBoundSpan(
          languageService.getDefinitionAndBoundSpan?.bind(languageService),
          getVirtualization,
        ),
        getReferencesAtPosition: wrapReferences(
          languageService.getReferencesAtPosition?.bind(languageService),
          getVirtualization,
        ),
        getRenameInfo: wrapRenameInfo(
          languageService.getRenameInfo?.bind(languageService),
          getVirtualization,
        ),
        findRenameLocations: wrapRenameLocations(
          languageService.findRenameLocations?.bind(languageService),
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
  inferLitsxAttributeInfoAtPosition,
  inferLitsxAttributeCompletionContext,
  inferLitsxMarkupCompletionContext,
  looksLikeLitsxJsx,
  mapOriginalPositionToVirtual,
  mapOriginalPositionToToolingVirtual,
  remapVirtualText,
  remapTextSpanToOriginal,
  remapToolingTextSpanToOriginal,
} from "./virtualization.js";
