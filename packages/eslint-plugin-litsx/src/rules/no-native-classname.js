function isNativeElementName(name) {
  return name?.type === "JSXIdentifier" && /^[a-z]/.test(name.name);
}

export default {
  meta: {
    type: "suggestion",
    docs: {
      description: "Use the standard class attribute on native JSX elements.",
    },
    fixable: "code",
    schema: [],
  },
  create(context) {
    return {
      JSXAttribute(node) {
        if (
          node.name?.type !== "JSXIdentifier" ||
          node.name.name !== "className" ||
          !isNativeElementName(node.parent?.name)
        ) {
          return;
        }

        context.report({
          node: node.name,
          message: "Use \"class\" instead of React's \"className\" on native elements.",
          fix: (fixer) => fixer.replaceText(node.name, "class"),
        });
      },
    };
  },
};
