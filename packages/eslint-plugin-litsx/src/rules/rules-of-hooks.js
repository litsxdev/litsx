import { collectHookDiagnostics } from "@litsx/authoring";

export default {
  meta: {
    type: "problem",
    docs: {
      description: "Require LitSX hooks to register synchronously in a stable render order.",
    },
    schema: [],
  },
  create(context) {
    return {
      "Program:exit"(node) {
        for (const diagnostic of collectHookDiagnostics(node)) {
          context.report({
            node: diagnostic.node ?? node,
            message: `[${diagnostic.code}] ${diagnostic.message}`,
          });
        }
      },
    };
  },
};

