let t;

function isCapitalizedComponentName(name) {
  if (typeof name !== "string" || name.length === 0) {
    return false;
  }

  const first = name[0];
  return first === first.toUpperCase() && first !== first.toLowerCase();
}

function isAsyncFunctionLike(node) {
  return Boolean(
    node &&
    node.async === true &&
    (t.isFunctionDeclaration(node) ||
      t.isFunctionExpression(node) ||
      t.isArrowFunctionExpression(node))
  );
}

export function setWrapperUtilsBabelTypes(nextTypes) {
  t = nextTypes;
}

function emitWrapperWarnings(meta, warn) {
  if (!meta || typeof warn !== "function" || !Array.isArray(meta.warnings)) {
    return;
  }

  meta.warnings.forEach((warning) => warn(warning));
}

function pruneWrapperImports(meta) {
  if (!meta || !Array.isArray(meta.cleanups)) {
    return;
  }

  meta.cleanups.forEach((cleanup) => {
    if (!cleanup || !cleanup.shouldRemoveImport || !cleanup.importSpecifierPath) {
      return;
    }
    const importDecl = cleanup.importSpecifierPath.parentPath;
    cleanup.importSpecifierPath.remove();
    if (importDecl.node.specifiers.length === 0) {
      importDecl.remove();
    }
  });
}

export function maybeTransformWrappedVariableDeclarator({
  varPath,
  resolvedPluginOptions,
  state,
  transformFunction,
  updateTransformState,
  getWrapperMetadata,
}) {
  if (typeof getWrapperMetadata !== "function") {
    return false;
  }

  const initPath = varPath.get("init");
  if (!initPath || !initPath.isCallExpression()) {
    return false;
  }

  const wrapperMeta = getWrapperMetadata(initPath);
  if (!wrapperMeta) {
    return false;
  }

  emitWrapperWarnings(wrapperMeta, (warning) => {
    state?.__litsxWarnings?.push(warning);
  });

  const programPath = varPath.findParent((p) => p.isProgram());
  const localName = t.isIdentifier(varPath.node.id)
    ? varPath.node.id.name
    : undefined;

  const classNode = transformFunction(
    wrapperMeta.functionPath,
    programPath,
    localName,
    {
      ...resolvedPluginOptions,
      ...wrapperMeta.options,
      state,
      typeResolver: state?.__litsxTypeResolver,
      warn: (warning) => {
        state?.__litsxWarnings?.push(warning);
      },
    }
  );

  if (!classNode) {
    return true;
  }

  if (t.isIdentifier(varPath.node.id)) {
    varPath.scope.removeBinding(varPath.node.id.name);
  }

  const declarationPath = varPath.parentPath;
  if (!declarationPath.isVariableDeclaration()) {
    return true;
  }

  declarationPath.replaceWith(classNode);
  declarationPath.requeue();
  pruneWrapperImports(wrapperMeta);
  updateTransformState?.(state, classNode);
  return true;
}

