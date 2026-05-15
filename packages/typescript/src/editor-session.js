import fs from "fs";
import path from "path";
import defaultTs from "typescript";

import {
  collectLitsxAuthoredDiagnostics,
  createToolingVirtualLitsxSource,
  decodeVirtualAttributeName,
  getLitsxAttributeCompletionNames,
  inferLitsxComponentEventNames,
  inferLitsxComponentPropNames,
  inferLitsxAttributeCompletionContext,
  inferLitsxAttributeInfoAtPosition,
  inferLitsxMarkupCompletionContext,
  inferLitsxStaticHoistInfoAtPosition,
  looksLikeLitsxJsx,
  mapOriginalPositionToToolingVirtual,
  remapToolingTextSpanToOriginal,
  getLitsxMarkupCompletionNames,
  remapVirtualText,
} from "./virtualization.js";

const QUERY_FILE_SUFFIX_BY_LANGUAGE_ID = {
  litsx: ".tsx",
  "litsx-jsx": ".jsx",
};

const SUPPORTED_SOURCE_EXTENSIONS = [
  ".litsx.jsx",
  ".litsx",
  ".tsx",
  ".ts",
  ".jsx",
  ".js",
];

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

function getParserPlugins(languageId) {
  return languageId === "litsx" ? ["typescript"] : [];
}

function isRelevantFile(fileName) {
  return /\.(jsx|tsx|litsx)$/.test(fileName) || fileName.endsWith(".litsx.jsx");
}

function getPluginsForFile(fileName, languageId) {
  return (languageId === "litsx" || /\.(tsx|litsx)$/.test(fileName ?? ""))
    ? ["typescript"]
    : [];
}

function createCompletionKindAdapter(adapter) {
  if (typeof adapter === "function") {
    return adapter;
  }

  if (adapter && typeof adapter === "object") {
    return (kind) => adapter[kind] ?? kind;
  }

  return (kind) => kind;
}

function createDefaultLogger(logger) {
  if (!logger) {
    return () => {};
  }

  if (typeof logger === "function") {
    return logger;
  }

  if (typeof logger.appendLine === "function") {
    return (message) => logger.appendLine(message);
  }

  return () => {};
}

