import fs from "fs";
import path from "path";
import { createRequire } from "module";

const require = createRequire(import.meta.url);

let authoredModulePromise = null;
let tsModule = null;
const PROJECT_SERVICE_CACHE = new Map();
const QUERY_FILE_SUFFIX_BY_LANGUAGE_ID = {
  litsx: ".tsx",
  "litsx-jsx": ".jsx",
};
const SCRIPT_KIND_BY_EXTENSION = {
  "litsx.jsx": "JSX",
  litsx: "TSX",
  tsx: "TSX",
  jsx: "JSX",
  ts: "TS",
  js: "JS",
};
const BINDING_HOVER_BY_PREFIX = {
  "@": {
    kindLabel: "event",
    detail: "LitSX event listener binding",
  },
  ".": {
    kindLabel: "property",
    detail: "LitSX property binding",
  },
  "?": {
    kindLabel: "boolean",
    detail: "LitSX boolean attribute binding",
  },
};
const COMPLETION_KIND_BY_TS_KIND = {
  keyword: "Keyword",
  const: "Variable",
  constElement: "Variable",
  let: "Variable",
  letElement: "Variable",
  variable: "Variable",
  variableElement: "Variable",
  localVariableElement: "Variable",
  memberVariableElement: "Property",
  property: "Property",
  function: "Function",
  functionElement: "Function",
  memberFunctionElement: "Function",
  class: "Class",
  classElement: "Class",
  interface: "Interface",
  interfaceElement: "Interface",
  module: "Module",
  moduleElement: "Module",
};
const SYMBOL_KIND_RULES = [
  ["Function", (ts) => ts.SymbolFlags.Function | ts.SymbolFlags.Method],
  ["Class", (ts) => ts.SymbolFlags.Class | ts.SymbolFlags.TypeAlias],
  ["Interface", (ts) => ts.SymbolFlags.Interface],
  ["Module", (ts) => ts.SymbolFlags.Module | ts.SymbolFlags.Namespace],
  ["Property", (ts) => ts.SymbolFlags.Property | ts.SymbolFlags.EnumMember],
];

function normalizeFileName(fileName) {
  return path.resolve(fileName).replace(/\\/g, "/");
}

async function loadAuthoredModule() {
  if (!authoredModulePromise) {
    authoredModulePromise = import("@litsx/typescript-plugin/virtual-source");
  }

  return authoredModulePromise;
}

function loadTypeScript() {
  if (!tsModule) {
    tsModule = require("typescript");
  }

  return tsModule;
}

function getParserPlugins(languageId) {
  return languageId === "litsx" ? ["typescript"] : [];
}

function isRelevantFile(fileName) {
  return /\.(jsx|tsx|litsx)$/.test(fileName) || fileName.endsWith(".litsx.jsx");
}

/* c8 ignore start */
/* c8 ignore next */
function getPluginsForFile(fileName, languageId) {
  return (languageId === "litsx" || /\.(tsx|litsx)$/.test(fileName ?? ""))
    ? ["typescript"]
    : [];
}

function getFileVersion(fileName) {
  try {
    const stats = fs.statSync(fileName);
    return `${stats.mtimeMs}:${stats.size}`;
  } catch {
    return "0";
  }
}

function getProjectKey(fileName) {
  const ts = loadTypeScript();
  const configPath =
    ts.findConfigFile(path.dirname(fileName), ts.sys.fileExists, "tsconfig.json") ??
    ts.findConfigFile(path.dirname(fileName), ts.sys.fileExists, "jsconfig.json");
  return configPath ? normalizeFileName(configPath) : `<standalone>:${normalizeFileName(fileName)}`;
}

/* c8 ignore next */
function getQueryFileName(fileName, languageId) {
  return `${fileName}${QUERY_FILE_SUFFIX_BY_LANGUAGE_ID[languageId] ?? ""}`;
}
/* c8 ignore stop */

function getExtraFileExtensions(ts) {
  return [
    {
      extension: ".litsx",
      isMixedContent: false,
      scriptKind: ts.ScriptKind.TSX,
    },
    {
      extension: ".litsx.jsx",
      isMixedContent: false,
      scriptKind: ts.ScriptKind.JSX,
    },
  ];
}

function remapDisplayParts(parts, remapVirtualText) {
  return parts?.map((part) => ({
    ...part,
    text: remapVirtualText(part.text),
  }));
}

