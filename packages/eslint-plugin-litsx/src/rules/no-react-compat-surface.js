import { createIssueBackedRule } from "../rule-utils.js";

export default createIssueBackedRule({
  name: "@litsx/no-react-compat-surface",
  meta: {
    type: "suggestion",
    docs: {
      description: "Warn on React compatibility surface that native LitSX authoring should avoid.",
    },
    schema: [],
  },
  matchesIssue: (issue) => issue.kind === "react-compat-surface",
});
