import { decodeVirtualStaticHoistName, NATIVE_STATIC_HOISTS } from "@litsx/authoring";

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

        const macroName = node.callee.name.slice("__litsx_static_".length);
        const authoredName = decodeVirtualStaticHoistName(node.callee.name) ?? `static ${macroName}`;

        if (NATIVE_STATIC_HOISTS.has(macroName) || allow.has(macroName)) {
          return;
        }

        context.report({
          node,
          message: `Unknown static hoist "${authoredName} = ...". If this is project-specific, add it to the rule allowlist.`,
        });
      },
    };
  },
};