function remapMessageText(messageText, remapVirtualText) {
  if (typeof messageText === "string") {
    return remapVirtualText(messageText);
  }

  if (!messageText || typeof messageText !== "object") {
    return messageText;
  }

  return {
    ...messageText,
    messageText: remapMessageText(messageText.messageText, remapVirtualText),
    next: messageText.next?.map((entry) => remapMessageText(entry, remapVirtualText)),
  };
}

function startsAtAuthoredSyntax(sourceText, start) {
  if (typeof sourceText !== "string" || typeof start !== "number" || !(start >= 0 && start < sourceText.length)) {
    return false;
  }

  return "@.?^".includes(sourceText[start]);
}

function readFileText(fileName, overlays) {
  const normalizedFileName = normalizeFileName(fileName);
  if (overlays.has(normalizedFileName)) {
    return overlays.get(normalizedFileName).text;
  }

  try {
    return fs.readFileSync(fileName, "utf8");
  } catch {
    return null;
  }
}

async function getOrCreateProjectService(fileName, sourceText, languageId) {
  const ts = loadTypeScript();
  const authoredModule = await loadAuthoredModule();
  const projectKey = getProjectKey(fileName);
  const queryFileName = getQueryFileName(fileName, languageId);
  let service = PROJECT_SERVICE_CACHE.get(projectKey);

  if (!service) {
    const configPath = projectKey.startsWith("<standalone>:") ? null : projectKey;
    let compilerOptions;
    let rootNames;

    if (configPath) {
      const configFile = ts.readConfigFile(configPath, ts.sys.readFile);
      const parsed = ts.parseJsonConfigFileContent(
        configFile.config,
        {
          ...ts.sys,
          onUnRecoverableConfigFileDiagnostic() {},
        },
        path.dirname(configPath),
        undefined,
        configPath,
        undefined,
        getExtraFileExtensions(ts),
      );

      compilerOptions = parsed.options;
      rootNames = [...parsed.fileNames];
      if (
        rootNames.some((entry) => entry.endsWith(".litsx") || entry.endsWith(".litsx.jsx")) ||
        queryFileName.endsWith(".tsx") ||
        queryFileName.endsWith(".jsx") ||
        fileName.endsWith(".litsx") ||
        fileName.endsWith(".litsx.jsx")
      ) {
        compilerOptions = {
          ...compilerOptions,
          allowNonTsExtensions: true,
        };
      }
    } else {
      compilerOptions = {
        target: ts.ScriptTarget.ESNext,
        module: ts.ModuleKind.ESNext,
        jsx: ts.JsxEmit.Preserve,
        allowJs: true,
        checkJs: true,
        allowNonTsExtensions: true,
        types: [],
      };
      rootNames = [queryFileName];
    }

    if (!rootNames.includes(queryFileName)) {
      rootNames.push(queryFileName);
    }

    const overlays = new Map();
    const virtualizationCache = new Map();

    function getScriptKind(nextFileName) {
      const extension = /\.((?:litsx\.jsx)|litsx|tsx|jsx|ts|js)$/.exec(nextFileName)?.[1];
      const scriptKindName = extension ? SCRIPT_KIND_BY_EXTENSION[extension] : undefined;
      return scriptKindName ? ts.ScriptKind[scriptKindName] : undefined;
    }

    function getSnapshotRecord(nextFileName) {
      const normalizedFileName = normalizeFileName(nextFileName);
      const overlay = overlays.get(normalizedFileName);
      const version = overlay?.version ?? getFileVersion(nextFileName);
      const cached = virtualizationCache.get(normalizedFileName);

      if (cached?.version === version) {
        return cached;
      }

      const nextSourceText = readFileText(nextFileName, overlays);
      if (typeof nextSourceText !== "string") {
        virtualizationCache.delete(normalizedFileName);
        return null;
      }

      let virtualization = null;
      let toolingText = nextSourceText;

      if (isRelevantFile(nextFileName) && authoredModule.looksLikeLitsxJsx(nextSourceText)) {
        virtualization = authoredModule.createToolingVirtualLitsxSource(nextSourceText, {
          plugins: getPluginsForFile(nextFileName, languageId),
        });
        toolingText = virtualization.code;
      }

      const record = {
        version,
        sourceText: nextSourceText,
        toolingText,
        virtualization,
        snapshot: ts.ScriptSnapshot.fromString(toolingText),
      };
      virtualizationCache.set(normalizedFileName, record);
      return record;
    }

    const host = {
      extraFileExtensions: getExtraFileExtensions(ts),
      getCompilationSettings() {
        return compilerOptions;
      },
      getCurrentDirectory() {
        return configPath ? path.dirname(configPath) : path.dirname(fileName);
      },
      getDefaultLibFileName(options) {
        return ts.getDefaultLibFilePath(options);
      },
      getScriptFileNames() {
        return rootNames;
      },
      getScriptVersion(nextFileName) {
        const normalizedFileName = normalizeFileName(nextFileName);
        const overlay = overlays.get(normalizedFileName);
        return String(overlay?.version ?? getFileVersion(nextFileName));
      },
      getScriptKind,
      getScriptSnapshot(nextFileName) {
        return getSnapshotRecord(nextFileName)?.snapshot;
      },
      fileExists(nextFileName) {
        return overlays.has(normalizeFileName(nextFileName)) || ts.sys.fileExists(nextFileName);
      },
      readFile(nextFileName) {
        return readFileText(nextFileName, overlays);
      },
      readDirectory(...args) {
        return ts.sys.readDirectory(...args);
      },
      /* c8 ignore start */
      directoryExists(nextDirName) {
        return ts.sys.directoryExists?.(nextDirName) ?? true;
      },
      getDirectories(nextDirName) {
        return ts.sys.getDirectories?.(nextDirName) ?? [];
      },
      getNewLine() {
        return ts.sys.newLine;
      },
      useCaseSensitiveFileNames() {
        return ts.sys.useCaseSensitiveFileNames;
      },
      getCanonicalFileName(nextFileName) {
        return ts.sys.useCaseSensitiveFileNames
          ? nextFileName
          : nextFileName.toLowerCase();
      },
      /* c8 ignore stop */
    };

    service = {
      ts,
      overlays,
      rootNames,
      host,
      languageService: ts.createLanguageService(host, ts.createDocumentRegistry()),
      getVirtualization(nextFileName) {
        return getSnapshotRecord(nextFileName)?.virtualization ?? null;
      },
      setOverlay(nextFileName, nextSourceText) {
        const normalizedFileName = normalizeFileName(nextFileName);
        const previousVersion = overlays.get(normalizedFileName)?.version ?? 0;
        overlays.set(normalizedFileName, {
          text: nextSourceText,
          version: previousVersion + 1,
        });
        if (!rootNames.includes(nextFileName)) {
          rootNames.push(nextFileName);
        }
      },
    };

    PROJECT_SERVICE_CACHE.set(projectKey, service);
  }

  service.setOverlay(queryFileName, sourceText);
  service.queryFileName = queryFileName;
  return service;
}

