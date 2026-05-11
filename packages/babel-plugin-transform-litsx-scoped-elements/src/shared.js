let t;

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
      nodePath.node.specifiers.forEach((specifier) => {
        if (t.isImportSpecifier(specifier) || t.isImportDefaultSpecifier(specifier)) {
          availableMap.set(specifier.local.name, {
            originalName: specifier.local.name,
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
    });
  });

  return availableMap;
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
