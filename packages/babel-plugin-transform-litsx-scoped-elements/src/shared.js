let t;
const CORE_LIGHT_DOM_EXPORTS = new Set([
  "ErrorBoundary",
  "SuspenseBoundary",
  "SuspenseList",
]);

export function setTypes(apiTypes) {
  t = apiTypes;
}

export function toKebab(name) {
  return name.replace(/([a-z])([A-Z])/g, "$1-$2").toLowerCase();
}

export function buildAvailableMap(programPath) {
  const availableMap = new Map();

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
          });
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

  return availableMap;
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