function getBindingHoverInfo(attributeInfo) {
  if (!attributeInfo) {
    return null;
  }

  const bindingInfo = BINDING_HOVER_BY_PREFIX[attributeInfo.prefix] ?? {
    kindLabel: "binding",
    detail: "LitSX binding",
  };

  return {
    name: attributeInfo.name,
    start: attributeInfo.start,
    length: attributeInfo.length,
    kindLabel: bindingInfo.kindLabel,
    detail: `${bindingInfo.detail} for <${attributeInfo.tagName}>.`,
  };
}

function getCompletionItemKind(vscode, name) {
  return vscode.CompletionItemKind[name.startsWith("@") ? "Event" : "Property"];
}

async function computeLitsxDiagnostics(sourceText, languageId) {
  const { collectLitsxAuthoredDiagnostics } = await loadAuthoredModule();
  const ts = loadTypeScript();

  return collectLitsxAuthoredDiagnostics(sourceText, ts, {
    plugins: getParserPlugins(languageId),
  });
}

async function computeLitsxHover(sourceText, languageId, position) {
  const {
    inferLitsxAttributeInfoAtPosition,
    inferLitsxStaticHoistInfoAtPosition,
  } = await loadAuthoredModule();

  const hoistInfo = inferLitsxStaticHoistInfoAtPosition(sourceText, position);
  if (hoistInfo) {
    return {
      start: hoistInfo.start,
      length: hoistInfo.length,
      code: `${hoistInfo.name}(...): static hoist`,
      documentation: hoistInfo.documentation,
    };
  }

  const attributeInfo = inferLitsxAttributeInfoAtPosition(sourceText, position);
  const bindingHoverInfo = getBindingHoverInfo(attributeInfo);
  if (!bindingHoverInfo) {
    return null;
  }

  return {
    start: bindingHoverInfo.start,
    length: bindingHoverInfo.length,
    code: `${bindingHoverInfo.name}: ${bindingHoverInfo.kindLabel}`,
    documentation: bindingHoverInfo.detail,
  };
}

