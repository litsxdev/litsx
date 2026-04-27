import { createIssueBackedRule } from "../rule-utils.js";

export default createIssueBackedRule({
  name: "@litsx/no-opaque-prop-metadata-inference",
  meta: {
    type: "suggestion",
    docs: {
      description: "Warn when LitSX has to infer prop metadata from opaque props member access.",
    },
    schema: [],
  },
  matchesIssue: (issue) => issue.kind === "opaque-prop-metadata-inference",
});
