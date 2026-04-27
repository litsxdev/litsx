import { createIssueBackedRule } from "../rule-utils.js";

export default createIssueBackedRule({
  name: "@litsx/no-native-classname",
  meta: {
    type: "suggestion",
    docs: {
      description: "Disallow className on native LitSX intrinsic elements.",
    },
    fixable: "code",
    schema: [],
  },
  matchesIssue: (issue) => issue.kind === "native-classname",
  buildFix: (issue) => (
    issue.fix?.text
      ? {
        start: issue.start,
        end: issue.start + issue.length,
        text: issue.fix.text,
      }
      : null
  ),
});