async function computeLitsxCompletions(sourceText, languageId, position, vscode) {
  const {
    getLitsxAttributeCompletionNames,
    inferLitsxAttributeCompletionContext,
  } = await loadAuthoredModule();

  const context = inferLitsxAttributeCompletionContext(sourceText, position);
  if (!context) {
    return [];
  }

  return getLitsxAttributeCompletionNames(context).map((name) => ({
    label: name,
    kind: getCompletionItemKind(vscode, name),
    detail: "LitSX binding",
    documentation: `LitSX binding for <${context.tagName}>.`,
    start: context.start,
    length: context.length,
  }));
}

async function computeLitsxProjectDiagnostics(fileName, sourceText, languageId) {
  const service = await getOrCreateProjectService(fileName, sourceText, languageId);
  const authoredModule = await loadAuthoredModule();
  const queryFileName = service.queryFileName ?? fileName;
  const virtualization = service.getVirtualization(queryFileName);
  const diagnostics = [
    ...service.languageService.getSyntacticDiagnostics(queryFileName),
    ...service.languageService.getSemanticDiagnostics(queryFileName),
  ];
  const remappedDiagnostics = diagnostics
    .map((diagnostic) => {
      if (!virtualization || typeof diagnostic.start !== "number") {
        return {
          ...diagnostic,
          messageText: remapMessageText(diagnostic.messageText, authoredModule.remapVirtualText),
        };
      }

      const remappedSpan = authoredModule.remapToolingTextSpanToOriginal(
        {
          start: diagnostic.start,
          length: diagnostic.length ?? 0,
        },
        virtualization,
      );

      return {
        ...diagnostic,
        start: remappedSpan.start,
        length: remappedSpan.length,
        messageText: remapMessageText(diagnostic.messageText, authoredModule.remapVirtualText),
      };
    })
    .filter((diagnostic) => (
      !String(diagnostic.messageText ?? "").includes("__litsx_") &&
      !startsAtAuthoredSyntax(sourceText, diagnostic.start)
    ));

  const authoredDiagnostics = await computeLitsxDiagnostics(sourceText, languageId);
  const seen = new Set(
    remappedDiagnostics.map((diagnostic) => `${diagnostic.code}:${diagnostic.start}:${diagnostic.length}`),
  );

  return [
    ...remappedDiagnostics,
    ...authoredDiagnostics.filter((diagnostic) => {
      const key = `${diagnostic.code}:${diagnostic.start}:${diagnostic.length}`;
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    }),
  ];
}

async function computeLitsxProjectHover(fileName, sourceText, languageId, position) {
  const service = await getOrCreateProjectService(fileName, sourceText, languageId);
  const authoredModule = await loadAuthoredModule();
  const ts = loadTypeScript();
  const queryFileName = service.queryFileName ?? fileName;
  const virtualization = service.getVirtualization(queryFileName);
  const mappedPosition = virtualization
    ? authoredModule.mapOriginalPositionToToolingVirtual(position, virtualization)
    : position;
  const info = service.languageService.getQuickInfoAtPosition(queryFileName, mappedPosition);

  const hoistInfo = authoredModule.inferLitsxStaticHoistInfoAtPosition(sourceText, position);
  if (hoistInfo) {
    return {
      start: hoistInfo.start,
      length: hoistInfo.length,
      code: `${hoistInfo.name}(...): static hoist`,
      documentation: hoistInfo.documentation,
    };
  }

  if (!info) {
    const program = service.languageService.getProgram();
    const sourceFile = program?.getSourceFile(queryFileName);
    const checker = program?.getTypeChecker();
    if (!program || !sourceFile || !checker) {
      return computeLitsxHover(sourceText, languageId, position);
    }

    let node = findDeepestNodeAtPosition(sourceFile, mappedPosition);
    while (node) {
      const symbol = checker.getSymbolAtLocation(node) ?? null;
      const type = checker.getTypeAtLocation(node) ?? null;
      if (!type) {
        node = node.parent ?? null;
        continue;
      }

      const remappedNodeSpan = virtualization
        ? authoredModule.remapToolingTextSpanToOriginal(
          {
            start: node.getStart(sourceFile),
            length: node.getWidth(sourceFile),
          },
          virtualization,
        )
        : {
          start: position,
          length: 0,
        };

      return {
        start: remappedNodeSpan.start,
        length: remappedNodeSpan.length,
        code: `${symbol?.getName?.() ?? node.getText(sourceFile)}: ${checker.typeToString(type)}`,
        documentation: symbol
          ? ts.displayPartsToString(symbol.getDocumentationComment(checker))
          : "",
      };
    }

    return computeLitsxHover(sourceText, languageId, position);
  }

  const remappedSpan = virtualization
    ? authoredModule.remapToolingTextSpanToOriginal(info.textSpan, virtualization)
    : info.textSpan;
  const displayText = (remapDisplayParts(info.displayParts, authoredModule.remapVirtualText) ?? [])
    .map((entry) => entry.text)
    .join("");
  const documentation = (remapDisplayParts(info.documentation, authoredModule.remapVirtualText) ?? [])
    .map((entry) => entry.text)
    .join("");

  return {
    start: remappedSpan.start,
    length: remappedSpan.length,
    code: displayText || "symbol",
    documentation,
  };
}

