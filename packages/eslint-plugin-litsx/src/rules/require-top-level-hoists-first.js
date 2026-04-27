import { createIssueBackedRule } from "../rule-utils.js";

export default createIssueBackedRule({
  name: "@litsx/require-top-level-hoists-first",
  meta: {
    type: "suggestion",
    docs: {
      description: "Require top-level LitSX hoists to appear before render-time statements in a component body.",
    },
    schema: [],
  },
  matchesIssue: (issue) => issue.kind === "require-top-level-hoists-first",
});
