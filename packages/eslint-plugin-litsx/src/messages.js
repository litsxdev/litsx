import { offsetToLineColumn } from "./remap.js";

const ISSUE_KIND_TO_RULE_ID = {
  "native-classname": "@litsx/no-native-classname",
  "invalid-binding-value": "@litsx/no-invalid-binding-value",
  "unknown-binding": "@litsx/no-unknown-binding",
  "static-hoist-top-level": "@litsx/static-hoists-top-level",
  "react-memo": "@litsx/no-react-memo",
};

export function getRuleIdForIssue(issue) {
  return ISSUE_KIND_TO_RULE_ID[issue?.kind] ?? "@litsx/authored-syntax";
}

export function convertIssueToLintMessage(issue, state) {
  const originalStartOffset = Math.max(0, issue?.start ?? 0);
  const originalEndOffset = originalStartOffset + Math.max(0, issue?.length ?? 0);
  const originalStart = offsetToLineColumn(originalStartOffset, state.originalLineStarts);
  const originalEnd = offsetToLineColumn(originalEndOffset, state.originalLineStarts);

  return {
    ruleId: "@litsx/authored-syntax",
    severity: issue?.severity === "warning" ? 1 : 2,
    message: String(issue?.message ?? "Unknown LitSX authored syntax issue."),
    line: originalStart.line,
    column: originalStart.column,
    endLine: originalEnd.line,
    endColumn: originalEnd.column,
  };
}