function mapCompletionKind(vscode, kind) {
  const kindName = COMPLETION_KIND_BY_TS_KIND[kind] ?? "Text";
  return vscode.CompletionItemKind[kindName];
}

function findDeepestNodeAtPosition(sourceFile, position) {
  let bestNode = null;

  function visit(node) {
    if (position < node.pos || position >= node.end) {
      return;
    }

    bestNode = node;
    node.forEachChild(visit);
  }

  visit(sourceFile);
  return bestNode;
}

function getScopeCompletionPrefix(sourceText, position) {
  const match = /[A-Za-z0-9_$]*$/.exec(sourceText.slice(0, position));
  return match?.[0] ?? "";
}

function getSymbolCompletionKind(ts, vscode, symbol) {
  const kindName = SYMBOL_KIND_RULES.find(([, getMask]) => (symbol.flags & getMask(ts)) !== 0)?.[0] ?? "Variable";
  return vscode.CompletionItemKind[kindName];
}

async function computeLitsxProjectCompletions(fileName, sourceText, languageId, position, vscode) {
  const service = await getOrCreateProjectService(fileName, sourceText, languageId);
  const authoredModule = await loadAuthoredModule();
  const ts = loadTypeScript();
  const queryFileName = service.queryFileName ?? fileName;
  const virtualization = service.getVirtualization(queryFileName);
  const mappedPosition = virtualization
    ? authoredModule.mapOriginalPositionToToolingVirtual(position, virtualization)
    : position;
  const completions = service.languageService.getCompletionsAtPosition(queryFileName, mappedPosition, {
    includeCompletionsForModuleExports: true,
    includeCompletionsWithInsertText: true,
  });

  const contextualEntries = await computeLitsxCompletions(sourceText, languageId, position, vscode);
  const mergedEntries = [...contextualEntries];
  const seen = new Set(contextualEntries.map((entry) => entry.label));

  for (const entry of completions?.entries ?? []) {
    if (authoredModule.decodeVirtualAttributeName(entry.name) || seen.has(entry.name)) {
      continue;
    }
    seen.add(entry.name);

    const remappedSpan = virtualization && entry.replacementSpan
      ? authoredModule.remapToolingTextSpanToOriginal(entry.replacementSpan, virtualization)
      : entry.replacementSpan ?? { start: position, length: 0 };

    mergedEntries.push({
      label: entry.name,
      kind: mapCompletionKind(vscode, entry.kind),
      detail: entry.kindModifiers || entry.kind,
      documentation: entry.source ? `From ${entry.source}` : "TypeScript completion",
      start: remappedSpan.start,
      length: remappedSpan.length,
    });
  }

  if (mergedEntries.length === contextualEntries.length) {
    const program = service.languageService.getProgram();
    const sourceFile = program?.getSourceFile(queryFileName);
    const checker = program?.getTypeChecker();
    const node = sourceFile ? findDeepestNodeAtPosition(sourceFile, mappedPosition) : null;
    const prefix = getScopeCompletionPrefix(sourceText, position);

    if (node && checker) {
      const scopeSymbols = checker.getSymbolsInScope(
        node,
        ts.SymbolFlags.Value | ts.SymbolFlags.Type | ts.SymbolFlags.Namespace | ts.SymbolFlags.Alias,
      );

      for (const symbol of scopeSymbols) {
        const name = symbol.getName?.();
        if (!name || name.startsWith("__litsx_") || seen.has(name) || !name.startsWith(prefix)) {
          continue;
        }

        seen.add(name);
        mergedEntries.push({
          label: name,
          kind: getSymbolCompletionKind(ts, vscode, symbol),
          detail: "TypeScript symbol",
          documentation: "Project-backed TypeScript completion",
          start: position - prefix.length,
          length: prefix.length,
        });
      }
    }
  }

  return mergedEntries;
}

export {
  computeLitsxCompletions,
  computeLitsxDiagnostics,
  computeLitsxHover,
  computeLitsxProjectCompletions,
  computeLitsxProjectDiagnostics,
  computeLitsxProjectHover,
  getParserPlugins,
};
