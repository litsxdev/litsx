import { createIssueBackedRule } from "../rule-utils.js";

export default createIssueBackedRule({
  name: "@litsx/static-hoists-top-level",
  meta: {
    type: "problem",
    docs: {
      description: "Require LitSX static hoists to appear at top level in the component body.",
    },
    schema: [],
  },
  matchesIssue: (issue) => issue.kind === "static-hoist-top-level",
});
