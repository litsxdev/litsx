import { createIssueBackedRule } from "../rule-utils.js";

export default createIssueBackedRule({
  name: "@litsx/no-unknown-binding",
  meta: {
    type: "problem",
    docs: {
      description: "Warn when a LitSX binding is not known for the current intrinsic tag.",
    },
    schema: [],
  },
  matchesIssue: (issue) => issue.kind === "unknown-binding",
});
