import { declare } from "@babel/helper-plugin-utils";

function isRadixSlotBinding(name, path) {
  const binding = path.scope.getBinding(name);
  if (!binding?.path?.isImportSpecifier()) return false;
  const declaration = binding.path.parentPath;
  return (
    declaration?.isImportDeclaration() &&
    declaration.node.source.value === "@radix-ui/react-slot" &&
    (binding.path.node.imported?.name ?? binding.path.node.imported?.value) === "Slot"
  );
}

function expressionToJsxName(node, path, t) {
  if (t.isStringLiteral(node) && /^[A-Za-z][A-Za-z0-9:._-]*$/.test(node.value)) {
    return t.jsxIdentifier(node.value);
  }
  if (t.isIdentifier(node)) {
    // Radix Slot is a React composition primitive, not a LitSX component
    // declaration. Lower it here so the shared custom-element-name contract
    // can remain strict for ordinary imported identifiers.
    if (isRadixSlotBinding(node.name, path)) return t.jsxIdentifier("slot");
    return t.jsxIdentifier(node.name);
  }
  if (t.isMemberExpression(node, { computed: false })) {
    const object = expressionToJsxName(node.object, path, t);
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
  api.assertVersion("^8.0.0");
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

        const consequentName = expressionToJsxName(init.consequent, path, t);
        const alternateName = expressionToJsxName(init.alternate, path, t);
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
