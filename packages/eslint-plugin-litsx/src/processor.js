import { convertIssueToLintMessage } from "./messages.js";
import { createMessageDedupKey, remapLintMessage } from "./remap.js";
import { createLintState, setLintState, takeLintState } from "./state.js";

export function createLitsxProcessor(options = {}) {
  const {
    includeAuthoredDiagnostics = true,
  } = options;

  return {
    supportsAutofix: true,
    preprocess(text, filename) {
      const state = createLintState(text, filename);
      setLintState(filename, state);
      return [state.virtualization.code];
    },
    postprocess(messageLists, filename) {
      const state = takeLintState(filename);
      const remappedMessages = (messageLists || [])
        .flat()
        .map((message) => remapLintMessage(message, state));

      if (!state) {
        return remappedMessages;
      }

      const deduped = new Map();
      for (const message of remappedMessages) {
        deduped.set(createMessageDedupKey(message), message);
      }

      if (includeAuthoredDiagnostics) {
        for (const issue of state.authoredIssues) {
          const message = convertIssueToLintMessage(issue, state);
          const key = createMessageDedupKey(message);
          if (!deduped.has(key)) {
            deduped.set(key, message);
          }
        }
      }

      return Array.from(deduped.values());
    },
  };
}

export default createLitsxProcessor;
