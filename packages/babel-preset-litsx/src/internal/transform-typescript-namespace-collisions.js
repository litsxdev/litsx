function getDeclaredValueNames(statement, t) {
  const declaration = t.isExportNamedDeclaration(statement) || t.isExportDefaultDeclaration(statement)
    ? statement.declaration
    : statement;
  if (t.isFunctionDeclaration(declaration) || t.isClassDeclaration(declaration)) {
    return declaration.id ? [declaration.id.name] : [];
  }
  if (t.isVariableDeclaration(declaration)) {
    return declaration.declarations
      .map((entry) => t.isIdentifier(entry.id) ? entry.id.name : null)
      .filter(Boolean);
  }
  return [];
}

export default function transformTypescriptNamespaceCollisions(api) {
  api.assertVersion("^8.0.0");
  const t = api.types;

  return {
    name: "transform-typescript-namespace-collisions",
    visitor: {
      Program: {
        enter(path) {
          const valueNames = new Set(
            path.node.body.flatMap((statement) => getDeclaredValueNames(statement, t)),
          );
          if (valueNames.size === 0) return;

          for (const statementPath of path.get("body")) {
            if (!statementPath.isImportDeclaration()) continue;
            const declarationIsTypeOnly = statementPath.node.importKind === "type";
            for (const specifierPath of statementPath.get("specifiers")) {
              const localName = specifierPath.node.local?.name;
              const specifierIsTypeOnly = declarationIsTypeOnly || specifierPath.node.importKind === "type";
              if (specifierIsTypeOnly && valueNames.has(localName)) {
                specifierPath.remove();
              }
            }
            if (statementPath.node.specifiers.length === 0) {
              statementPath.remove();
            }
          }
        },
      },
    },
  };
}
