import {
  collectLitsxAuthoredIssues,
  createToolingVirtualLitsxSource,
} from "@litsx/typescript-plugin/virtual-source";

const lintStateByFilename = new Map();

export function computeLineStarts(text) {
  const starts = [0];
  for (let index = 0; index < text.length; index += 1) {
    if (text.charCodeAt(index) === 10) {
      starts.push(index + 1);
    }
  }
  return starts;
}

export function createLintState(text, filename) {
  const virtualization = createToolingVirtualLitsxSource(text, {
    sourceFileName: filename,
    plugins: ["typescript"],
  });
  const authoredIssues = collectLitsxAuthoredIssues(text, {
    sourceFileName: filename,
    plugins: ["typescript"],
    channel: "eslint",
  });

  return {
    originalText: text,
    originalLineStarts: computeLineStarts(text),
    virtualLineStarts: computeLineStarts(virtualization.code),
    virtualization,
    authoredIssues,
  };
}

export function setLintState(filename, state) {
  lintStateByFilename.set(filename, state);
}

export function getLintState(filename) {
  return lintStateByFilename.get(filename) ?? null;
}

export function takeLintState(filename) {
  const state = lintStateByFilename.get(filename) ?? null;
  lintStateByFilename.delete(filename);
  return state;
}
