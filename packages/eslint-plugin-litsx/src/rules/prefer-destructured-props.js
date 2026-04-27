import { createIssueBackedRule } from "../rule-utils.js";

export default createIssueBackedRule({
  name: "@litsx/prefer-destructured-props",
  meta: {
    type: "suggestion",
    docs: {
      description: "Prefer destructuring props instead of opaque props.member access in LitSX components.",
    },
    schema: [],
  },
  matchesIssue: (issue) => issue.kind === "prefer-destructured-props",
});
