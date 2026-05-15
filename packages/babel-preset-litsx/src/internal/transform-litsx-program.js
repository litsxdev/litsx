let t;

export function setProgramBabelTypes(nextTypes) {
  t = nextTypes;
}

function createLitElementImport() {
  return t.importDeclaration(
    [
      t.importSpecifier(t.identifier("LitElement"), t.identifier("LitElement")),
    ],
    t.stringLiteral("lit")
  );
}

function createLitsxInfrastructureImport(importedName) {
  return t.importDeclaration(
    [
      t.importSpecifier(t.identifier(importedName), t.identifier(importedName)),
    ],
    t.stringLiteral("@litsx/core/elements")
  );
}

function createLitsxInternalRuntimeImport(importedName) {
  return t.importDeclaration(
    [
      t.importSpecifier(t.identifier(importedName), t.identifier(importedName)),
    ],
    t.stringLiteral("@litsx/core/rendering")
  );
}

function createLitsxImport(importedName) {
  return t.importDeclaration(
    [
      t.importSpecifier(t.identifier(importedName), t.identifier(importedName)),
    ],
    t.stringLiteral("@litsx/core")
  );
}

function ensureNamedImport(importPath, importedName) {
  const specifiers = importPath.node.specifiers;

  if (
    specifiers.some(
      (specifier) =>
        t.isImportSpecifier(specifier) &&
        t.isIdentifier(specifier.imported, { name: importedName })
    )
  ) {
    return true;
  }

  if (specifiers.some((specifier) => t.isImportNamespaceSpecifier(specifier))) {
    return false;
  }

  specifiers.push(
    t.importSpecifier(t.identifier(importedName), t.identifier(importedName))
  );
  return true;
}

function pruneUnusedLitsxStaticImports(programPath) {
  programPath.scope.crawl();

  const bodyPaths = programPath.get("body");
  const litsxImports = bodyPaths.filter(
    (path) => path.isImportDeclaration() && path.node.source.value === "@litsx/core"
  );

  litsxImports.forEach((importPath) => {
    const removableSpecifiers = importPath.get("specifiers").filter((specifierPath) => {
      if (!specifierPath.isImportSpecifier()) return false;
      if (!t.isIdentifier(specifierPath.node.imported)) return false;

      const importedName = specifierPath.node.imported.name;
      if (importedName !== "staticStyles" && importedName !== "staticProps") {
        return false;
      }

      const localName = t.isIdentifier(specifierPath.node.local)
        ? specifierPath.node.local.name
        : importedName;
      const binding = specifierPath.scope.getBinding(localName);
      return !binding || binding.referencePaths.length === 0;
    });

    removableSpecifiers.forEach((specifierPath) => {
      specifierPath.remove();
    });

    if (importPath.node.specifiers.length === 0) {
      importPath.remove();
    }
  });
}