export function handlePotentialComponentExport({
  exportPath,
  state,
  isDefault = false,
  transformFunction,
  isInsideFunctionOrClass,
  updateTransformState,
  getWrapperMetadata,
}) {
  const declaration = exportPath.node.declaration;
  const typeResolver = state?.__litsxTypeResolver || null;
  if (!declaration || isInsideFunctionOrClass(exportPath)) {
    return false;
  }

  if (
    t.isFunctionDeclaration(declaration) ||
    (t.isVariableDeclaration(declaration) &&
      declaration.declarations.length === 1 &&
      t.isArrowFunctionExpression(declaration.declarations[0].init))
  ) {
    if (
      t.isFunctionDeclaration(declaration) && isAsyncFunctionLike(declaration)
    ) {
      return false;
    }

    if (
      t.isVariableDeclaration(declaration) &&
      isAsyncFunctionLike(declaration.declarations[0]?.init)
    ) {
      return false;
    }

    const funcPath = exportPath.get("declaration");
    const declarationPath = funcPath.isVariableDeclaration()
      ? funcPath.get("declarations.0.init")
      : funcPath;
    let exportName;
    if (t.isFunctionDeclaration(declaration) && declaration.id) {
      exportName = declaration.id.name;
    } else if (
      t.isVariableDeclaration(declaration) &&
      t.isIdentifier(declaration.declarations[0].id)
    ) {
      exportName = declaration.declarations[0].id.name;
    }

    if (exportName && !isCapitalizedComponentName(exportName)) {
      return false;
    }

    const classNode = transformFunction(
      declarationPath,
      exportPath.findParent((p) => p.isProgram()),
      exportName,
      {
        ...state?.__litsxResolvedPluginOptions,
        state,
        typeResolver,
        warn: (warning) => {
          state?.__litsxWarnings?.push(warning);
        },
      }
    );

    if (!classNode) return true;

    if (exportName) {
      exportPath.scope.removeBinding(exportName);
    }

    exportPath.insertBefore(
      isDefault
        ? t.exportDefaultDeclaration(classNode)
        : t.exportNamedDeclaration(classNode, [])
    );
    exportPath.remove();
    updateTransformState?.(state, classNode);
    return true;
  }

  if (
    typeof getWrapperMetadata === "function" &&
    t.isVariableDeclaration(declaration) &&
    declaration.declarations.length === 1
  ) {
    const declaratorPath = exportPath.get("declaration.declarations.0");
    const initPath = declaratorPath.get("init");
    const exportName = t.isIdentifier(declaratorPath.node.id)
      ? declaratorPath.node.id.name
      : undefined;
    const programPath = exportPath.findParent((p) => p.isProgram());

    if (exportName && !isCapitalizedComponentName(exportName)) {
      return false;
    }

    if (initPath.isCallExpression()) {
      const wrapperMeta = getWrapperMetadata(initPath);
      if (!wrapperMeta) return false;
      emitWrapperWarnings(wrapperMeta, (warning) => {
        state?.__litsxWarnings?.push(warning);
      });

      const classNode = transformFunction(
        wrapperMeta.functionPath,
        programPath,
        exportName,
        {
          ...state?.__litsxResolvedPluginOptions,
          ...wrapperMeta.options,
          state,
          typeResolver,
          warn: (warning) => {
            state?.__litsxWarnings?.push(warning);
          },
        }
      );
      if (!classNode) return true;

      if (exportName) {
        exportPath.scope.removeBinding(exportName);
      }

      exportPath.replaceWith(
        isDefault
          ? t.exportDefaultDeclaration(classNode)
          : t.exportNamedDeclaration(classNode, [])
      );
      exportPath.requeue();
      pruneWrapperImports(wrapperMeta);
      updateTransformState?.(state, classNode);
      return true;
    }
  }

  if (typeof getWrapperMetadata === "function" && isDefault && t.isCallExpression(declaration)) {
    const callPath = exportPath.get("declaration");
    const wrapperMeta = getWrapperMetadata(callPath);
    if (!wrapperMeta) return false;
    emitWrapperWarnings(wrapperMeta, (warning) => {
      state?.__litsxWarnings?.push(warning);
    });

    const programPath = exportPath.findParent((p) => p.isProgram());
    const inferredName = wrapperMeta.functionPath.node.id
      ? wrapperMeta.functionPath.node.id.name
      : undefined;

    if (!inferredName || !isCapitalizedComponentName(inferredName)) {
      return false;
    }

    const classNode = transformFunction(
      wrapperMeta.functionPath,
      programPath,
      inferredName,
      {
        ...state?.__litsxResolvedPluginOptions,
        ...wrapperMeta.options,
        state,
        typeResolver,
        warn: (warning) => {
          state?.__litsxWarnings?.push(warning);
        },
      }
    );
    if (!classNode) return true;

    exportPath.replaceWith(t.exportDefaultDeclaration(classNode));
    exportPath.requeue();
    pruneWrapperImports(wrapperMeta);
    updateTransformState?.(state, classNode);
    return true;
  }

  return false;
}
