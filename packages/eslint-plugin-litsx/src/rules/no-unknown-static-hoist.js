import { decodeVirtualStaticHoistName, NATIVE_STATIC_HOISTS } from "@litsx/typescript-plugin/authored-semantics";

export default {
  meta: {
    type: "problem",
    docs: {
      description: "Warn on static hoists outside the known native LitSX set unless explicitly allowed.",
    },
    schema: [
      {
        type: "object",
        properties: {
          allow: {
            type: "array",
            items: { type: "string" },
          },
        },
        additionalProperties: false,
      },
    ],
  },
  create(context) {
    const allow = new Set(context.options?.[0]?.allow ?? []);

    return {
      CallExpression(node) {
        if (
          node.callee?.type !== "Identifier" ||
          !node.callee.name.startsWith("__litsx_static_")
        ) {
          return;
        }

        const authoredName = decodeVirtualStaticHoistName(node.callee.name);
        const macroName = authoredName?.slice(1) ?? "";

        if (NATIVE_STATIC_HOISTS.has(macroName) || allow.has(macroName)) {
          return;
        }

        context.report({
          node,
          message: `Unknown static hoist "${authoredName ?? node.callee.name}(...)". If this is project-specific, add it to the rule allowlist.`,
        });
      },
    };
  },
};