export function finalizeProgram(programPath, state) {
  if (!state?.__litsxTransformCount) {
    return;
  }

  const hoistDeclarations = [];
  for (const bodyPath of programPath.get("body")) {
    const node = bodyPath.isClassDeclaration()
      ? bodyPath.node
      : bodyPath.isVariableDeclaration()
        ? bodyPath.node
        : bodyPath.isExportNamedDeclaration() || bodyPath.isExportDefaultDeclaration()
          ? bodyPath.node.declaration
          : null;

    if (!node) {
      continue;
    }

    if (t.isClassDeclaration(node) && Array.isArray(node._litsxStaticSymbolDeclarations)) {
      hoistDeclarations.push(...node._litsxStaticSymbolDeclarations);
      continue;
    }

    if (t.isVariableDeclaration(node)) {
      node.declarations.forEach((declarator) => {
        if (Array.isArray(declarator.init?._litsxStaticSymbolDeclarations)) {
          hoistDeclarations.push(...declarator.init._litsxStaticSymbolDeclarations);
        }
      });
    }
  }

  if (hoistDeclarations.length > 0) {
    programPath.unshiftContainer("body", hoistDeclarations);
  }

  const bodyPaths = programPath.get("body");
  const litImports = bodyPaths.filter(
    (n) => n.isImportDeclaration() && n.node.source.value === "lit"
  );

  let litElementImported = false;

  litImports.some((importPath) => {
    if (ensureNamedImport(importPath, "LitElement")) {
      litElementImported = true;
      return true;
    }

    return false;
  });

  if (!litElementImported) {
    programPath.unshiftContainer("body", createLitElementImport());
  }

  if (state.__litsxNeedsCss) {
    const nextBodyPaths = programPath.get("body");
    const nextLitImports = nextBodyPaths.filter(
      (n) => n.isImportDeclaration() && n.node.source.value === "lit"
    );
    nextLitImports.some((importPath) => ensureNamedImport(importPath, "css"));
  }

  if (state.__litsxNeedsUnsafeCss) {
    const nextBodyPaths = programPath.get("body");
    const nextLitImports = nextBodyPaths.filter(
      (n) => n.isImportDeclaration() && n.node.source.value === "lit"
    );
    nextLitImports.some((importPath) => ensureNamedImport(importPath, "unsafeCSS"));
  }

  if (state.__litsxNeedsStaticHoistsMixin) {
    const bodyPathsWithInternal = programPath.get("body");
    const internalImports = bodyPathsWithInternal.filter(
      (n) => n.isImportDeclaration() && n.node.source.value === "@litsx/core/elements"
    );

    let internalImported = false;
    internalImports.some((importPath) => {
      if (ensureNamedImport(importPath, "LitsxStaticHoistsMixin")) {
        internalImported = true;
        return true;
      }

      return false;
    });

    if (!internalImported) {
      programPath.unshiftContainer("body", createLitsxInfrastructureImport("LitsxStaticHoistsMixin"));
    }
  }

  if (state.__litsxNeedsLightDomMixin) {
    const bodyPathsWithInternal = programPath.get("body");
    const internalImports = bodyPathsWithInternal.filter(
      (n) => n.isImportDeclaration() && n.node.source.value === "@litsx/core/elements"
    );

    let internalImported = false;
    internalImports.some((importPath) => {
      if (ensureNamedImport(importPath, "LightDomMixin")) {
        internalImported = true;
        return true;
      }

      return false;
    });

    if (!internalImported) {
      programPath.unshiftContainer("body", createLitsxInfrastructureImport("LightDomMixin"));
    }
  }

  if (state.__litsxNeedsCallbackRef) {
    const bodyPathsWithLitsx = programPath.get("body");
    const litsxImports = bodyPathsWithLitsx.filter(
      (n) => n.isImportDeclaration() && n.node.source.value === "@litsx/core"
    );

    let litsxImported = false;
    litsxImports.some((importPath) => {
      if (ensureNamedImport(importPath, "useCallbackRef")) {
        litsxImported = true;
        return true;
      }

      return false;
    });

    if (!litsxImported) {
      programPath.unshiftContainer("body", createLitsxImport("useCallbackRef"));
    }
  }

  if (state.__litsxNeedsRendererCallImport) {
    const bodyPathsWithInternalRuntime = programPath.get("body");
    const internalRuntimeImports = bodyPathsWithInternalRuntime.filter(
      (n) =>
        n.isImportDeclaration() &&
        n.node.source.value === "@litsx/core/rendering"
    );

    let internalRuntimeImported = false;
    internalRuntimeImports.some((importPath) => {
      if (ensureNamedImport(importPath, "renderRendererCall")) {
        internalRuntimeImported = true;
        return true;
      }

      return false;
    });

    if (!internalRuntimeImported) {
      programPath.unshiftContainer("body", createLitsxInternalRuntimeImport("renderRendererCall"));
    }
  }

  pruneUnusedLitsxStaticImports(programPath);
}
