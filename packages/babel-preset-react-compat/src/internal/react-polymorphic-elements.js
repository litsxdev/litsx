import helperPluginUtils from "@babel/helper-plugin-utils";

const { declare } = helperPluginUtils;

function expressionToJsxName(node, t) {
  if (t.isStringLiteral(node) && /^[A-Za-z][A-Za-z0-9:._-]*$/.test(node.value)) {
    return t.jsxIdentifier(node.value);
  }
  if (t.isIdentifier(node)) {
    return t.jsxIdentifier(node.name);
  }
  if (t.isMemberExpression(node, { computed: false })) {
    const object = expressionToJsxName(node.object, t);
    if (!object || !t.isIdentifier(node.property)) return null;
    return t.jsxMemberExpression(object, t.jsxIdentifier(node.property.name));
  }
  return null;
}

function cloneElementWithName(element, name, t) {
  const clone = t.cloneNode(element, true);
  clone.openingElement.name = t.cloneNode(name, true);
  if (clone.closingElement) {
    clone.closingElement.name = t.cloneNode(name, true);
  }
  return clone;
}

export default declare((api) => {
  api.assertVersion(7);
  const t = api.types;

  return {
    name: "react-polymorphic-elements",
    visitor: {
      JSXElement(path) {
        const name = path.node.openingElement.name;
        if (!t.isJSXIdentifier(name)) return;
        const binding = path.scope.getBinding(name.name);
        if (!binding?.path?.isVariableDeclarator()) return;
        const init = binding.path.node.init;
        if (!t.isConditionalExpression(init)) return;

        const consequentName = expressionToJsxName(init.consequent, t);
        const alternateName = expressionToJsxName(init.alternate, t);
        if (!consequentName || !alternateName) return;

        const conditional = t.conditionalExpression(
          t.cloneNode(init.test, true),
          cloneElementWithName(path.node, consequentName, t),
          cloneElementWithName(path.node, alternateName, t),
        );
        path.replaceWith(
          t.jsxFragment(
            t.jsxOpeningFragment(),
            t.jsxClosingFragment(),
            [t.jsxExpressionContainer(conditional)],
          ),
        );
        path.skip();
      },
    },
  };
});
