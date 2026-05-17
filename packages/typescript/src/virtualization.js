import {
  collectLitsxAuthoredIssues,
  createVirtualLitsxJsxSource,
  decodeVirtualAttributeName,
  inferLitsxStaticHoistInfoAtPosition,
  getLitsxAttributeCompletionNames,
  inferLitsxComponentPropNames,
  inferLitsxComponentEventNames,
  inferLitsxAttributeCompletionContext,
  inferLitsxAttributeInfoAtPosition,
  inferLitsxMarkupCompletionContext,
  getLitsxMarkupCompletionNames,
  looksLikeLitsxJsx,
  mapOriginalPositionToVirtual,
  remapTextSpanToOriginal,
  remapVirtualText,
  STATIC_HOIST_CALL_RE,
} from "./authored-semantics.js";

/**
 * TypeScript-facing virtualization helpers for LitSX authored syntax.
 *
 * The tsserver plugin, CLI typechecker, editor sessions, and lint tooling use
 * this module to translate LitSX-only forms into TypeScript-safe source text,
 * then remap diagnostics, hovers, and completions back to authored positions.
 */

export function createToolingVirtualLitsxSource(sourceText, options = {}) {
  const virtualization = createVirtualLitsxJsxSource(sourceText, options);
  const hoistNames = new Set();
  const usesTypeScriptSyntax = options.plugins?.includes("typescript");

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
        usesTypeScriptSyntax
          ? (
            name === "__litsx_static_lightDom"
              ? "declare function __litsx_static_lightDom(value?: unknown): void;\n"
              : `declare function ${name}<T = unknown>(value: T): T;\n`
          )
          : (
            name === "__litsx_static_lightDom"
              ? "function __litsx_static_lightDom(value) {}\n"
              : `/** @template T @param {T} value @returns {T} */\nfunction ${name}(value) { return value; }\n`
          )
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
    source: "@litsx/typescript",
    messageText: issue.message,
  }));
}

export {
  collectLitsxAuthoredIssues,
  createVirtualLitsxJsxSource,
  decodeVirtualAttributeName,
  inferLitsxStaticHoistInfoAtPosition,
  getLitsxAttributeCompletionNames,
  inferLitsxComponentPropNames,
  inferLitsxComponentEventNames,
  inferLitsxAttributeCompletionContext,
  inferLitsxAttributeInfoAtPosition,
  inferLitsxMarkupCompletionContext,
  getLitsxMarkupCompletionNames,
  looksLikeLitsxJsx,
  mapOriginalPositionToVirtual,
  remapTextSpanToOriginal,
  remapVirtualText,
};
