import { collectComponentNameDiagnostics } from "@litsx/authoring";

export default {
  meta: {
    type: "problem",
    docs: {
      description: "Require component names to map directly to valid custom-element names.",
    },
    schema: [],
  },
  create(context) {
    return {
      "Program:exit"(node) {
        for (const diagnostic of collectComponentNameDiagnostics(node)) {
          context.report({
            node: diagnostic.node ?? node,
            message: `[${diagnostic.code}] ${diagnostic.message}`,
          });
        }
      },
    };
  },
};

