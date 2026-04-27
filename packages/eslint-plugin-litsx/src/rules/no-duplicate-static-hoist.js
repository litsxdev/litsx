import { createIssueBackedRule } from "../rule-utils.js";

export default createIssueBackedRule({
  name: "@litsx/no-duplicate-static-hoist",
  meta: {
    type: "problem",
    docs: {
      description: "Disallow duplicate native LitSX static hoists in the same component.",
    },
    schema: [],
  },
  matchesIssue: (issue) => issue.kind === "duplicate-static-hoist",
});
