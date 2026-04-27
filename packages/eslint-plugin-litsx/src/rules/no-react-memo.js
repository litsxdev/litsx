import { createIssueBackedRule } from "../rule-utils.js";

export default createIssueBackedRule({
  name: "@litsx/no-react-memo",
  meta: {
    type: "suggestion",
    docs: {
      description: "Warn when React memo wrappers are authored in LitSX code.",
    },
    schema: [],
  },
  matchesIssue: (issue) => issue.kind === "react-memo",
});
