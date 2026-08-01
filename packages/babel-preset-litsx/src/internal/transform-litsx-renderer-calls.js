let t;

export function setRendererCallsBabelTypes(nextTypes) {
  t = nextTypes;
}

function createThisMemberExpression(propName) {
  return t.memberExpression(t.thisExpression(), t.identifier(propName));
}

function getBoundPropName(bindingInfo) {
  if (typeof bindingInfo === "string") {
    return bindingInfo;
  }

  if (bindingInfo && typeof bindingInfo === "object") {
    return bindingInfo.bindKey ?? null;
  }

  return null;
}

function isPropBackedCallee(node, localNames) {
  if (t.isIdentifier(node)) {
    return localNames.includes(node.name);
  }

  if (
    t.isMemberExpression(node) &&
    !node.computed &&
    t.isIdentifier(node.object)
  ) {
    return localNames.includes(node.object.name) && node.object.name === "props";
  }

  return false;
}

function getPropBackedCalleeReplacement(node, bindings) {
  if (t.isIdentifier(node)) {
    const propName = getBoundPropName(bindings.get(node.name));
    return propName ? createThisMemberExpression(propName) : node;
  }

  if (
    t.isMemberExpression(node) &&
    !node.computed &&
    t.isIdentifier(node.object)
  ) {
    const propName = getBoundPropName(bindings.get(node.object.name));
    if (!propName) {
      return node;
    }

    return t.memberExpression(
      createThisMemberExpression(propName),
      t.cloneNode(node.property),
      false
    );
  }

  return node;
}

export function transformJSXRendererCalls(jsxPath, bindings, state = null) {
  const localNames = Array.from(bindings.keys());

  jsxPath.traverse({
    JSXExpressionContainer(expressionPath) {
      // RendererCallDirective is a child-part directive. Calls used to
      // compute an attribute/property/event binding must remain ordinary
      // JavaScript values; lowering them here places the directive itself in
      // a Lit AttributePart and makes SSR reject it before the child element
      // can receive the property.
      if (expressionPath.parentPath?.isJSXAttribute?.()) {
        return;
      }

      if (!t.isCallExpression(expressionPath.node.expression)) {
        return;
      }

      const { callee, arguments: args } = expressionPath.node.expression;
      if (!isPropBackedCallee(callee, localNames)) {
        return;
      }

      if (state) {
        state.__litsxNeedsRendererCallImport = true;
      }

      expressionPath.node.expression = t.callExpression(
        t.identifier("renderRendererCall"),
        [
          getPropBackedCalleeReplacement(callee, bindings),
          ...args,
        ]
      );
    },
  });
}
