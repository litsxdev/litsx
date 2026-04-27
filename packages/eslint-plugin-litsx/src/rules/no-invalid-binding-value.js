import { createIssueBackedRule } from "../rule-utils.js";

export default createIssueBackedRule({
  name: "@litsx/no-invalid-binding-value",
  meta: {
    type: "problem",
    docs: {
      description: "Require valid authored values for LitSX @, ., and ? bindings.",
    },
    schema: [],
  },
  matchesIssue: (issue) => issue.kind === "invalid-binding-value",
});
