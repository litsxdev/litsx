import { createRuntimeHooksTransform } from "@litsx/babel-plugin-shared-hooks";
import fs from "node:fs";
import path from "node:path";
import traverse from "@babel/traverse";
import parser from "@litsx/babel-parser";
import { ensureTypescriptModule } from "./transform-litsx-properties.js";

const RUNTIME_MODULE = "@litsx/core";
const IMPORT_SOURCES = [RUNTIME_MODULE];

const RUNTIME_HELPERS = [
  "useOnConnect",
  "useAfterUpdate",
  "useOnCommit",
  "useMemoValue",
  "useStableCallback",
  "useEvent",
  "useEmit",
  "usePrevious",
  "useReducedState",
  "useState",
  "useControlledState",
  "useAsyncState",
  "useOptimistic",
  "useExpose",
  "useExternalStore",
  "useHost",
  "useHostContent",
  "useSlot",
  "useTextContent",
  "useTransition",
  "useDeferredValue",
  "useStyle",
  "useRef",
  "useCallbackRef",
  "useStableId",
];

const SOURCE_EXTENSIONS = [
  "",
  ".litsx",
  ".tsx",
  ".ts",
  ".jsx",
  ".js",
  ".mjs",
  ".cjs",
];
const DEFAULT_MODULE_RESOLUTION_OPTIONS = {
  moduleResolution: 100,
  allowJs: true,
  checkJs: false,
  jsx: 1,
  target: 99,
  module: 99,
  esModuleInterop: true,
  allowSyntheticDefaultImports: true,
};

function normalizeFilePath(value) {
  return normalizePath(value);
}

function getTraverse() {
  return traverse.default || traverse;
}

function normalizeInMemoryFiles(files) {
  const normalized = new Map();
  if (!files || typeof files !== "object") {
    return normalized;
  }
  for (const [filename, source] of Object.entries(files)) {
    if (typeof source !== "string") continue;
    normalized.set(normalizeFilePath(filename), source);
  }
  return normalized;
}