function remapDisplayParts(parts) {
  return parts?.map((part) => ({
    ...part,
    text: remapVirtualText(part.text),
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

function remapCompletionTextChanges(textChanges, targetFileName, virtualization) {
  if (!Array.isArray(textChanges)) {
    return [];
  }

  return textChanges.map((change) => {
    const span = virtualization
      ? remapToolingTextSpanToOriginal(change.span, virtualization)
      : change.span;

    return {
      fileName: targetFileName,
      start: span.start,
      length: span.length,
      newText: change.newText,
    };
  });
}

function startsAtAuthoredSyntax(sourceText, start) {
  if (typeof sourceText !== "string" || typeof start !== "number" || !(start >= 0 && start < sourceText.length)) {
    return false;
  }

  return "@.?".includes(sourceText[start]);
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

function getCompletionKindToken(name) {
  return name.startsWith("@") ? "Event" : "Property";
}

function getContextualCompletionEdit(name, context) {
  const replacementStart = (context?.start ?? 0) + 1;
  const replacementLength = Math.max((context?.length ?? 1) - 1, 0);

  return {
    insertText: name.slice(1),
    filterText: name.slice(1),
    start: replacementStart,
    length: replacementLength,
  };
}

function getModuleExtension(ts, fileName) {
  if (fileName.endsWith(".litsx.jsx") || fileName.endsWith(".jsx")) {
    return ts.Extension.Jsx;
  }

  if (fileName.endsWith(".litsx") || fileName.endsWith(".tsx")) {
    return ts.Extension.Tsx;
  }

  if (fileName.endsWith(".ts")) {
    return ts.Extension.Ts;
  }

  return ts.Extension.Js;
}

function isPathLikeModuleName(moduleName) {
  return moduleName.startsWith("./") || moduleName.startsWith("../") || moduleName.startsWith("/");
}

function getTransparentResolutionCandidates(modulePath) {
  const requestedExtension = SUPPORTED_SOURCE_EXTENSIONS.find((extension) => modulePath.endsWith(extension)) ?? null;

  if (requestedExtension) {
    return [
      modulePath,
      path.join(modulePath, `index${requestedExtension}`),
    ];
  }

  return [
    ...SUPPORTED_SOURCE_EXTENSIONS.map((extension) => `${modulePath}${extension}`),
    ...SUPPORTED_SOURCE_EXTENSIONS.map((extension) => path.join(modulePath, `index${extension}`)),
  ];
}

function createResolvedModule(ts, resolvedFileName) {
  return {
    resolvedFileName,
    extension: getModuleExtension(ts, resolvedFileName),
    isExternalLibraryImport: false,
  };
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

function getSourceFileScriptKind(ts, fileName, languageId) {
  if (fileName.endsWith(".litsx.jsx") || languageId === "litsx-jsx" || fileName.endsWith(".jsx")) {
    return ts.ScriptKind.JSX;
  }

  if (fileName.endsWith(".litsx") || languageId === "litsx" || fileName.endsWith(".tsx")) {
    return ts.ScriptKind.TSX;
  }

  if (fileName.endsWith(".ts")) {
    return ts.ScriptKind.TS;
  }

  return ts.ScriptKind.JS;
}

function isCustomElementsDefineCall(ts, node) {
  return ts.isCallExpression(node)
    && ts.isPropertyAccessExpression(node.expression)
    && ts.isIdentifier(node.expression.expression)
    && node.expression.expression.text === "customElements"
    && node.expression.name.text === "define";
}

function isLikelyLitsxComponentReference(ts, sourceFile, node) {
  if (!ts.isIdentifier(node) || !/^[A-Z]/.test(node.text)) {
    return false;
  }

  let matches = false;

  function visit(current) {
    if (matches) {
      return;
    }

    if (
      ts.isImportDeclaration(current)
      && ts.isStringLiteral(current.moduleSpecifier)
      && (current.moduleSpecifier.text.endsWith(".litsx") || current.moduleSpecifier.text.endsWith(".litsx.jsx"))
    ) {
      const bindings = current.importClause?.namedBindings;
      if (bindings && ts.isNamedImports(bindings)) {
        matches = bindings.elements.some((element) => element.name.text === node.text);
      }
    }

    if (
      ts.isVariableDeclaration(current)
      && ts.isIdentifier(current.name)
      && current.name.text === node.text
      && (ts.isArrowFunction(current.initializer) || ts.isFunctionExpression(current.initializer))
    ) {
      matches = true;
    }

    if (ts.isFunctionDeclaration(current) && current.name?.text === node.text) {
      matches = true;
    }

    if (!matches) {
      current.forEachChild(visit);
    }
  }

  sourceFile.forEachChild(visit);
  return matches;
}

function shouldSuppressCustomElementConstructorDiagnostic(ts, sourceFile, diagnostic) {
  if (diagnostic.code !== 2345 || typeof diagnostic.start !== "number") {
    return false;
  }

  const node = findDeepestNodeAtPosition(sourceFile, diagnostic.start);
  let current = node;

  while (current && !isCustomElementsDefineCall(ts, current)) {
    current = current.parent ?? null;
  }

  if (!current || !isCustomElementsDefineCall(ts, current)) {
    return false;
  }

  const candidate = current.arguments?.[1];
  if (!candidate || diagnostic.start < candidate.getStart(sourceFile) || diagnostic.start >= candidate.getEnd()) {
    return false;
  }

  return isLikelyLitsxComponentReference(ts, sourceFile, candidate)
    && String(typeof diagnostic.messageText === "string" ? diagnostic.messageText : diagnostic.messageText?.messageText ?? "")
      .includes("CustomElementConstructor");
}

function getScopeCompletionPrefix(sourceText, position) {
  const match = /[A-Za-z0-9_$]*$/.exec(sourceText.slice(0, position));
  return match?.[0] ?? "";
}

function getJsxImportSourceExportEntries(service, ts, prefix, adaptKind, position) {
  if (!prefix) {
    return [];
  }

  const program = service.languageService.getProgram();
  const checker = program?.getTypeChecker();
  const jsxImportSource = program?.getCompilerOptions?.().jsxImportSource;

  if (!program || !checker || typeof jsxImportSource !== "string" || jsxImportSource.length === 0) {
    return [];
  }

  const moduleSourceFile = program.getSourceFiles().find((sourceFile) => (
    sourceFile.fileName.includes(`/node_modules/${jsxImportSource}/`)
    || sourceFile.fileName.includes(`/${jsxImportSource}/src/`)
  ));

  const moduleSymbol = moduleSourceFile?.symbol ?? null;
  if (!moduleSymbol) {
    return [];
  }

  const exportedSymbols = checker.getExportsOfModule(moduleSymbol);

  return exportedSymbols
    .filter((symbol) => {
      const name = symbol.getName?.();
      return typeof name === "string"
        && name.startsWith(prefix)
        && !isInternalCompletionName(name);
    })
    .map((symbol) => {
      const name = symbol.getName();
      return {
        label: name,
        kind: adaptKind(getSymbolCompletionKind(ts, symbol), {
          source: jsxImportSource,
          label: name,
        }),
        detail: "export",
        documentation: `From ${jsxImportSource}`,
        start: position - prefix.length,
        length: prefix.length,
      };
    });
}

function getSourceParserPlugins(fileName) {
  return /\.(litsx|tsx|ts)$/.test(fileName) ? ["typescript"] : [];
}

function getImportedComponentReference(ts, sourceFile, tagName) {
  let reference = null;

  sourceFile.forEachChild((node) => {
    if (
      reference ||
      !ts.isImportDeclaration(node) ||
      !ts.isStringLiteral(node.moduleSpecifier)
    ) {
      return;
    }

    const bindings = node.importClause?.namedBindings;
    if (!bindings || !ts.isNamedImports(bindings)) {
      return;
    }

    for (const element of bindings.elements) {
      if (element.name.text !== tagName) {
        continue;
      }

      reference = {
        exportName: element.propertyName?.text ?? element.name.text,
        moduleName: node.moduleSpecifier.text,
      };
      return;
    }
  });

  return reference;
}

function getComponentEventCompletionEntries(service, ts, queryFileName, sourceText, position, adaptKind) {
  const context = inferLitsxAttributeCompletionContext(sourceText, position);
  if (!context || context.prefix !== "@" || !/^[A-Z]/.test(context.tagName)) {
    return [];
  }

  const program = service.languageService.getProgram();
  const sourceFile = program?.getSourceFile(queryFileName);
  if (!sourceFile) {
    return [];
  }

  const reference = getImportedComponentReference(ts, sourceFile, context.tagName);
  if (!reference) {
    return [];
  }

  const resolvedModule = service.resolveModuleName?.(reference.moduleName, queryFileName);
  const componentFileName = resolvedModule?.resolvedFileName;
  if (!componentFileName) {
    return [];
  }

  const componentSourceText = service.readSourceText?.(componentFileName);
  if (typeof componentSourceText !== "string") {
    return [];
  }

  const eventNames = inferLitsxComponentEventNames(componentSourceText, {
    plugins: getSourceParserPlugins(componentFileName),
  })[reference.exportName] ?? [];

  return eventNames
    .filter((name) => typeof name === "string" && name.startsWith(context.partialName))
    .map((name) => ({
      ...getContextualCompletionEdit(`@${name}`, context),
      label: `@${name}`,
      kind: adaptKind("Event", {
        source: "litsx-component-event",
        label: `@${name}`,
      }),
      detail: `Emitted by <${context.tagName}>`,
      documentation: `LitSX custom event emitted by <${context.tagName}>.`,
    }));
}

function getComponentStaticPropCompletionEntries(service, ts, queryFileName, sourceText, position, adaptKind) {
  const markupContext = inferLitsxMarkupCompletionContext(sourceText, position);
  if (!markupContext || !/^[A-Z]/.test(markupContext.tagName)) {
    return [];
  }

  const program = service.languageService.getProgram();
  const sourceFile = program?.getSourceFile(queryFileName);
  if (!sourceFile) {
    return [];
  }

  const reference = getImportedComponentReference(ts, sourceFile, markupContext.tagName);
  if (!reference) {
    return [];
  }

  const resolvedModule = service.resolveModuleName?.(reference.moduleName, queryFileName);
  const componentFileName = resolvedModule?.resolvedFileName;
  if (!componentFileName) {
    return [];
  }

  const componentSourceText = service.readSourceText?.(componentFileName);
  if (typeof componentSourceText !== "string") {
    return [];
  }

  const propNames = inferLitsxComponentPropNames(componentSourceText, {
    plugins: getSourceParserPlugins(componentFileName),
  })[reference.exportName] ?? [];

  return propNames
    .filter((name) => typeof name === "string" && name.startsWith(markupContext.partialName))
    .map((name) => ({
      label: name,
      kind: adaptKind("Property", {
        source: "litsx-component-static-prop",
        label: name,
      }),
      detail: `Static property of <${markupContext.tagName}>`,
      documentation: `LitSX static property exposed by <${markupContext.tagName}>.`,
      start: markupContext.start,
      length: markupContext.length,
    }));
}

function getCompletionEntryImportEdits(languageService, queryFileName, fileName, position, entry, virtualization) {
  if (typeof languageService.getCompletionEntryDetails !== "function" || !entry?.hasAction) {
    return [];
  }

  let details;
  try {
    details = languageService.getCompletionEntryDetails(
      queryFileName,
      position,
      entry.name,
      {},
      entry.source,
      {},
      entry.data,
    );
  } catch {
    return [];
  }

  const fileChanges = details?.codeActions
    ?.flatMap((action) => action.changes ?? [])
    ?.filter((change) => change.fileName === queryFileName || change.fileName === fileName) ?? [];

  return fileChanges.flatMap((change) => (
    remapCompletionTextChanges(change.textChanges, fileName, virtualization)
  ));
}

function isInternalCompletionName(name) {
  return typeof name === "string" && (
    name.startsWith("__litsx_") ||
    name.startsWith("_$L") ||
    name.startsWith("_currentTarget") ||
    name.includes("$")
  );
}

function isLikelyIntrinsicMarkupCompletionName(name) {
  if (
    typeof name !== "string" ||
    name.length === 0 ||
    isInternalCompletionName(name) ||
    name.startsWith("_") ||
    /^[A-Z0-9_]+$/.test(name) ||
    /^[A-Z]/.test(name) ||
    /^on[a-z]/.test(name) ||
    /(Element|Elements|Node|Nodes)$/.test(name)
  ) {
    return false;
  }

  return /^[a-z][\w-]*$/.test(name) || /^aria[A-Z]/.test(name);
}

function isLikelyComponentPropCompletionName(name) {
  return typeof name === "string"
    && name.length > 0
    && !isInternalCompletionName(name)
    && !name.startsWith("_")
    && !/^[A-Z]/.test(name)
    && !name.includes("$")
    && /^[a-z][\w-]*$/.test(name);
}

function rankCompletionLabel(label, prefix) {
  const normalizedLabel = String(label ?? "").toLowerCase();
  const normalizedPrefix = prefix.toLowerCase();

  if (normalizedPrefix.length === 0) {
    return 3;
  }

  if (normalizedLabel === normalizedPrefix) {
    return 0;
  }

  if (normalizedLabel.startsWith(normalizedPrefix)) {
    return 1;
  }

  if (normalizedLabel.includes(normalizedPrefix)) {
    return 2;
  }

  return 3;
}

function compareCompletionEntries(left, right, prefix) {
  const leftLabel = String(left.label ?? "");
  const rightLabel = String(right.label ?? "");
  const leftRank = rankCompletionLabel(leftLabel, prefix);
  const rightRank = rankCompletionLabel(rightLabel, prefix);

  if (leftRank !== rightRank) {
    return leftRank - rightRank;
  }

  const leftIsLitsxApi = left.documentation === "From @litsx/core";
  const rightIsLitsxApi = right.documentation === "From @litsx/core";

  if (leftIsLitsxApi !== rightIsLitsxApi) {
    return leftIsLitsxApi ? -1 : 1;
  }

  if (prefix.toLowerCase().startsWith("use")) {
    const leftStartsWithUse = leftLabel.startsWith("use");
    const rightStartsWithUse = rightLabel.startsWith("use");
    if (leftStartsWithUse !== rightStartsWithUse) {
      return leftStartsWithUse ? -1 : 1;
    }
  }

  return leftLabel.localeCompare(rightLabel);
}

function getSymbolCompletionKind(ts, symbol) {
  return SYMBOL_KIND_RULES.find(([, getMask]) => (symbol.flags & getMask(ts)) !== 0)?.[0] ?? "Variable";
}

function createLitsxEditorSession(options = {}) {
  const ts = options.typescript ?? defaultTs;
  const bundledLibDir = options.bundledLibDir ?? null;
  const trace = createDefaultLogger(options.logger);
  const projectServiceCache = new Map();

  function log(message) {
    if (!options.trace) {
      return;
    }
    trace(message);
  }

  function getDefaultLibFilePath(localTs, compilerOptions) {
    if (!bundledLibDir) {
      return localTs.getDefaultLibFilePath(compilerOptions);
    }

    const libFileName = localTs.getDefaultLibFileName(compilerOptions);
    const candidate = path.join(bundledLibDir, libFileName);
    return fs.existsSync(candidate) ? candidate : localTs.getDefaultLibFilePath(compilerOptions);
  }

  function getProjectKey(fileName) {
    const configPath =
      ts.findConfigFile(path.dirname(fileName), ts.sys.fileExists, "tsconfig.json") ??
      ts.findConfigFile(path.dirname(fileName), ts.sys.fileExists, "jsconfig.json");
    return configPath ? normalizeFileName(configPath) : `<standalone>:${normalizeFileName(fileName)}`;
  }

  function getQueryFileName(fileName, languageId) {
    return `${fileName}${QUERY_FILE_SUFFIX_BY_LANGUAGE_ID[languageId] ?? ""}`;
  }

  function getExtraFileExtensions(localTs) {
    return [
      {
        extension: ".litsx",
        isMixedContent: false,
        scriptKind: localTs.ScriptKind.TSX,
      },
      {
        extension: ".litsx.jsx",
        isMixedContent: false,
        scriptKind: localTs.ScriptKind.JSX,
      },
    ];
  }

  function getFileVersion(fileName) {
    try {
      const stats = fs.statSync(fileName);
      return `${stats.mtimeMs}:${stats.size}`;
    } catch {
      return "0";
    }
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

  function getOrCreateProjectService(fileName, sourceText, languageId) {
    const projectKey = getProjectKey(fileName);
    const queryFileName = getQueryFileName(fileName, languageId);
    let service = projectServiceCache.get(projectKey);

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

      function fileExistsForResolution(nextFileName) {
        return overlays.has(normalizeFileName(nextFileName)) || ts.sys.fileExists(nextFileName);
      }

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

        if (isRelevantFile(nextFileName) && looksLikeLitsxJsx(nextSourceText)) {
          virtualization = createToolingVirtualLitsxSource(nextSourceText, {
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

      function resolveTransparentModuleName(moduleName, containingFile) {
        if (!isPathLikeModuleName(moduleName)) {
          return null;
        }

        const candidateBase = path.resolve(path.dirname(containingFile), moduleName);
        for (const candidate of getTransparentResolutionCandidates(candidateBase)) {
          if (fileExistsForResolution(candidate)) {
            return createResolvedModule(ts, candidate);
          }
        }

        return null;
      }

      function resolveModule(moduleName, containingFile) {
        const resolved = ts.resolveModuleName(
          moduleName,
          containingFile,
          compilerOptions,
          {
            fileExists: fileExistsForResolution,
            readFile(nextFileName) {
              return readFileText(nextFileName, overlays);
            },
            directoryExists(nextDirName) {
              return ts.sys.directoryExists?.(nextDirName) ?? true;
            },
            getDirectories(nextDirName) {
              return ts.sys.getDirectories?.(nextDirName) ?? [];
            },
            realpath(nextFileName) {
              return ts.sys.realpath?.(nextFileName) ?? nextFileName;
            },
          },
        ).resolvedModule;

        return resolved ?? resolveTransparentModuleName(moduleName, containingFile);
      }

      const host = {
        extraFileExtensions: getExtraFileExtensions(ts),
        getCompilationSettings() {
          return compilerOptions;
        },
        getCurrentDirectory() {
          return configPath ? path.dirname(configPath) : path.dirname(fileName);
        },
        getDefaultLibFileName(optionsForLib) {
          return getDefaultLibFilePath(ts, optionsForLib);
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
          return fileExistsForResolution(nextFileName);
        },
        readFile(nextFileName) {
          return readFileText(nextFileName, overlays);
        },
        resolveModuleNames(moduleNames, containingFile) {
          return moduleNames.map((moduleName) => resolveModule(moduleName, containingFile));
        },
        resolveModuleNameLiterals(moduleLiterals, containingFile) {
          return moduleLiterals.map(({ text }) => ({ resolvedModule: resolveModule(text, containingFile) }));
        },
        readDirectory(...args) {
          return ts.sys.readDirectory(...args);
        },
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
      };

      service = {
        rootNames,
        overlays,
        languageService: ts.createLanguageService(host, ts.createDocumentRegistry()),
        readSourceText(nextFileName) {
          return readFileText(nextFileName, overlays);
        },
        resolveModuleName(moduleName, containingFile) {
          return resolveModule(moduleName, containingFile);
        },
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

      projectServiceCache.set(projectKey, service);
    }

    service.setOverlay(queryFileName, sourceText);
    service.queryFileName = queryFileName;
    return service;
  }

  function getDiagnostics(fileName, sourceText, languageId) {
    const service = getOrCreateProjectService(fileName, sourceText, languageId);
    const queryFileName = service.queryFileName ?? fileName;
    const virtualization = service.getVirtualization(queryFileName);
    const authoredSourceFile = ts.createSourceFile(
      fileName,
      sourceText,
      ts.ScriptTarget.Latest,
      true,
      getSourceFileScriptKind(ts, fileName, languageId),
    );
    const diagnostics = [
      ...service.languageService.getSyntacticDiagnostics(queryFileName),
      ...service.languageService.getSemanticDiagnostics(queryFileName),
    ];
    const remappedDiagnostics = diagnostics
      .map((diagnostic) => {
        if (!virtualization || typeof diagnostic.start !== "number") {
          return {
            ...diagnostic,
            messageText: remapMessageText(diagnostic.messageText),
          };
        }

        const remappedSpan = remapToolingTextSpanToOriginal(
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
          messageText: remapMessageText(diagnostic.messageText),
        };
      })
      .filter((diagnostic) => (
        !String(diagnostic.messageText ?? "").includes("__litsx_") &&
        !startsAtAuthoredSyntax(sourceText, diagnostic.start) &&
        !shouldSuppressCustomElementConstructorDiagnostic(ts, authoredSourceFile, diagnostic)
      ));

    const authoredDiagnostics = collectLitsxAuthoredDiagnostics(sourceText, ts, {
      plugins: getParserPlugins(languageId),
    });
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

  function getHover(fileName, sourceText, languageId, position) {
    const service = getOrCreateProjectService(fileName, sourceText, languageId);
    const queryFileName = service.queryFileName ?? fileName;
    const virtualization = service.getVirtualization(queryFileName);
    const mappedPosition = virtualization
      ? mapOriginalPositionToToolingVirtual(position, virtualization)
      : position;
    const info = service.languageService.getQuickInfoAtPosition(queryFileName, mappedPosition);

    const hoistInfo = inferLitsxStaticHoistInfoAtPosition(sourceText, position);
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
        const bindingHoverInfo = getBindingHoverInfo(
          inferLitsxAttributeInfoAtPosition(sourceText, position),
        );
        return bindingHoverInfo
          ? {
            start: bindingHoverInfo.start,
            length: bindingHoverInfo.length,
            code: `${bindingHoverInfo.name}: ${bindingHoverInfo.kindLabel}`,
            documentation: bindingHoverInfo.detail,
          }
          : null;
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
          ? remapToolingTextSpanToOriginal(
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

      const bindingHoverInfo = getBindingHoverInfo(
        inferLitsxAttributeInfoAtPosition(sourceText, position),
      );
      return bindingHoverInfo
        ? {
          start: bindingHoverInfo.start,
          length: bindingHoverInfo.length,
          code: `${bindingHoverInfo.name}: ${bindingHoverInfo.kindLabel}`,
          documentation: bindingHoverInfo.detail,
        }
        : null;
    }

    const remappedSpan = virtualization
      ? remapToolingTextSpanToOriginal(info.textSpan, virtualization)
      : info.textSpan;
    const displayText = (remapDisplayParts(info.displayParts) ?? [])
      .map((entry) => entry.text)
      .join("");
    const documentation = (remapDisplayParts(info.documentation) ?? [])
      .map((entry) => entry.text)
      .join("");

    return {
      start: remappedSpan.start,
      length: remappedSpan.length,
      code: displayText || "symbol",
      documentation,
    };
  }

  function getCompletions(fileName, sourceText, languageId, position, completionKindAdapter) {
    const adaptKind = createCompletionKindAdapter(completionKindAdapter);
    const service = getOrCreateProjectService(fileName, sourceText, languageId);
    const queryFileName = service.queryFileName ?? fileName;
    const virtualization = service.getVirtualization(queryFileName);
    const mappedPosition = virtualization
      ? mapOriginalPositionToToolingVirtual(position, virtualization)
      : position;
    const completions = service.languageService.getCompletionsAtPosition(queryFileName, mappedPosition, {
      includeCompletionsForModuleExports: true,
      includeCompletionsWithInsertText: true,
    });
    const rawCompletionEntriesByName = new Map(
      (completions?.entries ?? []).map((entry) => [entry.name, entry]),
    );

    const context = inferLitsxAttributeCompletionContext(sourceText, position);
    const markupContext = inferLitsxMarkupCompletionContext(sourceText, position);
    const isComponentTag = /^[A-Z]/.test(markupContext?.tagName ?? "");
    const contextualEntries = context
      ? getLitsxAttributeCompletionNames(context).map((name) => ({
        ...getContextualCompletionEdit(name, context),
        label: name,
        kind: adaptKind(getCompletionKindToken(name), {
          source: "litsx",
          label: name,
        }),
        detail: "LitSX binding",
        documentation: `LitSX binding for <${context.tagName}>.`,
      }))
      : [];
    const componentEventEntries = getComponentEventCompletionEntries(
      service,
      ts,
      queryFileName,
      sourceText,
      position,
      adaptKind,
    ).filter((entry) => !contextualEntries.some((contextualEntry) => contextualEntry.label === entry.label));
    const componentStaticPropEntries = getComponentStaticPropCompletionEntries(
      service,
      ts,
      queryFileName,
      sourceText,
      position,
      adaptKind,
    );
    const markupEntries = markupContext && !isComponentTag
      ? getLitsxMarkupCompletionNames(markupContext).map((name) => ({
        label: name,
        kind: adaptKind(
          name.startsWith("@")
            ? "Event"
            : name.startsWith(".") || name.startsWith("?")
              ? "Property"
              : "Property",
          {
            source: "litsx-markup",
            label: name,
          },
        ),
        detail: name.startsWith("@")
          ? "LitSX event binding"
          : name.startsWith(".")
            ? "LitSX property binding"
            : name.startsWith("?")
              ? "LitSX boolean attribute binding"
              : "LitSX markup attribute",
        documentation: name.startsWith("@") || name.startsWith(".") || name.startsWith("?")
          ? `LitSX binding for <${markupContext.tagName}>.`
          : `LitSX-authored attribute for <${markupContext.tagName}>.`,
        start: markupContext.start,
        length: markupContext.length,
      }))
      : [];
    const scopePrefix = getScopeCompletionPrefix(sourceText, position);
    const jsxImportSourceEntries = markupContext
      ? []
      : getJsxImportSourceExportEntries(service, ts, scopePrefix, adaptKind, position).map((entry) => ({
        ...entry,
        additionalTextEdits: getCompletionEntryImportEdits(
          service.languageService,
          queryFileName,
          fileName,
          mappedPosition,
          rawCompletionEntriesByName.get(entry.label),
          virtualization,
        ),
      }));

    const mergedEntries = [
      ...contextualEntries,
      ...componentEventEntries,
      ...componentStaticPropEntries,
      ...markupEntries,
      ...jsxImportSourceEntries,
    ];
    const seen = new Set(mergedEntries.map((entry) => entry.label));

    for (const entry of completions?.entries ?? []) {
      if (
        decodeVirtualAttributeName(entry.name) ||
        seen.has(entry.name) ||
        isInternalCompletionName(entry.name)
      ) {
        continue;
      }

      if (markupContext && !isComponentTag && !isLikelyIntrinsicMarkupCompletionName(entry.name)) {
        continue;
      }

      if (markupContext && isComponentTag && !isLikelyComponentPropCompletionName(entry.name)) {
        continue;
      }

      seen.add(entry.name);

      const remappedSpan = virtualization && entry.replacementSpan
        ? remapToolingTextSpanToOriginal(entry.replacementSpan, virtualization)
        : entry.replacementSpan ?? { start: position, length: 0 };

      const kindToken = COMPLETION_KIND_BY_TS_KIND[entry.kind] ?? "Text";
      mergedEntries.push({
        label: entry.name,
        kind: adaptKind(kindToken, {
          source: "typescript",
          label: entry.name,
          tsKind: entry.kind,
          kindModifiers: entry.kindModifiers,
        }),
        detail: entry.kindModifiers || entry.kind,
        documentation: entry.source ? `From ${entry.source}` : "TypeScript completion",
        start: remappedSpan.start,
        length: remappedSpan.length,
        additionalTextEdits: getCompletionEntryImportEdits(
          service.languageService,
          queryFileName,
          fileName,
          mappedPosition,
          entry,
          virtualization,
        ),
      });
    }

    if (mergedEntries.length === (contextualEntries.length + componentEventEntries.length + componentStaticPropEntries.length)) {
      const program = service.languageService.getProgram();
      const sourceFile = program?.getSourceFile(queryFileName);
      const checker = program?.getTypeChecker();
      const node = sourceFile ? findDeepestNodeAtPosition(sourceFile, mappedPosition) : null;
      const prefix = scopePrefix;

      if (node && checker && !markupContext) {
        const scopeSymbols = checker.getSymbolsInScope(
          node,
          ts.SymbolFlags.Value | ts.SymbolFlags.Type | ts.SymbolFlags.Namespace | ts.SymbolFlags.Alias,
        );

        for (const symbol of scopeSymbols) {
          const name = symbol.getName?.();
          if (!name || isInternalCompletionName(name) || seen.has(name) || !name.startsWith(prefix)) {
            continue;
          }

          seen.add(name);
          const kindToken = getSymbolCompletionKind(ts, symbol);
          mergedEntries.push({
            label: name,
            kind: adaptKind(kindToken, {
              source: "typescript-scope",
              label: name,
            }),
            detail: "TypeScript symbol",
            documentation: "Project-backed TypeScript completion",
            start: position - prefix.length,
            length: prefix.length,
          });
        }
      }
    }

    if (markupContext) {
      return mergedEntries;
    }

    return mergedEntries.sort((left, right) => (
      compareCompletionEntries(left, right, scopePrefix)
    ));
  }

  log("LitSX editor session initialized");

  return {
    typescript: ts,
    bundledLibDir,
    getDiagnostics,
    getHover,
    getCompletions,
    clear() {
      projectServiceCache.clear();
    },
  };
}

export {
  createLitsxEditorSession,
};
