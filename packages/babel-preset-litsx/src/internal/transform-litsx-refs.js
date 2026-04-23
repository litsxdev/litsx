let t;

export function setRefsBabelTypes(nextTypes) {
  t = nextTypes;
}

function createThisMemberExpression(propName) {
  return t.memberExpression(t.thisExpression(), t.identifier(propName));
}

function createManagedRefLookupExpression(refName) {
  const selectorLiteral = t.stringLiteral(`[data-ref="${refName}"]`);

  const renderRootQuery = t.optionalCallExpression(
    t.optionalMemberExpression(
      t.memberExpression(t.thisExpression(), t.identifier("renderRoot")),
      t.identifier("querySelector"),
      false,
      true
    ),
    [selectorLiteral],
    false
  );

  const hostQuery = t.callExpression(
    t.memberExpression(t.thisExpression(), t.identifier("querySelector")),
    [t.cloneNode(selectorLiteral)]
  );

  return t.logicalExpression("??", renderRootQuery, hostQuery);
}

function createForwardedTargetRefSyncStatement(propName, refName) {
  return t.expressionStatement(
    t.callExpression(t.identifier("useCallbackRef"), [
      t.thisExpression(),
      t.arrowFunctionExpression([], createManagedRefLookupExpression(refName)),
      t.arrowFunctionExpression(
        [t.identifier("node")],
        t.blockStatement([
          t.variableDeclaration("const", [
            t.variableDeclarator(
              t.identifier("componentRef"),
              createThisMemberExpression(propName)
            ),
          ]),
          t.ifStatement(
            t.binaryExpression(
              "===",
              t.unaryExpression("typeof", t.identifier("componentRef")),
              t.stringLiteral("function")
            ),
            t.blockStatement([
              t.expressionStatement(
                t.callExpression(t.identifier("componentRef"), [t.identifier("node")])
              ),
            ]),
            t.ifStatement(
              t.logicalExpression(
                "&&",
                t.identifier("componentRef"),
                t.binaryExpression(
                  "===",
                  t.unaryExpression("typeof", t.identifier("componentRef")),
                  t.stringLiteral("object")
                )
              ),
              t.blockStatement([
                t.expressionStatement(
                  t.assignmentExpression(
                    "=",
                    t.memberExpression(t.identifier("componentRef"), t.identifier("current")),
                    t.identifier("node")
                  )
                ),
              ])
            )
          ),
        ])
      ),
      t.arrayExpression([createThisMemberExpression(propName)]),
    ])
  );
}

function isStandardElementJsxName(nameNode) {
  if (!t.isJSXIdentifier(nameNode)) {
    return false;
  }

  const name = nameNode.name || "";
  return Boolean(name) && name[0] === name[0].toLowerCase() && !name.includes("-");
}

export function createComponentInstanceRefSyncStatement() {
  return t.expressionStatement(
    t.callExpression(t.identifier("useCallbackRef"), [
      t.thisExpression(),
      t.arrowFunctionExpression([], t.thisExpression()),
      t.arrowFunctionExpression(
        [t.identifier("node")],
        t.blockStatement([
          t.variableDeclaration("const", [
            t.variableDeclarator(
              t.identifier("componentRef"),
              createThisMemberExpression("ref")
            ),
          ]),
          t.ifStatement(
            t.binaryExpression(
              "===",
              t.unaryExpression("typeof", t.identifier("componentRef")),
              t.stringLiteral("function")
            ),
            t.blockStatement([
              t.expressionStatement(
                t.callExpression(t.identifier("componentRef"), [t.identifier("node")])
              ),
            ]),
            t.ifStatement(
              t.logicalExpression(
                "&&",
                t.identifier("componentRef"),
                t.binaryExpression(
                  "===",
                  t.unaryExpression("typeof", t.identifier("componentRef")),
                  t.stringLiteral("object")
                )
              ),
              t.blockStatement([
                t.expressionStatement(
                  t.assignmentExpression(
                    "=",
                    t.memberExpression(t.identifier("componentRef"), t.identifier("current")),
                    t.identifier("node")
                  )
                ),
              ])
            )
          ),
        ])
      ),
      t.arrayExpression([createThisMemberExpression("ref")]),
    ])
  );
}

export function hasRefProp(functionPath) {
  const [firstParam] = functionPath.node.params || [];
  if (!firstParam) {
    return false;
  }

  if (t.isObjectPattern(firstParam)) {
    return firstParam.properties.some((property) => {
      if (!t.isObjectProperty(property)) return false;
      return (
        t.isIdentifier(property.key, { name: "ref" }) ||
        t.isStringLiteral(property.key, { value: "ref" })
      );
    });
  }

  if (t.isAssignmentPattern(firstParam) && t.isObjectPattern(firstParam.left)) {
    return firstParam.left.properties.some((property) => {
      if (!t.isObjectProperty(property)) return false;
      return (
        t.isIdentifier(property.key, { name: "ref" }) ||
        t.isStringLiteral(property.key, { value: "ref" })
      );
    });
  }

  if (t.isIdentifier(firstParam)) {
    const binding = functionPath.scope.getBinding(firstParam.name);
    if (!binding) return false;
    return binding.referencePaths.some((refPath) => {
      const parentPath = refPath.parentPath;
      return Boolean(
        parentPath &&
        parentPath.isMemberExpression() &&
        parentPath.node.object === refPath.node &&
        t.isIdentifier(parentPath.node.property, { name: "ref" }) &&
        !parentPath.node.computed
      );
    });
  }

  return false;
}

export function lowerForwardedElementRefs(functionPath, propName) {
  if (!propName) {
    return [];
  }

  const callbackStatements = [];
  const seenRefNames = new Set();

  functionPath.traverse({
    JSXAttribute(attrPath) {
      if (!t.isJSXIdentifier(attrPath.node.name, { name: "ref" })) return;

      const value = attrPath.node.value;
      if (!t.isJSXExpressionContainer(value)) return;
      if (
        !t.isMemberExpression(value.expression) ||
        !t.isThisExpression(value.expression.object) ||
        !t.isIdentifier(value.expression.property, { name: propName }) ||
        value.expression.computed
      ) {
        return;
      }

      const openingElement = attrPath.parentPath;
      if (!openingElement?.isJSXOpeningElement()) return;
      if (!isStandardElementJsxName(openingElement.node.name)) return;

      const managedRefName = functionPath.scope.generateUidIdentifier(`${propName}Element`).name;
      attrPath.replaceWith(
        t.jsxAttribute(t.jsxIdentifier("data-ref"), t.stringLiteral(managedRefName))
      );

      if (seenRefNames.has(managedRefName)) return;
      seenRefNames.add(managedRefName);
      callbackStatements.push(createForwardedTargetRefSyncStatement(propName, managedRefName));
    },
  });

  return callbackStatements;
}
