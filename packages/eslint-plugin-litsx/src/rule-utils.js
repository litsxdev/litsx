import { mapOriginalPositionToToolingVirtual } from "@litsx/typescript-plugin/virtual-source";
import { createLintState, getLintState } from "./state.js";
import { mapOriginalSpanToVirtual, offsetToLineColumn } from "./remap.js";

function getRuleState(context) {
  return getLintState(context.filename) ?? createLintState(context.sourceCode.text, context.filename);
}

function issueToVirtualLoc(issue, state) {
  const span = mapOriginalSpanToVirtual(issue.start, issue.length, state.virtualization);
  return {
    start: offsetToLineColumn(span.start, state.virtualLineStarts),
    end: offsetToLineColumn(span.end, state.virtualLineStarts),
  };
}

export function createIssueBackedRule({ name, meta, matchesIssue, buildFix }) {
  return {
    meta,
    create(context) {
      return {
        Program() {
          const state = getRuleState(context);
          const issues = state.authoredIssues.filter(matchesIssue);

          for (const issue of issues) {
            const loc = issueToVirtualLoc(issue, state);
            context.report({
              loc,
              message: issue.message,
              fix: buildFix
                ? (fixer) => {
                  const fix = buildFix(issue, state);
                  if (!fix) {
                    return null;
                  }

                  const start = mapOriginalPositionToToolingVirtual(fix.start, state.virtualization);
                  const end = mapOriginalPositionToToolingVirtual(fix.end, state.virtualization);
                  return fixer.replaceTextRange([start, end], fix.text);
                }
                : null,
            });
          }
        },
      };
    },
  };
}
