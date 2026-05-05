let t;

export function setParamRewriteBabelTypes(nextTypes) {
  t = nextTypes;
}

function createThisMemberExpression(propName) {
  return t.memberExpression(t.thisExpression(), t.identifier(propName));
}

export function transformJSXExpressions(jsxPath, bindings, state = null) {
  const localNames = Array.from(bindings.keys());

  jsxPath.traverse({
    JSXExpressionContainer(expressionPath) {
      if (t.isIdentifier(expressionPath.node.expression)) {
        const name = expressionPath.node.expression.name;
        if (localNames.includes(name)) {
          const propName = bindings.get(name) || name;
          expressionPath.node.expression = t.memberExpression(
            t.thisExpression(),
            t.identifier(propName)
          );
        }
      }
    },
  });
}

function registerLocalPropAliases(functionPath, bindings) {
  let changed = true;

  while (changed) {
    changed = false;

    functionPath.traverse({
      VariableDeclarator(path) {
        if (path.getFunctionParent() !== functionPath) return;

        const { id, init } = path.node;
        if (!t.isIdentifier(init)) return;

        if (t.isIdentifier(id)) {
          if (bindings.has(id.name) || !bindings.has(init.name)) return;
          bindings.set(id.name, bindings.get(init.name));
          changed = true;
          return;
        }

        if (!t.isObjectPattern(id)) return;

        const bindingInfo = bindings.get(init.name);
        if (!bindingInfo || typeof bindingInfo !== "object" || bindingInfo.kind !== "alias") {
          return;
        }

        id.properties.forEach((property) => {
          if (!t.isObjectProperty(property)) return;

          const keyName = t.isIdentifier(property.key)
            ? property.key.name
            : t.isStringLiteral(property.key)
              ? property.key.value
              : null;

          if (!keyName || !bindingInfo.properties.has(keyName)) return;

          if (t.isIdentifier(property.value)) {
            if (!bindings.has(property.value.name)) {
              bindings.set(property.value.name, keyName);
              changed = true;
            }
            return;
          }

          if (
            t.isAssignmentPattern(property.value) &&
            t.isIdentifier(property.value.left) &&
            !bindings.has(property.value.left.name)
          ) {
            bindings.set(property.value.left.name, keyName);
            changed = true;
          }
        });
      },
    });
  }
}

function shouldCapturePropReference(refPath, functionPath) {
  const functionParent = refPath.getFunctionParent();
  if (!functionParent || functionParent === functionPath) {
    return false;
  }

  return !functionParent.isArrowFunctionExpression();
}

export function replaceParamReferences(functionPath, bindings, propertyMap = new Map()) {
  registerLocalPropAliases(functionPath, bindings);

  const capturedPropAliases = new Map();

  function getReplacementForProp(propName, refPath) {
    if (shouldCapturePropReference(refPath, functionPath)) {
      let aliasId = capturedPropAliases.get(propName);
      if (!aliasId) {
        aliasId = functionPath.scope.generateUidIdentifier(propName);
        capturedPropAliases.set(propName, aliasId);
      }
      return t.cloneNode(aliasId);
    }

    return t.memberExpression(t.thisExpression(), t.identifier(propName));
  }

  bindings.forEach((bindingInfo, localName) => {
    if (!localName) return;
    const binding = functionPath.scope.getBinding(localName);
    if (!binding) return;

    binding.referencePaths.slice().forEach((refPath) => {
      if (!refPath.node) return;

      if (
        bindingInfo &&
        typeof bindingInfo === "object" &&
        bindingInfo.kind === "alias" &&
        (!refPath.parentPath || !refPath.parentPath.isMemberExpression())
      ) {
        if (shouldCapturePropReference(refPath, functionPath)) {
          return;
        }

        if (
          refPath.parentPath &&
          refPath.parentPath.isObjectProperty({ shorthand: true }) &&
          refPath.parentKey === "value"
        ) {
          return;
        }

        refPath.replaceWith(t.thisExpression());
        return;
      }

      if (
        bindingInfo &&
        typeof bindingInfo === "object" &&
        bindingInfo.kind === "alias" &&
        refPath.parentPath &&
        refPath.parentPath.isMemberExpression() &&
        refPath.parentKey === "object" &&
        t.isIdentifier(refPath.parentPath.node.property) &&
        !refPath.parentPath.node.computed
      ) {
        const propName = refPath.parentPath.node.property.name;
        if (bindingInfo.properties.has(propName)) {
          refPath.parentPath.replaceWith(getReplacementForProp(propName, refPath));
          return;
        }
      }

      let targetProp;
      if (typeof bindingInfo === "string") {
        targetProp = bindingInfo;
      } else if (bindingInfo && typeof bindingInfo === "object") {
        targetProp = bindingInfo.bindKey;
      }

      if (
        typeof bindingInfo === "string" &&
        refPath.parentPath &&
        refPath.parentPath.isMemberExpression() &&
        refPath.parentKey === "object" &&
        t.isIdentifier(refPath.parentPath.node.property) &&
        !refPath.parentPath.node.computed
      ) {
        const propName = refPath.parentPath.node.property.name;
        if (localName === "props" || propertyMap.has(propName)) {
          refPath.parentPath.replaceWith(getReplacementForProp(propName, refPath));
          return;
        }
      }

      if (
        refPath.parentPath &&
        refPath.parentPath.isObjectProperty({ shorthand: true }) &&
        refPath.parentKey === "value"
      ) {
        refPath.parentPath.node.shorthand = false;
        refPath.replaceWith(getReplacementForProp(targetProp || localName, refPath));
        return;
      }

      if (
        refPath.parentPath &&
        refPath.parentPath.isJSXAttribute() &&
        refPath.parentKey === "value"
      ) {
        refPath.replaceWith(
          t.jsxExpressionContainer(
            getReplacementForProp(targetProp || localName, refPath)
          )
        );
        return;
      }

      if (refPath.parentPath && refPath.parentPath.isMemberExpression()) {
        if (
          refPath.parentKey === "property" &&
          !refPath.parentPath.node.computed
        ) {
          return;
        }
      }

      refPath.replaceWith(getReplacementForProp(targetProp || localName, refPath));
    });
  });

  return Array.from(capturedPropAliases.entries()).map(([propName, aliasId]) =>
    t.variableDeclaration("const", [
      t.variableDeclarator(t.cloneNode(aliasId), createThisMemberExpression(propName)),
    ])
  );
}