function createStructuralHookResolver(options = {}) {
  const inMemoryFiles = normalizeInMemoryFiles(options.inMemoryFiles);
  const moduleCache = new Map();
  const resolvedImportCache = new Map();
  const providedTypescriptSession =
    options?.typescriptSession?.projectSession || options?.typescriptSession || null;
  const compilerOptionsCache = new Map();
  const moduleResolutionHostCache = new Map();

  function getProgramForFile(filename) {
    if (!providedTypescriptSession?.getProgram || !filename) {
      return null;
    }

    try {
      if (providedTypescriptSession.kind === "project") {
        return providedTypescriptSession.getProgram();
      }
      if (providedTypescriptSession.kind === "standalone") {
        return providedTypescriptSession.getProgram(normalizeFilePath(filename));
      }
    } catch {
      return null;
    }

    return null;
  }

  function getCompilerOptions(filename) {
    const cacheKey = normalizeFilePath(filename);
    if (compilerOptionsCache.has(cacheKey)) {
      return compilerOptionsCache.get(cacheKey);
    }
    const program = getProgramForFile(filename);
    const compilerOptions =
      program?.getCompilerOptions?.() ||
      options.compilerOptions ||
      DEFAULT_MODULE_RESOLUTION_OPTIONS;
    compilerOptionsCache.set(cacheKey, compilerOptions);
    return compilerOptions;
  }

  function getModuleResolutionHost(filename) {
    const cacheKey = normalizeFilePath(filename);
    if (moduleResolutionHostCache.has(cacheKey)) {
      return moduleResolutionHostCache.get(cacheKey);
    }
    const ts = ensureTypescriptModule();
    const host = providedTypescriptSession?.host || ts.sys;
    moduleResolutionHostCache.set(cacheKey, host);
    return host;
  }

  function fileExists(filename) {
    const normalized = normalizeFilePath(filename);
    return inMemoryFiles.has(normalized) || fs.existsSync(normalized);
  }

  function readFile(filename) {
    const normalized = normalizeFilePath(filename);
    if (inMemoryFiles.has(normalized)) {
      return inMemoryFiles.get(normalized);
    }
    try {
      return fs.readFileSync(normalized, "utf8");
    } catch {
      return null;
    }
  }

  function resolveWithExtensions(base) {
    const normalizedBase = normalizeFilePath(base);
    for (const ext of SOURCE_EXTENSIONS) {
      const candidate = `${normalizedBase}${ext}`;
      if (fileExists(candidate)) {
        return normalizeFilePath(candidate);
      }
    }
    for (const ext of SOURCE_EXTENSIONS.filter(Boolean)) {
      const candidate = normalizeFilePath(path.join(base, `index${ext}`));
      if (fileExists(candidate)) {
        return candidate;
      }
    }
    return null;
  }

  function resolvePathAlias(containingFile, source) {
    const compilerOptions = getCompilerOptions(containingFile) || {};
    const baseUrl = compilerOptions.baseUrl
      ? normalizeFilePath(
          path.isAbsolute(compilerOptions.baseUrl)
            ? compilerOptions.baseUrl
            : path.resolve(path.dirname(containingFile), compilerOptions.baseUrl)
        )
      : normalizeFilePath(path.dirname(containingFile));
    const pathMappings = compilerOptions.paths || {};

    for (const [pattern, substitutions] of Object.entries(pathMappings)) {
      const starIndex = pattern.indexOf("*");
      const isStarPattern = starIndex !== -1;
      const prefix = isStarPattern ? pattern.slice(0, starIndex) : pattern;
      const suffix = isStarPattern ? pattern.slice(starIndex + 1) : "";

      if (isStarPattern) {
        if (!source.startsWith(prefix) || !source.endsWith(suffix)) {
          continue;
        }
      } else if (source !== pattern) {
        continue;
      }

      const wildcardValue = isStarPattern
        ? source.slice(prefix.length, source.length - suffix.length)
        : "";

      for (const substitution of substitutions || []) {
        const substituted = isStarPattern
          ? substitution.replace("*", wildcardValue)
          : substitution;
        const candidateBase = path.isAbsolute(substituted)
          ? substituted
          : path.join(baseUrl, substituted);
        const resolved = resolveWithExtensions(candidateBase);
        if (resolved) {
          return resolved;
        }
      }
    }

    return null;
  }

  function resolveImport(containingFile, source) {
    if (typeof source !== "string" || !containingFile) {
      return null;
    }
    const cacheKey = `${normalizeFilePath(containingFile)}::${source}`;
    if (resolvedImportCache.has(cacheKey)) {
      return resolvedImportCache.get(cacheKey);
    }

    const baseDir = path.dirname(containingFile);
    let resolved = source.startsWith(".") || source.startsWith("/")
      ? resolveWithExtensions(path.resolve(baseDir, source))
      : resolvePathAlias(containingFile, source);

    if (!resolved) {
      const ts = ensureTypescriptModule();
      try {
        const resolution = ts.resolveModuleName(
          source,
          normalizeFilePath(containingFile),
          getCompilerOptions(containingFile),
          getModuleResolutionHost(containingFile)
        );
        const resolvedFileName = resolution?.resolvedModule?.resolvedFileName;
        if (resolvedFileName) {
          resolved = resolveWithExtensions(resolvedFileName) || normalizeFilePath(resolvedFileName);
        }
      } catch {
        resolved = null;
      }
    }

    resolvedImportCache.set(cacheKey, resolved);
    return resolved;
  }

  function getParserPluginsForModule(filename, source) {
    if (/\.(?:[cm]?ts|tsx|litsx)$/i.test(filename)) {
      return ["typescript"];
    }
    if (/\b(?:as|satisfies)\s+[^;,)]+/.test(source)) {
      return ["typescript"];
    }
    return [];
  }

  function getImportedName(specifier) {
    if (specifier.type === "ImportDefaultSpecifier") return "default";
    if (specifier.type === "ImportNamespaceSpecifier") return "*";
    return specifier.imported?.name ?? specifier.imported?.value ?? null;
  }

  function isDefineHookCallee(node, analysis) {
    if (!node) return false;
    if (node.type === "Identifier") {
      return analysis.defineHookLocals.has(node.name);
    }
    if (
      node.type === "MemberExpression" &&
      !node.computed &&
      node.property?.type === "Identifier" &&
      node.property.name === "defineHook" &&
      node.object?.type === "Identifier"
    ) {
      return analysis.runtimeNamespaceLocals.has(node.object.name);
    }
    return false;
  }

  function addExportBinding(analysis, exportedName, info) {
    if (exportedName) {
      analysis.exportBindings.set(exportedName, info);
    }
  }

  function analyzeModule(filename) {
    const normalizedFilename = normalizeFilePath(filename);
    if (!normalizedFilename) return null;
    if (moduleCache.has(normalizedFilename)) {
      return moduleCache.get(normalizedFilename);
    }

    const source = readFile(normalizedFilename);
    if (typeof source !== "string") {
      moduleCache.set(normalizedFilename, null);
      return null;
    }

    const analysis = {
      filename: normalizedFilename,
      importBindings: new Map(),
      exportBindings: new Map(),
      defineHookLocals: new Set(),
      runtimeNamespaceLocals: new Set(),
      structuralLocals: new Set(),
      customHookPaths: new Map(),
      customHookUsageCache: new Map(),
    };
    moduleCache.set(normalizedFilename, analysis);

    let ast;
    try {
      ast = parser.parse(source, {
        sourceType: "module",
        plugins: getParserPluginsForModule(normalizedFilename, source),
      });
    } catch {
      moduleCache.set(normalizedFilename, null);
      return null;
    }

    getTraverse()(ast, {
      Program(programPath) {
        for (const statementPath of programPath.get("body")) {
          const node = statementPath.node;

          if (statementPath.isImportDeclaration()) {
            const sourceValue = node.source.value;
            const resolvedSource = resolveImport(normalizedFilename, sourceValue);
            for (const specifier of node.specifiers) {
              const localName = specifier.local?.name;
              if (!localName) continue;
              const importedName = getImportedName(specifier);
              analysis.importBindings.set(localName, {
                importedName,
                source: sourceValue,
                resolvedSource,
              });
              if (sourceValue === RUNTIME_MODULE && importedName === "defineHook") {
                analysis.defineHookLocals.add(localName);
              }
              if (
                sourceValue === RUNTIME_MODULE &&
                (specifier.type === "ImportNamespaceSpecifier" ||
                  specifier.type === "ImportDefaultSpecifier")
              ) {
                analysis.runtimeNamespaceLocals.add(localName);
              }
            }
            continue;
          }

          const declarationPath = statementPath.isExportNamedDeclaration()
            ? statementPath.get("declaration")
            : statementPath;

          if (declarationPath?.isFunctionDeclaration?.()) {
            const localName = declarationPath.node.id?.name;
            if (localName && /^use[A-Z0-9]/.test(localName)) {
              analysis.customHookPaths.set(localName, declarationPath);
            }
          }

          if (declarationPath?.isVariableDeclaration?.()) {
            for (const declaratorPath of declarationPath.get("declarations")) {
              const id = declaratorPath.node.id;
              if (id?.type !== "Identifier") continue;
              const init = declaratorPath.node.init;
              if (init?.type === "CallExpression" && isDefineHookCallee(init.callee, analysis)) {
                analysis.structuralLocals.add(id.name);
              } else if (
                /^use[A-Z0-9]/.test(id.name) &&
                (
                  init?.type === "FunctionExpression" ||
                  init?.type === "ArrowFunctionExpression"
                )
              ) {
                analysis.customHookPaths.set(id.name, declaratorPath.get("init"));
              }
            }
          }

          if (statementPath.isExportNamedDeclaration()) {
            const exportNode = statementPath.node;
            const declaration = exportNode.declaration;
            if (declaration?.type === "VariableDeclaration") {
              for (const declarator of declaration.declarations) {
                const localName = declarator.id?.name;
                if (localName) {
                  addExportBinding(analysis, localName, { localName });
                }
              }
            } else if (
              declaration?.type === "FunctionDeclaration" ||
              declaration?.type === "ClassDeclaration"
            ) {
              addExportBinding(analysis, declaration.id?.name, {
                localName: declaration.id?.name,
              });
            }

            for (const specifier of exportNode.specifiers) {
              const exportedName = specifier.exported?.name ?? specifier.exported?.value ?? null;
              if (!exportedName) continue;
              const localName = specifier.local?.name ?? specifier.local?.value ?? exportedName;
              if (exportNode.source?.value) {
                addExportBinding(analysis, exportedName, {
                  importedName: localName,
                  resolvedSource: resolveImport(normalizedFilename, exportNode.source.value),
                });
              } else {
                addExportBinding(analysis, exportedName, { localName });
              }
            }
          }
        }
      },
    });

    return analysis;
  }

  function isNamespaceStructuralUse(analysis, objectName, propertyName, seen) {
    const importInfo = analysis.importBindings.get(objectName);
    if (!importInfo?.resolvedSource || importInfo.importedName !== "*") {
      return false;
    }
    const importedModule = analyzeModule(importInfo.resolvedSource);
    return (
      isStructuralExport(importedModule, propertyName, seen) ||
      isStructuralCustomExport(importedModule, propertyName, seen)
    );
  }

  function localCustomHookUsesStructural(analysis, localName, seen = new Set()) {
    if (!analysis || !localName) return false;
    const key = `${analysis.filename}:local:${localName}`;
    if (analysis.customHookUsageCache.has(localName)) {
      return analysis.customHookUsageCache.get(localName);
    }
    if (seen.has(key)) return false;
    const nextSeen = new Set(seen);
    nextSeen.add(key);

    const fnPath = analysis.customHookPaths.get(localName);
    if (!fnPath?.traverse) {
      analysis.customHookUsageCache.set(localName, false);
      return false;
    }

    let usesStructural = false;
    fnPath.traverse({
      CallExpression(callPath) {
        if (usesStructural) {
          callPath.stop();
          return;
        }
        const callee = callPath.get("callee");
        if (callee.isIdentifier()) {
          const name = callee.node.name;
          if (analysis.structuralLocals.has(name)) {
            usesStructural = true;
            callPath.stop();
            return;
          }
          if (
            analysis.customHookPaths.has(name) &&
            localCustomHookUsesStructural(analysis, name, nextSeen)
          ) {
            usesStructural = true;
            callPath.stop();
            return;
          }
          const importInfo = analysis.importBindings.get(name);
          if (importInfo?.resolvedSource && importInfo.importedName !== "*") {
            const importedModule = analyzeModule(importInfo.resolvedSource);
            if (
              isStructuralExport(importedModule, importInfo.importedName, nextSeen) ||
              isStructuralCustomExport(importedModule, importInfo.importedName, nextSeen)
            ) {
              usesStructural = true;
              callPath.stop();
            }
          }
          return;
        }

        if (callee.isMemberExpression({ computed: false })) {
          const object = callee.get("object");
          const property = callee.get("property");
          if (
            object.isIdentifier() &&
            property.isIdentifier() &&
            isNamespaceStructuralUse(analysis, object.node.name, property.node.name, nextSeen)
          ) {
            usesStructural = true;
            callPath.stop();
          }
        }
      },
    });

    analysis.customHookUsageCache.set(localName, usesStructural);
    return usesStructural;
  }

  function isStructuralExport(analysis, exportedName, seen = new Set()) {
    if (!analysis || !exportedName) return false;
    const key = `${analysis.filename}:${exportedName}`;
    if (seen.has(key)) return false;
    const nextSeen = new Set(seen);
    nextSeen.add(key);

    const exportInfo = analysis.exportBindings.get(exportedName);
    if (!exportInfo) {
      return false;
    }

    if (exportInfo.resolvedSource) {
      return isStructuralExport(
        analyzeModule(exportInfo.resolvedSource),
        exportInfo.importedName,
        nextSeen
      );
    }

    if (analysis.structuralLocals.has(exportInfo.localName)) {
      return true;
    }

    const importInfo = analysis.importBindings.get(exportInfo.localName);
    if (importInfo?.resolvedSource && importInfo.importedName !== "*") {
      return isStructuralExport(
        analyzeModule(importInfo.resolvedSource),
        importInfo.importedName,
        nextSeen
      );
    }

    return false;
  }

  function isStructuralCustomExport(analysis, exportedName, seen = new Set()) {
    if (!analysis || !exportedName) return false;
    const key = `${analysis.filename}:custom:${exportedName}`;
    if (seen.has(key)) return false;
    const nextSeen = new Set(seen);
    nextSeen.add(key);

    const exportInfo = analysis.exportBindings.get(exportedName);
    if (!exportInfo) {
      return false;
    }

    if (exportInfo.resolvedSource) {
      return isStructuralCustomExport(
        analyzeModule(exportInfo.resolvedSource),
        exportInfo.importedName,
        nextSeen
      );
    }

    if (localCustomHookUsesStructural(analysis, exportInfo.localName, nextSeen)) {
      return true;
    }

    const importInfo = analysis.importBindings.get(exportInfo.localName);
    if (importInfo?.resolvedSource && importInfo.importedName !== "*") {
      return isStructuralCustomExport(
        analyzeModule(importInfo.resolvedSource),
        importInfo.importedName,
        nextSeen
      );
    }

    return false;
  }

  return function structuralHookResolver({ filename, source, importedName }) {
    const resolved = resolveImport(filename, source);
    if (!resolved) return false;
    const analysis = analyzeModule(resolved);
    if (isStructuralExport(analysis, importedName)) {
      return "structural-hook";
    }
    if (isStructuralCustomExport(analysis, importedName)) {
      return "structural-custom-hook";
    }
    return false;
  };
}

