import {
  collectLitsxAuthoredIssues,
  createVirtualLitsxJsxSource,
  decodeVirtualAttributeName,
  getLitsxAttributeCompletionNames,
  inferLitsxAttributeCompletionContext,
  inferLitsxAttributeInfoAtPosition,
  looksLikeLitsxJsx,
  mapOriginalPositionToVirtual,
  remapTextSpanToOriginal,
  remapVirtualText,
  STATIC_HOIST_CALL_RE,
} from "./authored-semantics.js";

export function createToolingVirtualLitsxSource(sourceText, options = {}) {
  const virtualization = createVirtualLitsxJsxSource(sourceText, options);
  const hoistNames = new Set();

  for (const match of virtualization.code.matchAll(STATIC_HOIST_CALL_RE)) {
    hoistNames.add(match[1]);
  }

  if (hoistNames.size === 0) {
    return {
      ...virtualization,
      toolingPreamble: "",
      toolingPreambleLength: 0,
    };
  }

  const toolingDeclarations = [];

  toolingDeclarations.push(
    ...Array.from(hoistNames)
      .sort()
      .map((name) => (
        name === "__litsx_static_lightDom"
          ? "declare function __litsx_static_lightDom(): void;\n"
          : `declare function ${name}<T = unknown>(value: T): T;\n`
      ))
  );

  const toolingPreamble = toolingDeclarations.join("");

  return {
    ...virtualization,
    code: `${toolingPreamble}${virtualization.code}`,
    toolingPreamble,
    toolingPreambleLength: toolingPreamble.length,
  };
}

export function mapOriginalPositionToToolingVirtual(position, virtualization) {
  return mapOriginalPositionToVirtual(position, virtualization.replacements) + (virtualization.toolingPreambleLength ?? 0);
}

export function remapToolingTextSpanToOriginal(span, virtualization) {
  if (!span) {
    return span;
  }

  const preambleLength = virtualization.toolingPreambleLength ?? 0;
  const start = Math.max(0, (span.start ?? 0) - preambleLength);

  return remapTextSpanToOriginal(
    {
      start,
      length: span.length ?? 0,
    },
    virtualization.replacements,
  );
}

export function collectLitsxAuthoredDiagnostics(sourceText, ts, options = {}) {
  return collectLitsxAuthoredIssues(sourceText, options).map((issue) => ({
    start: issue.start,
    length: issue.length,
    category: issue.severity === "warning"
      ? (ts?.DiagnosticCategory?.Warning ?? 0)
      : (ts?.DiagnosticCategory?.Error ?? 1),
    code: issue.code,
    source: "@litsx/typescript-plugin",
    messageText: issue.message,
  }));
}

export {
  collectLitsxAuthoredIssues,
  createVirtualLitsxJsxSource,
  decodeVirtualAttributeName,
  getLitsxAttributeCompletionNames,
  inferLitsxAttributeCompletionContext,
  inferLitsxAttributeInfoAtPosition,
  looksLikeLitsxJsx,
  mapOriginalPositionToVirtual,
  remapTextSpanToOriginal,
  remapVirtualText,
};
