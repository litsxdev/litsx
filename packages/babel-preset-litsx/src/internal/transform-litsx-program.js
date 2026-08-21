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

function ensureNamedImportAcross(importPaths, importedName) {
  if (
    importPaths.some((importPath) =>
      importPath.node.specifiers.some(
        (specifier) =>
          t.isImportSpecifier(specifier) &&
          t.isIdentifier(specifier.imported, { name: importedName })
      )
    )
  ) {
    return true;
  }

  const target = importPaths.find(
    (importPath) =>
      !importPath.node.specifiers.some((specifier) =>
        t.isImportNamespaceSpecifier(specifier)
      )
  );

  return target ? ensureNamedImport(target, importedName) : false;
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

  const litElementImported = ensureNamedImportAcross(litImports, "LitElement");

  if (!litElementImported) {
    programPath.unshiftContainer("body", createLitElementImport());
  }

  if (state.__litsxNeedsCss) {
    const nextBodyPaths = programPath.get("body");
    const nextLitImports = nextBodyPaths.filter(
      (n) => n.isImportDeclaration() && n.node.source.value === "lit"
    );
    ensureNamedImportAcross(nextLitImports, "css");
  }

  if (state.__litsxNeedsUnsafeCss) {
    const nextBodyPaths = programPath.get("body");
    const nextLitImports = nextBodyPaths.filter(
      (n) => n.isImportDeclaration() && n.node.source.value === "lit"
    );
    ensureNamedImportAcross(nextLitImports, "unsafeCSS");
  }

  if (state.__litsxNeedsStaticHoistsMixin) {
    const bodyPathsWithInternal = programPath.get("body");
    const internalImports = bodyPathsWithInternal.filter(
      (n) => n.isImportDeclaration() && n.node.source.value === "@litsx/core/elements"
    );

    const internalImported = ensureNamedImportAcross(
      internalImports,
      "LitsxStaticHoistsMixin"
    );

    if (!internalImported) {
      programPath.unshiftContainer("body", createLitsxInfrastructureImport("LitsxStaticHoistsMixin"));
    }
  }

  if (state.__litsxNeedsLightDomMixin) {
    const bodyPathsWithInternal = programPath.get("body");
    const internalImports = bodyPathsWithInternal.filter(
      (n) => n.isImportDeclaration() && n.node.source.value === "@litsx/core/elements"
    );

    const internalImported = ensureNamedImportAcross(
      internalImports,
      "LightDomMixin"
    );

    if (!internalImported) {
      programPath.unshiftContainer("body", createLitsxInfrastructureImport("LightDomMixin"));
    }
  }

  if (state.__litsxNeedsHydrationSuspenseMixin) {
    const bodyPathsWithInternal = programPath.get("body");
    const internalImports = bodyPathsWithInternal.filter(
      (n) => n.isImportDeclaration() && n.node.source.value === "@litsx/core/elements"
    );

    const internalImported = ensureNamedImportAcross(
      internalImports,
      "HydrationSuspenseMixin"
    );

    if (!internalImported) {
      programPath.unshiftContainer("body", createLitsxInfrastructureImport("HydrationSuspenseMixin"));
    }
  }

  if (state.__litsxNeedsModuleIdMetadata) {
    const bodyPathsWithInternal = programPath.get("body");
    const internalImports = bodyPathsWithInternal.filter(
      (n) => n.isImportDeclaration() && n.node.source.value === "@litsx/core/elements"
    );

    let internalImported = false;
    internalImports.some((importPath) => {
      if (ensureNamedImport(importPath, "LITSX_MODULE_ID")) {
        internalImported = true;
        return true;
      }

      return false;
    });

    if (!internalImported) {
      programPath.unshiftContainer("body", createLitsxInfrastructureImport("LITSX_MODULE_ID"));
    }
  }

  if (state.__litsxNeedsCallbackRef) {
    const bodyPathsWithLitsx = programPath.get("body");
    const litsxImports = bodyPathsWithLitsx.filter(
      (n) => n.isImportDeclaration() && n.node.source.value === "@litsx/core"
    );

    const litsxImported = ensureNamedImportAcross(
      litsxImports,
      "useCallbackRef"
    );

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

    const internalRuntimeImported = ensureNamedImportAcross(
      internalRuntimeImports,
      "renderRendererCall"
    );

    if (!internalRuntimeImported) {
      programPath.unshiftContainer("body", createLitsxInternalRuntimeImport("renderRendererCall"));
    }
  }

}