function normalizePath(value) {
  return String(value || "").replace(/\\/g, "/");
}

function hashStableId(value) {
  let hash = 2166136261;
  const text = String(value);
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function createStableIdCallsiteMetadata(callPath, state, t) {
  const filename =
    state.file?.opts?.sourceFileName ||
    state.file?.opts?.filename ||
    state.filename ||
    "";
  const normalizedFilename = normalizePath(filename);
  const loc = callPath.node.loc?.start ?? null;
  const start = typeof callPath.node.start === "number"
    ? callPath.node.start
    : 0;
  const line = loc?.line ?? 0;
  const column = loc?.column ?? 0;
  const seed = `${normalizedFilename}:${line}:${column}:${start}`;
  return t.stringLiteral(`litsx-stable-${hashStableId(seed)}`);
}

export default function transformLitsxHooks(api, options = {}) {
  const plugin = createRuntimeHooksTransform({
    pluginName: "transform-litsx-hooks",
    runtimeModule: RUNTIME_MODULE,
    importSources: IMPORT_SOURCES,
    helperNames: RUNTIME_HELPERS,
    callMetadataByHelper: {
      useStableId: createStableIdCallsiteMetadata,
    },
  });

  return plugin(api, {
    ...options,
    structuralHookResolver: createStructuralHookResolver(options),
  });
}
