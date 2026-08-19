function isReactMemoCall(node) {
  if (node.callee?.type === "Identifier") {
    return node.callee.name === "memo";
  }
  return node.callee?.type === "MemberExpression" &&
    !node.callee.computed &&
    node.callee.object?.type === "Identifier" &&
    node.callee.object.name === "React" &&
    node.callee.property?.type === "Identifier" &&
    node.callee.property.name === "memo";
}

export default {
  meta: {
    type: "suggestion",
    docs: {
      description: "Disallow React memo wrappers in LitSX components.",
    },
    schema: [],
  },
  create(context) {
    return {
      CallExpression(node) {
        if (isReactMemoCall(node)) {
          context.report({
            node,
            message: "LitSX components update through Lit reactivity and should not use React.memo().",
          });
        }
      },
    };
  },
};
