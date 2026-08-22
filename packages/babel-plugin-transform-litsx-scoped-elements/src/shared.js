import fs from "node:fs";
import path from "node:path";
import { toKebabCase } from "@litsx/authoring";
import { normalizeFilePath } from "@litsx/typescript-session";

let t;
const CORE_LIGHT_DOM_EXPORTS = new Set([
  "ErrorBoundary",
  "SuspenseBoundary",
  "SuspenseList",
]);
const IMPORT_RESOLUTION_EXTENSIONS = [
  ".jsx",
  ".js",
  ".tsx",
  ".ts",
];

export function setTypes(apiTypes) {
  t = apiTypes;
}

export function toKebab(name) {
  return toKebabCase(name);
}

export function buildAvailableMap(programPath, options = {}) {
  const availableMap = new Map();
  const namespaceImports = new Set();
  const filename = normalizeFilePath(options.filename || programPath.hub.file?.opts?.filename || "");

  programPath.get("body").forEach((nodePath) => {
    if (nodePath.isImportDeclaration()) {
      const isCoreImport = nodePath.node.source.value === "@litsx/core";
      nodePath.node.specifiers.forEach((specifier) => {
        if (t.isImportSpecifier(specifier) || t.isImportDefaultSpecifier(specifier)) {
          const importedName =
            isCoreImport && t.isImportSpecifier(specifier)
              ? specifier.imported.name
              : null;
          availableMap.set(specifier.local.name, {
            originalName: specifier.local.name,
            lightDom: Boolean(importedName && CORE_LIGHT_DOM_EXPORTS.has(importedName)),
            moduleId: resolveImportModuleId(filename, nodePath.node.source.value),
          });
          return;
        }

        if (t.isImportNamespaceSpecifier(specifier)) {
          namespaceImports.add(specifier.local.name);
          const source = nodePath.node.source.value;
          if (source !== "react" && source !== "@litsx/react" && !source.startsWith("react/")) {
            availableMap.set(specifier.local.name, {
              originalName: specifier.local.name,
              namespace: true,
              source,
              moduleId: resolveImportModuleId(filename, source),
            });
          }
        }
      });
      return;
    }

    const localClassPath = resolveTopLevelClassPath(nodePath);
    if (!localClassPath) return;

    const localName = localClassPath.node.id?.name;
    if (!localName) return;

    availableMap.set(localName, {
      originalName: localName,
      local: true,
      lightDom: isLightDomClass(localClassPath.node),
    });
  });

  programPath.get("body").forEach((nodePath) => {
    if (!nodePath.isVariableDeclaration()) return;

    nodePath.node.declarations.forEach((declarator) => {
      if (!t.isIdentifier(declarator.id)) return;
      const init = unwrapNamespaceAliasExpression(declarator.init);
      const object = t.isMemberExpression(init)
        ? unwrapNamespaceAliasExpression(init.object)
        : null;
      if (
        !t.isMemberExpression(init) ||
        init.computed ||
        !t.isIdentifier(object) ||
        !t.isIdentifier(init.property) ||
        !namespaceImports.has(object.name)
      ) {
        return;
      }

      availableMap.set(declarator.id.name, {
        originalName: declarator.id.name,
      });
    });
  });

  return availableMap;
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

function resolveImportModuleId(fromFilename, sourceSpecifier) {
  if (typeof sourceSpecifier !== "string" || sourceSpecifier.length === 0) {
    return null;
  }

  if (
    !sourceSpecifier.startsWith("./") &&
    !sourceSpecifier.startsWith("../") &&
    !sourceSpecifier.startsWith("/")
  ) {
    return sourceSpecifier;
  }

  if (!fromFilename) {
    return sourceSpecifier;
  }

  const basePath = sourceSpecifier.startsWith("/")
    ? sourceSpecifier
    : path.resolve(path.dirname(fromFilename), sourceSpecifier);
  const candidates = IMPORT_RESOLUTION_EXTENSIONS.some((extension) => basePath.endsWith(extension))
    ? [basePath]
    : [
        ...IMPORT_RESOLUTION_EXTENSIONS.map((extension) => `${basePath}${extension}`),
        ...IMPORT_RESOLUTION_EXTENSIONS.map((extension) => path.join(basePath, `index${extension}`)),
      ];

  for (const candidate of candidates) {
    try {
      if (fs.statSync(candidate).isFile()) {
        return normalizeFilePath(candidate);
      }
    } catch {
      // Ignore resolution misses and continue.
    }
  }

  return sourceSpecifier;
}

function isLightDomClass(node) {
  return Boolean(node?._litsxLightDom) || hasMixinInSuperChain(node?.superClass, "LightDomMixin");
}

function hasMixinInSuperChain(node, mixinName) {
  if (!node) {
    return false;
  }

  if (
    t.isCallExpression(node) &&
    t.isIdentifier(node.callee) &&
    node.callee.name === mixinName
  ) {
    return true;
  }

  if (t.isCallExpression(node)) {
    return node.arguments.some((argument) =>
      t.isExpression(argument) && hasMixinInSuperChain(argument, mixinName)
    );
  }

  return false;
}

function resolveTopLevelClassPath(nodePath) {
  if (nodePath.isClassDeclaration() || nodePath.isFunctionDeclaration()) {
    return nodePath;
  }

  if (nodePath.isVariableDeclaration()) {
    const declarator = nodePath.node.declarations[0];
    if (t.isIdentifier(declarator?.id)) {
      return {
        node: { id: declarator.id },
      };
    }
  }

  if (nodePath.isExportNamedDeclaration()) {
    const declarationPath = nodePath.get("declaration");
    if (
      declarationPath &&
      (declarationPath.isClassDeclaration() ||
        declarationPath.isFunctionDeclaration())
    ) {
      return declarationPath;
    }
  }

  return null;
}
