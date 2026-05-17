import helperPluginUtils from "@babel/helper-plugin-utils";
import * as babelParser from "@babel/parser";
import babelTraverse from "@babel/traverse";
import jsxSyntaxPlugin from "@babel/plugin-syntax-jsx";
import { parseWithLitsxVirtualization } from "@litsx/authoring/parser";
import fs from "node:fs";
import path from "node:path";
import { normalizeFilePath } from "@litsx/typescript-session";
import { ensureTypescriptModule } from "./transform-litsx-properties.js";
import {
  ensureStaticIr,
  setStaticIrBabelTypes,
} from "./transform-litsx-static-ir.js";

const { declare } = helperPluginUtils;
const traverse = babelTraverse.default || babelTraverse;
const IMPORT_RESOLUTION_EXTENSIONS = [
  ".litsx",
  ".litsx.jsx",
  ".jsx",
  ".js",
  ".tsx",
  ".ts",
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
let t;

export function setElementCandidatesBabelTypes(nextTypes) {
  t = nextTypes;
  setStaticIrBabelTypes(nextTypes);
}

function isInsideFunctionOrClass(path) {
  return path.findParent(
    (p) =>
      p.isFunctionDeclaration() ||
      p.isFunctionExpression() ||
      p.isArrowFunctionExpression() ||
      p.isClassDeclaration()
  );
}

function isRelativeSpecifier(value) {
  return typeof value === "string" && (
    value.startsWith("./") ||
    value.startsWith("../") ||
    value.startsWith("/")
  );
}

function createEmptyCandidateResult() {
  return {
    localCandidates: new Set(),
    importedCandidates: new Map(),
  };
}

function annotateElementCandidates(node, result) {
  if (!node) return;
  const staticIr = ensureStaticIr(node);
  staticIr.elements.localCandidates = [...result.localCandidates];
  staticIr.elements.importedCandidates = [...result.importedCandidates.values()];
}

function cloneCandidateResult(result) {
  return {
    localCandidates: new Set(result?.localCandidates || []),
    importedCandidates: new Map(result?.importedCandidates || []),
  };
}

function mergeCandidateResults(target, source) {
  source.localCandidates.forEach((candidate) => target.localCandidates.add(candidate));
  source.importedCandidates.forEach((candidate, key) => {
    if (!target.importedCandidates.has(key)) {
      target.importedCandidates.set(key, candidate);
    }
  });
}

function toImportRecordKey(record) {
  return `${record.sourceFile}:${record.importedName}:${record.tagName}`;
}

function toRelativeModuleSpecifier(fromFilename, targetFilename) {
  const fromDir = path.dirname(fromFilename);
  let relativePath = normalizeFilePath(path.relative(fromDir, targetFilename));

  if (!relativePath.startsWith(".") && !relativePath.startsWith("/")) {
    relativePath = `./${relativePath}`;
  }

  return relativePath;
}

function hasSupportedExtension(filePath) {
  return IMPORT_RESOLUTION_EXTENSIONS.some((extension) => filePath.endsWith(extension));
}

function resolveImportSource(fromFilename, sourceValue, context) {
  const cacheKey = `${normalizeFilePath(fromFilename)}::${sourceValue}`;
  if (context.resolvedImportCache.has(cacheKey)) {
    return context.resolvedImportCache.get(cacheKey);
  }

  const existingFile = (candidatePath) => {
    try {
      return fs.existsSync(candidatePath) && fs.statSync(candidatePath).isFile();
    } catch {
      return false;
    }
  };

  const resolveWithExtensions = (basePath) => {
    const normalizedBasePath = normalizeFilePath(basePath);
    const candidates = [];

    if (hasSupportedExtension(normalizedBasePath)) {
      candidates.push(normalizedBasePath);
    } else {
      IMPORT_RESOLUTION_EXTENSIONS.forEach((extension) => {
        candidates.push(`${normalizedBasePath}${extension}`);
      });
      IMPORT_RESOLUTION_EXTENSIONS.forEach((extension) => {
        candidates.push(normalizeFilePath(path.join(normalizedBasePath, `index${extension}`)));
      });
    }

    return candidates.find(existingFile) || null;
  };

  const resolvePathMappingSubstitution = (substitution, wildcardValue) => {
    if (typeof substitution !== "string") {
      return null;
    }

    const firstStarIndex = substitution.indexOf("*");
    if (firstStarIndex === -1) {
      return substitution;
    }

    if (substitution.indexOf("*", firstStarIndex + 1) !== -1) {
      return null;
    }

    return (
      substitution.slice(0, firstStarIndex) +
      wildcardValue +
      substitution.slice(firstStarIndex + 1)
    );
  };

  const resolvePathAlias = () => {
    const compilerOptions = context.getCompilerOptions?.(fromFilename) || {};
    const baseUrl = compilerOptions.baseUrl
      ? normalizeFilePath(
          path.isAbsolute(compilerOptions.baseUrl)
            ? compilerOptions.baseUrl
            : path.resolve(path.dirname(fromFilename), compilerOptions.baseUrl)
        )
      : normalizeFilePath(path.dirname(fromFilename));
    const pathMappings = compilerOptions.paths || {};

    for (const [pattern, substitutions] of Object.entries(pathMappings)) {
      const starIndex = pattern.indexOf("*");
      const isStarPattern = starIndex !== -1;
      const prefix = isStarPattern ? pattern.slice(0, starIndex) : pattern;
      const suffix = isStarPattern ? pattern.slice(starIndex + 1) : "";

      if (isStarPattern) {
        if (!sourceValue.startsWith(prefix) || !sourceValue.endsWith(suffix)) {
          continue;
        }
      } else if (sourceValue !== pattern) {
        continue;
      }

      const wildcardValue = isStarPattern
        ? sourceValue.slice(prefix.length, sourceValue.length - suffix.length)
        : "";

      for (const substitution of substitutions || []) {
        const substituted = isStarPattern
          ? resolvePathMappingSubstitution(substitution, wildcardValue)
          : substitution;
        if (!substituted) {
          continue;
        }
        const candidateBase = path.isAbsolute(substituted)
          ? substituted
          : path.join(baseUrl, substituted);
        const resolvedPath = resolveWithExtensions(candidateBase);
        if (resolvedPath) {
          return resolvedPath;
        }
      }
    }

    return null;
  };

  let resolved = null;
  if (fromFilename && isRelativeSpecifier(sourceValue)) {
    resolved = resolveWithExtensions(
      path.resolve(path.dirname(fromFilename), sourceValue)
    );
  } else if (fromFilename) {
    resolved = resolvePathAlias();
    if (!resolved) {
      const ts = ensureTypescriptModule();
      const compilerOptions = context.getCompilerOptions?.(fromFilename) || DEFAULT_MODULE_RESOLUTION_OPTIONS;
      const moduleResolutionHost = context.getModuleResolutionHost?.(fromFilename) || ts.sys;
      try {
        const resolution = ts.resolveModuleName(
          sourceValue,
          normalizeFilePath(fromFilename),
          compilerOptions,
          moduleResolutionHost
        );
        const resolvedFileName = resolution?.resolvedModule?.resolvedFileName;
        if (resolvedFileName) {
          resolved = resolveWithExtensions(resolvedFileName) || normalizeFilePath(resolvedFileName);
        }
      } catch {
        resolved = null;
      }
    }
  }

  context.resolvedImportCache.set(cacheKey, resolved);
  return resolved;
}

function createCompilerContextResolver(options = {}) {
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

  return {
    getCompilerOptions(filename) {
      const cacheKey = normalizeFilePath(filename);
      if (compilerOptionsCache.has(cacheKey)) {
        return compilerOptionsCache.get(cacheKey);
      }

      const program = getProgramForFile(filename);
      const compilerOptions = program?.getCompilerOptions?.() || DEFAULT_MODULE_RESOLUTION_OPTIONS;
      compilerOptionsCache.set(cacheKey, compilerOptions);
      return compilerOptions;
    },
    getModuleResolutionHost(filename) {
      const cacheKey = normalizeFilePath(filename);
      if (moduleResolutionHostCache.has(cacheKey)) {
        return moduleResolutionHostCache.get(cacheKey);
      }

      const ts = ensureTypescriptModule();
      const program = getProgramForFile(filename);
      const host = providedTypescriptSession?.host || ts.sys;
      moduleResolutionHostCache.set(cacheKey, host);
      return host;
    },
  };
}

function getOrCreateAvailableNames(programPath) {
  const cached = programPath.getData("__litsxAvailableNames");
  if (cached) {
    return cached;
  }

  const availableNames = new Set();
  programPath.get("body").forEach((nodePath) => {
    if (nodePath.isImportDeclaration()) {
      nodePath.node.specifiers.forEach((specifier) => {
        if (specifier.local?.name) {
          availableNames.add(specifier.local.name);
        }
      });
      return;
    }

    if (nodePath.isClassDeclaration() && nodePath.node.id?.name) {
      availableNames.add(nodePath.node.id.name);
      return;
    }

    if (
      (nodePath.isExportNamedDeclaration() || nodePath.isExportDefaultDeclaration()) &&
      nodePath.get("declaration")?.isClassDeclaration?.() &&
      nodePath.node.declaration?.id?.name
    ) {
      availableNames.add(nodePath.node.declaration.id.name);
      return;
    }

    if (nodePath.isFunctionDeclaration() && nodePath.node.id?.name) {
      availableNames.add(nodePath.node.id.name);
      return;
    }

    if (
      (nodePath.isExportNamedDeclaration() || nodePath.isExportDefaultDeclaration()) &&
      nodePath.get("declaration")?.isFunctionDeclaration?.() &&
      nodePath.node.declaration?.id?.name
    ) {
      availableNames.add(nodePath.node.declaration.id.name);
      return;
    }

    if (
      (nodePath.isExportNamedDeclaration() || nodePath.isExportDefaultDeclaration()) &&
      nodePath.get("declaration")?.isVariableDeclaration?.()
    ) {
      nodePath.get("declaration.declarations").forEach((declaratorPath) => {
        const declarator = declaratorPath.node;
        if (t.isIdentifier(declarator.id)) {
          availableNames.add(declarator.id.name);
        }
      });
      return;
    }

    if (!nodePath.isVariableDeclaration()) return;
    nodePath.get("declarations").forEach((declaratorPath) => {
      const declarator = declaratorPath.node;
      if (t.isIdentifier(declarator.id)) {
        availableNames.add(declarator.id.name);
      }
    });
  });

  programPath.setData("__litsxAvailableNames", availableNames);
  return availableNames;
}

function getOrCreateHelperPaths(programPath) {
  const cached = programPath.getData("__litsxHelperPaths");
  if (cached) {
    return cached;
  }

  const helperPaths = new Map();
  programPath.get("body").forEach((nodePath) => {
    if (nodePath.isFunctionDeclaration() && nodePath.node.id?.name) {
      helperPaths.set(nodePath.node.id.name, nodePath);
      return;
    }

    if (
      (nodePath.isExportNamedDeclaration() || nodePath.isExportDefaultDeclaration()) &&
      nodePath.get("declaration")?.isFunctionDeclaration?.() &&
      nodePath.node.declaration?.id?.name
    ) {
      helperPaths.set(nodePath.node.declaration.id.name, nodePath.get("declaration"));
      return;
    }

    if (
      (nodePath.isExportNamedDeclaration() || nodePath.isExportDefaultDeclaration()) &&
      nodePath.get("declaration")?.isVariableDeclaration?.()
    ) {
      nodePath.get("declaration.declarations").forEach((declaratorPath) => {
        const declarator = declaratorPath.node;
        if (!t.isIdentifier(declarator.id)) {
          return;
        }

        const initPath = declaratorPath.get("init");
        if (
          initPath?.isArrowFunctionExpression?.() ||
          initPath?.isFunctionExpression?.()
        ) {
          helperPaths.set(declarator.id.name, initPath);
        }
      });
      return;
    }

    if (!nodePath.isVariableDeclaration()) return;
    nodePath.get("declarations").forEach((declaratorPath) => {
      const declarator = declaratorPath.node;
      if (!t.isIdentifier(declarator.id)) {
        return;
      }

      const initPath = declaratorPath.get("init");
      if (
        initPath?.isArrowFunctionExpression?.() ||
        initPath?.isFunctionExpression?.()
      ) {
        helperPaths.set(declarator.id.name, initPath);
      }
    });
  });

  programPath.setData("__litsxHelperPaths", helperPaths);
  return helperPaths;
}

function buildModuleAnalysis(programPath, filename, context) {
  const availableNames = getOrCreateAvailableNames(programPath);
  const helperPaths = getOrCreateHelperPaths(programPath);
  const importBindings = new Map();
  const exportBindings = new Map();
  const componentMarkerLocals = new Set();
  const compiledComponentLocals = new Set();

  const markCompiledClassIfNeeded = (classPath) => {
    if (!classPath?.isClassDeclaration?.() || !classPath.node.id?.name) {
      return;
    }

    const hasCompiledMarker = classPath.get("body.body").some((memberPath) => {
      if (!memberPath.isClassProperty()) {
        return false;
      }

      return (
        memberPath.node.static === true &&
        memberPath.node.computed === true &&
        isSymbolForMarker(memberPath.node.key, "litsx.component") &&
        memberPath.get("value").isBooleanLiteral({ value: true })
      );
    });

    if (hasCompiledMarker) {
      compiledComponentLocals.add(classPath.node.id.name);
    }
  };

  programPath.get("body").forEach((nodePath) => {
    if (nodePath.isImportDeclaration()) {
      const sourceValue = nodePath.node.source.value;
      const resolvedSource = resolveImportSource(filename, sourceValue, context);

      nodePath.node.specifiers.forEach((specifier) => {
        if (!specifier.local?.name) {
          return;
        }

        let importedName = null;
        if (specifier.type === "ImportDefaultSpecifier") {
          importedName = "default";
        } else if (specifier.type === "ImportSpecifier") {
          importedName = specifier.imported?.name ?? specifier.imported?.value ?? null;
        } else if (specifier.type === "ImportNamespaceSpecifier") {
          importedName = "*";
        }

        importBindings.set(specifier.local.name, {
          localName: specifier.local.name,
          importedName,
          sourceValue,
          resolvedSource,
        });

        if (
          sourceValue === "@litsx/core/elements" &&
          importedName === "LITSX_COMPONENT"
        ) {
          componentMarkerLocals.add(specifier.local.name);
        }
      });

      return;
    }

    if (nodePath.isClassDeclaration()) {
      markCompiledClassIfNeeded(nodePath);
    }

    if (nodePath.isExportNamedDeclaration()) {
      const declarationPath = nodePath.get("declaration");
      if (declarationPath?.isClassDeclaration?.()) {
        markCompiledClassIfNeeded(declarationPath);
      }
      if (declarationPath?.node) {
        if (declarationPath.isFunctionDeclaration() || declarationPath.isClassDeclaration()) {
          const localName = declarationPath.node.id?.name;
          if (localName) {
            exportBindings.set(localName, { localName });
          }
        } else if (declarationPath.isVariableDeclaration()) {
          declarationPath.get("declarations").forEach((declaratorPath) => {
            const localName = declaratorPath.node.id?.name;
            if (localName) {
              exportBindings.set(localName, { localName });
            }
          });
        }
      }

      nodePath.get("specifiers").forEach((specifierPath) => {
        const exportedName =
          specifierPath.node.exported?.name ?? specifierPath.node.exported?.value ?? null;
        if (!exportedName) {
          return;
        }

        const sourceValue = nodePath.node.source?.value ?? null;
        if (sourceValue) {
          const localName =
            specifierPath.node.local?.name ?? specifierPath.node.local?.value ?? exportedName;
          exportBindings.set(exportedName, {
            reexportSource: resolveImportSource(filename, sourceValue, context),
            importedName: localName === "default" ? "default" : localName,
          });
          return;
        }

        const localName =
          specifierPath.node.local?.name ?? specifierPath.node.local?.value ?? null;
        if (localName) {
          exportBindings.set(exportedName, { localName });
        }
      });

      return;
    }

    if (!nodePath.isExportDefaultDeclaration()) {
      return;
    }

    const declarationPath = nodePath.get("declaration");
    if (declarationPath.isIdentifier()) {
      exportBindings.set("default", { localName: declarationPath.node.name });
      return;
    }

    if (
      declarationPath.isFunctionDeclaration() ||
      declarationPath.isClassDeclaration()
    ) {
      const localName = declarationPath.node.id?.name;
      if (localName) {
        exportBindings.set("default", { localName });
      } else {
        exportBindings.set("default", { path: declarationPath });
      }
      return;
    }

    if (
      declarationPath.isArrowFunctionExpression() ||
      declarationPath.isFunctionExpression()
    ) {
      exportBindings.set("default", { path: declarationPath });
    }
  });

  return {
    filename,
    programPath,
    availableNames,
    helperPaths,
    importBindings,
    exportBindings,
    compatPascalNames: new Set(),
    compiledComponentLocals,
  };
}

function isCompiledComponentExport(moduleAnalysis, importedName, context, seen = new Set()) {
  if (!moduleAnalysis || !importedName) {
    return false;
  }

  const visitKey = `${moduleAnalysis.filename}:${importedName}`;
  if (seen.has(visitKey)) {
    return false;
  }
  const nextSeen = new Set(seen);
  nextSeen.add(visitKey);

  const exportInfo = moduleAnalysis.exportBindings.get(importedName);
  if (!exportInfo) {
    return false;
  }

  if (exportInfo.localName) {
    if (moduleAnalysis.compiledComponentLocals.has(exportInfo.localName)) {
      return true;
    }

    const importInfo = moduleAnalysis.importBindings.get(exportInfo.localName);
    if (importInfo?.resolvedSource && importInfo.importedName && importInfo.importedName !== "*") {
      const importedModule = getOrCreateModuleAnalysis(importInfo.resolvedSource, context);
      return isCompiledComponentExport(
        importedModule,
        importInfo.importedName,
        context,
        nextSeen
      );
    }

    return false;
  }

  if (exportInfo.reexportSource && exportInfo.importedName) {
    const reexportedModule = getOrCreateModuleAnalysis(exportInfo.reexportSource, context);
    return isCompiledComponentExport(
      reexportedModule,
      exportInfo.importedName,
      context,
      nextSeen
    );
  }

  return false;
}

function isExternalCompilationImport(requirement) {
  if (!requirement?.sourceFile || !requirement?.sourceSpecifier) {
    return false;
  }

  return normalizeFilePath(requirement.sourceFile).includes("/node_modules/");
}

function warnExternalPascalComponentInference(candidateName, requirement, moduleAnalysis, context, jsxPath) {
  if (typeof context.options?.warn !== "function") {
    return;
  }

  if (!isExternalCompilationImport(requirement)) {
    return;
  }

  if (!requirement?.sourceFile || !requirement?.importedName) {
    return;
  }

  const importedModule = getOrCreateModuleAnalysis(requirement.sourceFile, context);
  if (isCompiledComponentExport(importedModule, requirement.importedName, context)) {
    return;
  }

  const warningKey =
    `${context.rootFilename}:${candidateName}:${requirement.sourceSpecifier}:${requirement.importedName}`;
  context.externalPascalInferenceWarnings ||= new Set();
  if (context.externalPascalInferenceWarnings.has(warningKey)) {
    return;
  }
  context.externalPascalInferenceWarnings.add(warningKey);

  const originalName = jsxPath.node.name.__scopedOriginal || jsxPath.node.name.name;
  context.options.warn({
    code: "LITSX_EXTERNAL_PASCAL_COMPONENT_INFERRED",
    message:
      `LitSX inferred imported PascalCase JSX "${originalName}" from external module "${requirement.sourceSpecifier}" as a web component by usage. ` +
      "LitSX cannot verify at build time that this import is a web component.",
    componentName: originalName,
    sourceSpecifier: requirement.sourceSpecifier,
    line: jsxPath.node.name.loc?.start?.line ?? null,
    column: jsxPath.node.name.loc?.start?.column ?? null,
  });
}

function getOrCreateModuleAnalysis(filename, context) {
  const normalizedFilename = normalizeFilePath(filename);
  if (!normalizedFilename) {
    return null;
  }

  if (context.moduleAnalysisCache.has(normalizedFilename)) {
    return context.moduleAnalysisCache.get(normalizedFilename);
  }

  let source;
  try {
    source = fs.readFileSync(normalizedFilename, "utf8");
  } catch {
    return null;
  }

  let programPath = null;
  try {
    const ast = parseWithLitsxVirtualization(babelParser.parse, source, {
      sourceType: "module",
      plugins: getParserPluginsForModule(normalizedFilename, source),
    });
    traverse(ast, {
      Program(path) {
        if (!programPath) {
          programPath = path;
          path.scope.crawl();
        }
      },
    });
  } catch {
    return null;
  }

  if (!programPath) {
    return null;
  }

  const analysis = buildModuleAnalysis(programPath, normalizedFilename, context);
  context.moduleAnalysisCache.set(normalizedFilename, analysis);
  return analysis;
}

function isCapitalizedName(name) {
  if (typeof name !== "string" || name.length === 0) {
    return false;
  }

  const first = name[0];
  return first === first.toUpperCase() && first !== first.toLowerCase();
}

function isProgramLevelBinding(binding) {
  return binding?.scope?.path?.isProgram?.() === true;
}

function validateComponentName(nameNode, pathForErrors, context) {
  if (!nameNode || nameNode.type !== "JSXIdentifier") return null;
  const originalName = nameNode.__scopedOriginal || nameNode.name;
  if (!isCapitalizedName(originalName)) return null;

  const binding = pathForErrors?.scope?.getBinding?.(originalName) || null;
  if (!binding) {
    if (context.availableNames.has(originalName)) {
      return originalName;
    }
    if (context.compatPascalNames.has(originalName)) {
      return null;
    }
    if (context.options?.allowUnknownPascalCase === true) {
      return null;
    }
    throw (pathForErrors?.buildCodeFrameError?.(
      `Unknown LitSX component "${originalName}". Add an import or declare it in this module before using it in JSX.`
    ) || new Error(
      `Unknown LitSX component "${originalName}". Add an import or declare it in this module before using it in JSX.`
    ));
  }

  if (!isProgramLevelBinding(binding)) {
    return null;
  }

  return originalName;
}

function resolveImportedHelper(moduleAnalysis, helperName, context, seen = new Set()) {
  const importInfo = moduleAnalysis.importBindings.get(helperName);
  if (!importInfo?.resolvedSource || importInfo.importedName === "*") {
    return null;
  }

  const visitedKey = `${moduleAnalysis.filename}:${helperName}:${importInfo.resolvedSource}:${importInfo.importedName}`;
  if (seen.has(visitedKey)) {
    return null;
  }
  const nextSeen = new Set(seen);
  nextSeen.add(visitedKey);

  const importedModule = getOrCreateModuleAnalysis(importInfo.resolvedSource, context);
  if (!importedModule) {
    return null;
  }

  return resolveExportedHelper(importedModule, importInfo.importedName, context, nextSeen);
}

function resolveExportedHelper(moduleAnalysis, exportedName, context, seen = new Set()) {
  const exportInfo = moduleAnalysis.exportBindings.get(exportedName);
  if (!exportInfo) {
    return null;
  }

  if (exportInfo.path?.node) {
    return {
      moduleAnalysis,
      path: exportInfo.path,
    };
  }

  if (exportInfo.localName) {
    const helperPath = moduleAnalysis.helperPaths.get(exportInfo.localName);
    if (!helperPath?.node) {
      if (moduleAnalysis.importBindings.has(exportInfo.localName)) {
        return resolveImportedHelper(moduleAnalysis, exportInfo.localName, context, seen);
      }
      return null;
    }
    return {
      moduleAnalysis,
      path: helperPath,
    };
  }

  if (exportInfo.reexportSource) {
    const reexportedModule = getOrCreateModuleAnalysis(exportInfo.reexportSource, context);
    if (!reexportedModule) {
      return null;
    }
    return resolveExportedHelper(
      reexportedModule,
      exportInfo.importedName,
      context,
      seen
    );
  }

  return null;
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

function isSymbolForMarker(node, markerKey) {
  return (
    t.isCallExpression(node) &&
    t.isMemberExpression(node.callee) &&
    node.callee.computed === false &&
    t.isIdentifier(node.callee.object, { name: "Symbol" }) &&
    t.isIdentifier(node.callee.property, { name: "for" }) &&
    node.arguments.length === 1 &&
    t.isStringLiteral(node.arguments[0], { value: markerKey })
  );
}

function unwrapNamespaceAliasExpression(node) {
  let current = node;
  while (
    t.isTSAsExpression(current) ||
    t.isTSTypeAssertion(current) ||
    t.isTSNonNullExpression(current) ||
    t.isTSSatisfiesExpression?.(current)
  ) {
    current = current.expression;
  }
  return current;
}

function getNamespaceMemberAliasInfo(candidateName, moduleAnalysis) {
  const binding = moduleAnalysis.programPath.scope.getBinding(candidateName);
  if (!binding || !isProgramLevelBinding(binding)) {
    return null;
  }

  const declaratorPath = binding.path.isVariableDeclarator?.()
    ? binding.path
    : binding.path.parentPath;
  if (!declaratorPath?.isVariableDeclarator?.()) {
    return null;
  }

  const init = unwrapNamespaceAliasExpression(declaratorPath.node.init);
  if (
    !t.isMemberExpression(init) ||
    init.computed ||
    !t.isIdentifier(unwrapNamespaceAliasExpression(init.object)) ||
    !t.isIdentifier(init.property)
  ) {
    return null;
  }

  const namespaceObject = unwrapNamespaceAliasExpression(init.object);
  const namespaceImport = moduleAnalysis.importBindings.get(namespaceObject.name);
  if (
    !namespaceImport ||
    namespaceImport.importedName !== "*" ||
    !namespaceImport.resolvedSource
  ) {
    return null;
  }

  return {
    localName: candidateName,
    namespaceName: namespaceObject.name,
    importedName: init.property.name,
    sourceValue: namespaceImport.sourceValue,
    resolvedSource: namespaceImport.resolvedSource,
  };
}

function resolveImportedElementRequirement(candidateName, moduleAnalysis, context, rootFilename) {
  const binding = moduleAnalysis.programPath.scope.getBinding(candidateName);
  if (!binding || !isProgramLevelBinding(binding)) {
    return null;
  }

  if (
    binding.path.isImportSpecifier?.() ||
    binding.path.isImportDefaultSpecifier?.()
  ) {
    const importInfo = moduleAnalysis.importBindings.get(candidateName);
    if (!importInfo?.resolvedSource || importInfo.importedName === "*") {
      return null;
    }

    return {
      sourceFile: importInfo.resolvedSource,
      sourceSpecifier: isRelativeSpecifier(importInfo.sourceValue)
        ? null
        : importInfo.sourceValue,
      importedName: importInfo.importedName,
      originalName: candidateName,
      tagName: candidateName.replace(/([a-z])([A-Z])/g, "$1-$2").toLowerCase(),
      rootFilename,
      lightDom: importedBindingHasLightDomHoist(importInfo, context),
    };
  }

  const namespaceAliasInfo = getNamespaceMemberAliasInfo(candidateName, moduleAnalysis);
  if (namespaceAliasInfo) {
    return {
      sourceFile: namespaceAliasInfo.resolvedSource,
      sourceSpecifier: isRelativeSpecifier(namespaceAliasInfo.sourceValue)
        ? null
        : namespaceAliasInfo.sourceValue,
      importedName: namespaceAliasInfo.importedName,
      originalName: candidateName,
      tagName: candidateName.replace(/([a-z])([A-Z])/g, "$1-$2").toLowerCase(),
      rootFilename,
    };
  }

  const exportInfo =
    moduleAnalysis.exportBindings.get(candidateName) ||
    moduleAnalysis.exportBindings.get("default");
  if (!exportInfo) {
    throw new Error(
      `Imported renderer helper transitively renders "${candidateName}" from "${moduleAnalysis.filename}", but that symbol is not exported and cannot be added to static elements in "${rootFilename}".`
    );
  }

  const importedName = exportInfo.localName === candidateName
    ? candidateName
    : [...moduleAnalysis.exportBindings.entries()].find(
        ([, entry]) => entry.localName === candidateName
      )?.[0] ?? null;

  if (!importedName) {
    throw new Error(
      `Imported renderer helper transitively renders "${candidateName}" from "${moduleAnalysis.filename}", but that symbol cannot be resolved as an importable export for "${rootFilename}".`
    );
  }

  return {
    sourceFile: moduleAnalysis.filename,
    sourceSpecifier: null,
    importedName,
    originalName: candidateName,
    tagName: candidateName.replace(/([a-z])([A-Z])/g, "$1-$2").toLowerCase(),
    rootFilename,
    lightDom: helperPathHasLightDomHoist(moduleAnalysis.helperPaths.get(candidateName)),
  };
}

function resolveDirectImportRequirement(candidateName, moduleAnalysis, context, rootFilename) {
  const binding = moduleAnalysis.programPath.scope.getBinding(candidateName);
  if (!binding || !isProgramLevelBinding(binding)) {
    return null;
  }

  if (
    binding.path.isImportSpecifier?.() ||
    binding.path.isImportDefaultSpecifier?.()
  ) {
    const importInfo = moduleAnalysis.importBindings.get(candidateName);
    if (!importInfo?.resolvedSource || importInfo.importedName === "*") {
      return null;
    }

    return {
      sourceFile: importInfo.resolvedSource,
      sourceSpecifier: isRelativeSpecifier(importInfo.sourceValue)
        ? null
        : importInfo.sourceValue,
      importedName: importInfo.importedName,
      originalName: candidateName,
      tagName: candidateName.replace(/([a-z])([A-Z])/g, "$1-$2").toLowerCase(),
      rootFilename,
    };
  }

  const namespaceAliasInfo = getNamespaceMemberAliasInfo(candidateName, moduleAnalysis);
  if (!namespaceAliasInfo) {
    return null;
  }

  return {
    sourceFile: namespaceAliasInfo.resolvedSource,
    sourceSpecifier: isRelativeSpecifier(namespaceAliasInfo.sourceValue)
      ? null
      : namespaceAliasInfo.sourceValue,
    importedName: namespaceAliasInfo.importedName,
    originalName: candidateName,
    tagName: candidateName.replace(/([a-z])([A-Z])/g, "$1-$2").toLowerCase(),
    rootFilename,
  };
}

function helperPathHasLightDomHoist(helperPath) {
  const body = helperPath?.node?.body?.body;
  if (!Array.isArray(body)) {
    return false;
  }

  return body.some((statement) => (
    t.isExpressionStatement(statement) &&
    t.isCallExpression(statement.expression) &&
    t.isIdentifier(statement.expression.callee, { name: "__litsx_static_lightDom" })
  ));
}

function importedBindingHasLightDomHoist(importInfo, context) {
  if (!importInfo?.resolvedSource || importInfo.importedName === "*") {
    return false;
  }

  const importedModule = getOrCreateModuleAnalysis(importInfo.resolvedSource, context);
  if (!importedModule) {
    return false;
  }

  const exportInfo = importedModule.exportBindings.get(importInfo.importedName);
  const localName = exportInfo?.localName ?? (
    importInfo.importedName === "default" ? "default" : importInfo.importedName
  );

  if (exportInfo?.path) {
    return helperPathHasLightDomHoist(exportInfo.path);
  }

  return helperPathHasLightDomHoist(importedModule.helperPaths.get(localName));
}

function collectCandidateResult(functionPath, programPath, options = {}) {
  const result = createEmptyCandidateResult();
  if (!programPath || !functionPath?.node) return result;
  programPath.scope.crawl();
  const compilationSession = options.__litsxCompilationSession || null;

  const rootFilename = normalizeFilePath(
    options.filename || programPath.hub.file?.opts?.filename || ""
  );
  const helperCandidateCache =
    programPath.getData("__litsxHelperCandidateCache") || new WeakMap();
  programPath.setData("__litsxHelperCandidateCache", helperCandidateCache);
  const moduleAnalysisCache =
    compilationSession?.importedModuleAnalysisCache ||
    programPath.getData("__litsxImportedModuleAnalyses") ||
    new Map();
  programPath.setData("__litsxImportedModuleAnalyses", moduleAnalysisCache);
  const resolvedImportCache =
    compilationSession?.resolvedImportCache ||
    programPath.getData("__litsxResolvedImports") ||
    new Map();
  programPath.setData("__litsxResolvedImports", resolvedImportCache);

  const rootModule = {
    filename: rootFilename,
    programPath,
    availableNames: getOrCreateAvailableNames(programPath),
    helperPaths: getOrCreateHelperPaths(programPath),
    compatPascalNames: programPath.getData("__litsxCompatPascalNames") || new Set(),
    importBindings: new Map(),
    exportBindings: new Map(),
  };

  programPath.get("body").forEach((nodePath) => {
    if (!nodePath.isImportDeclaration()) {
      return;
    }

    const sourceValue = nodePath.node.source.value;
    const resolvedSource = resolveImportSource(rootFilename, sourceValue, {
      moduleAnalysisCache,
      resolvedImportCache,
    });

    nodePath.node.specifiers.forEach((specifier) => {
      if (!specifier.local?.name) {
        return;
      }

      let importedName = null;
      if (specifier.type === "ImportDefaultSpecifier") {
        importedName = "default";
      } else if (specifier.type === "ImportSpecifier") {
        importedName = specifier.imported?.name ?? specifier.imported?.value ?? null;
      } else if (specifier.type === "ImportNamespaceSpecifier") {
        importedName = "*";
      }

      rootModule.importBindings.set(specifier.local.name, {
        localName: specifier.local.name,
        importedName,
        sourceValue,
        resolvedSource,
      });
    });
  });

  const context = {
    rootFilename,
    rootModule,
    options,
    helperCandidateCache,
    moduleAnalysisCache,
    resolvedImportCache,
    externalPascalInferenceWarnings: new Set(),
    ...createCompilerContextResolver(options),
  };

  function scanFunction(path, moduleAnalysis, seen = new Set()) {
    if (!path?.node) {
      return createEmptyCandidateResult();
    }

    if (context.helperCandidateCache.has(path.node)) {
      return cloneCandidateResult(context.helperCandidateCache.get(path.node));
    }

    if (seen.has(path.node)) {
      return createEmptyCandidateResult();
    }

    const nextSeen = new Set(seen);
    nextSeen.add(path.node);
    const localResult = createEmptyCandidateResult();
    const referencedHelpers = [];
    const scanContext = {
      availableNames: moduleAnalysis.availableNames,
      helperPaths: moduleAnalysis.helperPaths,
      compatPascalNames: moduleAnalysis.compatPascalNames,
      options,
    };

    path.traverse({
      JSXOpeningElement(jsxPath) {
        const candidate = validateComponentName(jsxPath.node.name, jsxPath, scanContext);
        if (candidate) {
          if (moduleAnalysis.filename === context.rootFilename) {
            const directImportRequirement = resolveDirectImportRequirement(
              candidate,
              moduleAnalysis,
              context,
              context.rootFilename
            );
            if (directImportRequirement) {
              warnExternalPascalComponentInference(
                candidate,
                directImportRequirement,
                moduleAnalysis,
                context,
                jsxPath
              );
            }
            localResult.localCandidates.add(candidate);
          } else {
            const requirement = resolveImportedElementRequirement(
              candidate,
              moduleAnalysis,
              context,
              context.rootFilename
            );
            if (requirement) {
              warnExternalPascalComponentInference(
                candidate,
                requirement,
                moduleAnalysis,
                context,
                jsxPath
              );
              localResult.importedCandidates.set(
                toImportRecordKey(requirement),
                requirement
              );
            }
          }
        }
      },
      JSXClosingElement(jsxPath) {
        validateComponentName(jsxPath.node.name, jsxPath, scanContext);
      },
      Identifier(identifierPath) {
        if (!identifierPath.isReferencedIdentifier()) {
          return;
        }

        if (moduleAnalysis.helperPaths.has(identifierPath.node.name)) {
          referencedHelpers.push({
            moduleAnalysis,
            path: moduleAnalysis.helperPaths.get(identifierPath.node.name),
          });
          return;
        }

        const binding = identifierPath.scope.getBinding(identifierPath.node.name);
        if (!binding) {
          return;
        }

        if (
          !binding.path.isImportSpecifier?.() &&
          !binding.path.isImportDefaultSpecifier?.()
        ) {
          return;
        }

        const resolvedHelper = resolveImportedHelper(
          moduleAnalysis,
          identifierPath.node.name,
          context
        );
        if (!resolvedHelper?.path?.node) {
          return;
        }

        referencedHelpers.push(resolvedHelper);
      },
    });

    referencedHelpers.forEach((helperEntry) => {
      const helperCandidates = scanFunction(
        helperEntry.path,
        helperEntry.moduleAnalysis,
        nextSeen
      );
      mergeCandidateResults(localResult, helperCandidates);
    });

    context.helperCandidateCache.set(path.node, cloneCandidateResult(localResult));
    return localResult;
  }

  return scanFunction(functionPath, rootModule);
}

export function getAnnotatedElementCandidates(path, programPath, options = {}) {
  const localCandidates = path?.node?._litsxStaticIr?.elements?.localCandidates;
  if (Array.isArray(localCandidates)) {
    return new Set(localCandidates);
  }

  return collectCandidateResult(path, programPath, options).localCandidates;
}

export function getAnnotatedImportedElementCandidates(path, programPath, options = {}) {
  const importedCandidates = path?.node?._litsxStaticIr?.elements?.importedCandidates;
  if (Array.isArray(importedCandidates)) {
    return [...importedCandidates];
  }

  return [...collectCandidateResult(path, programPath, options).importedCandidates.values()];
}

export function importedBindingNeedsRendererContext(programPath, localName, options = {}) {
  if (!programPath?.node || !localName) {
    return false;
  }

  programPath.scope.crawl();
  const compilationSession = options.__litsxCompilationSession || null;
  const rootFilename = normalizeFilePath(
    options.filename || programPath.hub.file?.opts?.filename || ""
  );
  const helperCandidateCache =
    programPath.getData("__litsxHelperCandidateCache") || new WeakMap();
  programPath.setData("__litsxHelperCandidateCache", helperCandidateCache);
  const moduleAnalysisCache =
    compilationSession?.importedModuleAnalysisCache ||
    programPath.getData("__litsxImportedModuleAnalyses") ||
    new Map();
  programPath.setData("__litsxImportedModuleAnalyses", moduleAnalysisCache);
  const resolvedImportCache =
    compilationSession?.resolvedImportCache ||
    programPath.getData("__litsxResolvedImports") ||
    new Map();
  programPath.setData("__litsxResolvedImports", resolvedImportCache);

  const rootModule = {
    filename: rootFilename,
    programPath,
    availableNames: getOrCreateAvailableNames(programPath),
    helperPaths: getOrCreateHelperPaths(programPath),
    compatPascalNames: programPath.getData("__litsxCompatPascalNames") || new Set(),
    importBindings: new Map(),
    exportBindings: new Map(),
  };

  programPath.get("body").forEach((nodePath) => {
    if (!nodePath.isImportDeclaration()) {
      return;
    }

    const sourceValue = nodePath.node.source.value;
    const resolvedSource = resolveImportSource(rootFilename, sourceValue, {
      moduleAnalysisCache,
      resolvedImportCache,
    });

    nodePath.node.specifiers.forEach((specifier) => {
      if (!specifier.local?.name) {
        return;
      }

      let importedName = null;
      if (specifier.type === "ImportDefaultSpecifier") {
        importedName = "default";
      } else if (specifier.type === "ImportSpecifier") {
        importedName = specifier.imported?.name ?? specifier.imported?.value ?? null;
      } else if (specifier.type === "ImportNamespaceSpecifier") {
        importedName = "*";
      }

      rootModule.importBindings.set(specifier.local.name, {
        localName: specifier.local.name,
        importedName,
        sourceValue,
        resolvedSource,
      });
    });
  });

  const context = {
    rootFilename,
    rootModule,
    options,
    helperCandidateCache,
    moduleAnalysisCache,
    resolvedImportCache,
    ...createCompilerContextResolver(options),
  };

  const resolvedHelper = resolveImportedHelper(rootModule, localName, context);
  if (!resolvedHelper?.path?.node) {
    return false;
  }

  function scanFunction(path, moduleAnalysis, seen = new Set()) {
    if (!path?.node) {
      return false;
    }

    const cacheKey = path.node;
    if (context.helperCandidateCache.has(cacheKey)) {
      const cached = context.helperCandidateCache.get(cacheKey);
      return cached.localCandidates.size > 0 || cached.importedCandidates.size > 0;
    }

    if (seen.has(path.node)) {
      return false;
    }

    const nextSeen = new Set(seen);
    nextSeen.add(path.node);
    let needsContext = false;
    const referencedHelpers = [];
    const scanContext = {
      availableNames: moduleAnalysis.availableNames,
      helperPaths: moduleAnalysis.helperPaths,
      compatPascalNames: moduleAnalysis.compatPascalNames,
      options,
    };

    path.traverse({
      JSXOpeningElement(jsxPath) {
        const candidate = validateComponentName(jsxPath.node.name, jsxPath, scanContext);
        if (candidate) {
          needsContext = true;
        }
      },
      JSXClosingElement(jsxPath) {
        validateComponentName(jsxPath.node.name, jsxPath, scanContext);
      },
      Identifier(identifierPath) {
        if (!identifierPath.isReferencedIdentifier()) {
          return;
        }

        if (moduleAnalysis.helperPaths.has(identifierPath.node.name)) {
          referencedHelpers.push({
            moduleAnalysis,
            path: moduleAnalysis.helperPaths.get(identifierPath.node.name),
          });
          return;
        }

        const binding = identifierPath.scope.getBinding(identifierPath.node.name);
        if (
          !binding ||
          (
            !binding.path.isImportSpecifier?.() &&
            !binding.path.isImportDefaultSpecifier?.()
          )
        ) {
          return;
        }

        const importedHelper = resolveImportedHelper(
          moduleAnalysis,
          identifierPath.node.name,
          context
        );
        if (importedHelper?.path?.node) {
          referencedHelpers.push(importedHelper);
        }
      },
    });

    if (!needsContext) {
      needsContext = referencedHelpers.some((helperEntry) =>
        scanFunction(helperEntry.path, helperEntry.moduleAnalysis, nextSeen)
      );
    }

    context.helperCandidateCache.set(cacheKey, needsContext
      ? {
          localCandidates: new Set(["__context"]),
          importedCandidates: new Map(),
        }
      : createEmptyCandidateResult()
    );

    return needsContext;
  }

  return scanFunction(resolvedHelper.path, resolvedHelper.moduleAnalysis);
}

export function getImportedBindingModuleAnalysis(programPath, localName, options = {}) {
  if (!programPath?.node || !localName) {
    return null;
  }

  programPath.scope.crawl();
  const compilationSession = options.__litsxCompilationSession || null;
  const rootFilename = normalizeFilePath(
    options.filename || programPath.hub.file?.opts?.filename || ""
  );
  const moduleAnalysisCache =
    compilationSession?.importedModuleAnalysisCache ||
    programPath.getData("__litsxImportedModuleAnalyses") ||
    new Map();
  programPath.setData("__litsxImportedModuleAnalyses", moduleAnalysisCache);
  const resolvedImportCache =
    compilationSession?.resolvedImportCache ||
    programPath.getData("__litsxResolvedImports") ||
    new Map();
  programPath.setData("__litsxResolvedImports", resolvedImportCache);

  const binding = programPath.scope.getBinding(localName);
  if (!binding?.path?.node) {
    return null;
  }

  if (
    !binding.path.isImportSpecifier?.() &&
    !binding.path.isImportDefaultSpecifier?.() &&
    !binding.path.isImportNamespaceSpecifier?.()
  ) {
    return null;
  }

  const sourceValue = binding.path.parent?.source?.value ?? null;
  const context = {
    rootFilename,
    moduleAnalysisCache,
    resolvedImportCache,
    ...createCompilerContextResolver(options),
  };
  const resolvedSource = resolveImportSource(rootFilename, sourceValue, context);
  if (!resolvedSource) {
    return null;
  }

  return {
    localName,
    sourceValue,
    resolvedSource,
    importedName: binding.path.isImportDefaultSpecifier()
      ? "default"
      : binding.path.isImportNamespaceSpecifier()
        ? "*"
        : binding.path.node.imported?.name ?? binding.path.node.imported?.value ?? null,
    moduleAnalysis: getOrCreateModuleAnalysis(resolvedSource, context),
  };
}

export default declare((api) => {
  api.assertVersion(7);
  t = api.types;

  return {
    name: "transform-litsx-element-candidates",
    inherits: jsxSyntaxPlugin.default || jsxSyntaxPlugin,
    visitor: {
      Program: {
        enter(path) {
          path.scope.crawl();
          path.setData("__litsxAvailableNames", null);
          path.setData("__litsxHelperPaths", null);
          path.setData("__litsxHelperCandidateCache", new WeakMap());
          path.setData("__litsxImportedModuleAnalyses", new Map());
          path.setData("__litsxResolvedImports", new Map());
        },
      },
      FunctionDeclaration: {
        exit(path, state) {
          if (isInsideFunctionOrClass(path)) {
            return;
          }

          const programPath = path.findParent((entry) => entry.isProgram());
          const result = collectCandidateResult(
            path,
            programPath,
            {
              ...(state.opts || {}),
              filename: state.file?.opts?.filename || "",
            }
          );
          annotateElementCandidates(path.node, result);
        },
      },
      ArrowFunctionExpression: {
        exit(path, state) {
          if (isInsideFunctionOrClass(path)) {
            return;
          }

          const programPath = path.findParent((entry) => entry.isProgram());
          const result = collectCandidateResult(
            path,
            programPath,
            {
              ...(state.opts || {}),
              filename: state.file?.opts?.filename || "",
            }
          );
          annotateElementCandidates(path.node, result);
        },
      },
      FunctionExpression: {
        exit(path, state) {
          if (isInsideFunctionOrClass(path)) {
            return;
          }

          const programPath = path.findParent((entry) => entry.isProgram());
          const result = collectCandidateResult(
            path,
            programPath,
            {
              ...(state.opts || {}),
              filename: state.file?.opts?.filename || "",
            }
          );
          annotateElementCandidates(path.node, result);
        },
      },
    },
  };
});
