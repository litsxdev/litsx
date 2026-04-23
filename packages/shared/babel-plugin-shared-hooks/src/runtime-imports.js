export function ensureRuntimeNamedImports(programPath, runtimeModule, importNames, t) {
  const names = Array.from(new Set(importNames)).filter(Boolean);
  if (names.length === 0) return;

  const runtimeImports = programPath
    .get('body')
    .filter(
      (child) => child.isImportDeclaration() && child.node.source.value === runtimeModule
    );

  let targetImport = runtimeImports.find(
    (path) => !path.node.specifiers.some((spec) => t.isImportNamespaceSpecifier(spec))
  );

  if (!targetImport) {
    const importDecl = t.importDeclaration(
      names.map((name) => t.importSpecifier(t.identifier(name), t.identifier(name))),
      t.stringLiteral(runtimeModule)
    );

    const [firstImport] = programPath
      .get('body')
      .filter((child) => child.isImportDeclaration());

    if (runtimeImports.length === 0) {
      if (firstImport) {
        firstImport.insertBefore(importDecl);
      } else {
        programPath.unshiftContainer('body', importDecl);
      }
      return;
    }

    runtimeImports[0].insertAfter(importDecl);
    return;
  }

  const existingNamed = new Set(
    targetImport.node.specifiers
      .filter((spec) => t.isImportSpecifier(spec) && t.isIdentifier(spec.imported))
      .map((spec) => spec.imported.name)
  );

  names.forEach((name) => {
    if (existingNamed.has(name)) return;
    targetImport.node.specifiers.push(
      t.importSpecifier(t.identifier(name), t.identifier(name))
    );
  });
}
