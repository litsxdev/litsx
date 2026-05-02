import { declare } from "@babel/helper-plugin-utils";

let t;

const COMPONENT_WRAPPERS = new Map([
  [
    "forwardRef",
    {
      kind: "forward",
      modules: new Set(["react"]),
      propName: "ref",
    },
  ],
  [
    "memo",
    {
      kind: "memo",
      modules: new Set(["react"]),
    },
  ],
]);

export function setReactWrappersBabelTypes(nextTypes) {
  t = nextTypes;
}

function getImportSource(bindingPath) {
  if (!bindingPath || !bindingPath.parentPath) return null;
  const importDecl = bindingPath.parentPath;
  if (!importDecl.isImportDeclaration()) return null;
  return importDecl.node.source.value;
}

function createMemoWarnings(callPath) {
  const warnings = [];
  const args = callPath.get("arguments");
  const line = callPath.node.loc?.start?.line ?? null;
  const column = callPath.node.loc?.start?.column ?? null;

  warnings.push({
    code: 91016,
    message:
      "`memo(...)` is removed during LitSX lowering. LitSX does not use React-style parent re-render bailout semantics, so `memo` is treated as a migration wrapper only.",
    line,
    column,
  });

  if (args.length > 1) {
    warnings.push({
      code: 91017,
      message:
        "`memo(Component, areEqual)` ignores the comparator during LitSX lowering because LitSX does not use React-style parent re-render bailout semantics.",
      line,
      column,
    });
  }

  return warnings;
}

function buildForwardRefOptions(functionPath, meta) {
  const params = functionPath.node.params || [];
  if (params.length > 1 && t.isIdentifier(params[1])) {
    return {
      forwardRef: {
        paramIndex: 1,
        propName: meta?.helper?.propName || "ref",
      },
    };
  }
  return {};
}

function getReactWrapperHelperMetadata(callPath) {
  if (!callPath || !callPath.isCallExpression()) {
    return null;
  }

  const calleePath = callPath.get("callee");
  let importSpecifierPath = null;
  let shouldRemoveImport = false;
  let helperConfig = null;

  if (calleePath.isIdentifier()) {
    const binding = callPath.scope.getBinding(calleePath.node.name);
    if (!binding) return null;
    const bindingPath = binding.path;
    const source = getImportSource(bindingPath);
    if (!source) return null;

    if (
      bindingPath.isImportSpecifier() &&
      t.isIdentifier(bindingPath.node.imported)
    ) {
      const importedName = bindingPath.node.imported.name;
      const entry = COMPONENT_WRAPPERS.get(importedName);
      if (!entry || !entry.modules.has(source)) {
        return null;
      }
      helperConfig = entry;
      importSpecifierPath = bindingPath;
      shouldRemoveImport = binding.referencePaths.length === 1;
    } else {
      return null;
    }
  } else if (calleePath.isMemberExpression({ computed: false })) {
    const property = calleePath.get("property");
    if (!property.isIdentifier()) {
      return null;
    }
    const entry = COMPONENT_WRAPPERS.get(property.node.name);
    if (!entry) {
      return null;
    }
    const object = calleePath.get("object");
    if (!object.isIdentifier()) return null;
    const binding = callPath.scope.getBinding(object.node.name);
    if (!binding) return null;
    const bindingPath = binding.path;
    const source = getImportSource(bindingPath);
    if (!source || !entry.modules.has(source)) {
      return null;
    }

    if (bindingPath.isImportSpecifier()) {
      if (!t.isIdentifier(bindingPath.node.imported, { name: property.node.name })) {
        return null;
      }
      importSpecifierPath = bindingPath;
      shouldRemoveImport = binding.referencePaths.length === 1;
    } else if (
      !bindingPath.isImportDefaultSpecifier() &&
      !bindingPath.isImportNamespaceSpecifier()
    ) {
      return null;
    }

    helperConfig = entry;
  } else {
    return null;
  }

  return {
    importSpecifierPath,
    shouldRemoveImport,
    helper: helperConfig,
  };
}

export function getReactWrapperMetadata(callPath) {
  const helperMeta = getReactWrapperHelperMetadata(callPath);
  if (!helperMeta) {
    return null;
  }

  const args = callPath.get("arguments");
  if (!args.length) {
    return null;
  }

  const firstArg = args[0];

  if (helperMeta.helper.kind === "memo") {
    const warnings = createMemoWarnings(callPath);

    if (firstArg.isCallExpression()) {
      const innerMeta = getReactWrapperMetadata(firstArg);
      if (!innerMeta) {
        return null;
      }

      return {
        functionPath: innerMeta.functionPath,
        options: innerMeta.options,
        cleanups: [helperMeta, ...(innerMeta.cleanups || [])],
        helperKind: innerMeta.helperKind,
        anonymous: innerMeta.anonymous,
        warnings: [...warnings, ...(innerMeta.warnings || [])],
      };
    }

    if (
      firstArg.isFunctionExpression() ||
      firstArg.isArrowFunctionExpression()
    ) {
      return {
        functionPath: firstArg,
        options: {},
        cleanups: [helperMeta],
        helperKind: helperMeta.helper.kind,
        anonymous: Boolean(helperMeta.helper.anonymous),
        warnings,
      };
    }

    return null;
  }

  if (
    !firstArg.isFunctionExpression() &&
    !firstArg.isArrowFunctionExpression()
  ) {
    return null;
  }

  return {
    functionPath: firstArg,
    options: buildForwardRefOptions(firstArg, helperMeta),
    cleanups: [helperMeta],
    helperKind: helperMeta.helper.kind,
    anonymous: Boolean(helperMeta.helper.anonymous),
    warnings: [],
  };
}

export default declare((api) => {
  api.assertVersion("^8.0.0-0");
  setReactWrappersBabelTypes(api.types);
  return {
    name: "transform-react-wrappers",
    visitor: {},
  };
});
