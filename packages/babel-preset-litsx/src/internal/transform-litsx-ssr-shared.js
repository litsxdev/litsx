let t;

export function setSsrSharedBabelTypes(nextTypes) {
  t = nextTypes;
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

    const declarationPath = resolveTopLevelDeclarationPath(nodePath);
    if (!declarationPath) return;

    const localName = declarationPath.node.id?.name;
    if (!localName) return;

    availableMap.set(localName, {
      originalName: localName,
      local: true,
    });
  });

  return availableMap;
}

function resolveTopLevelDeclarationPath(nodePath) {
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
        declarationPath.isFunctionDeclaration() ||
        declarationPath.isVariableDeclaration())
    ) {
      return resolveTopLevelDeclarationPath(declarationPath);
    }
  }

  return null;
}

export function collectScopedEntries(rootPath, availableMap) {
  const used = new Map();

  rootPath.traverse({
    JSXOpeningElement(path) {
      const nameNode = path.get("name");

      if (!nameNode.isJSXIdentifier()) {
        return;
      }

      const originalName = nameNode.node.name;
      if (!availableMap.has(originalName)) {
        return;
      }

      const tagName = toKebab(originalName);
      nameNode.node.name = tagName;
      used.set(originalName, {
        originalName,
        tagName,
      });
    },
    JSXClosingElement(path) {
      const nameNode = path.get("name");

      if (!nameNode.isJSXIdentifier()) {
        return;
      }

      const originalName = nameNode.node.name;
      if (!availableMap.has(originalName)) {
        return;
      }

      nameNode.node.name = toKebab(originalName);
    },
  });

  return Array.from(used.values());
}

export function ensureNamedImport(programPath, moduleName, importName) {
  const existingImport = programPath.get("body").find(
    (nodePath) =>
      nodePath.isImportDeclaration() &&
      nodePath.node.source.value === moduleName,
  );

  if (existingImport) {
    const hasImport = existingImport.node.specifiers.some(
      (specifier) =>
        t.isImportSpecifier(specifier) &&
        t.isIdentifier(specifier.imported, { name: importName }),
    );

    if (!hasImport) {
      existingImport.node.specifiers.push(
        t.importSpecifier(t.identifier(importName), t.identifier(importName)),
      );
    }
    return;
  }

  programPath.unshiftContainer(
    "body",
    t.importDeclaration(
      [t.importSpecifier(t.identifier(importName), t.identifier(importName))],
      t.stringLiteral(moduleName),
    ),
  );
}
