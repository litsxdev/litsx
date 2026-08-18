import {
  collectLitsxAuthoredIssues,
  createVirtualLitsxJsxSource,
  decodeVirtualAttributeName,
  inferLitsxStaticHoistInfoAtPosition,
  getLitsxAttributeCompletionNames,
  inferLitsxComponentPropNames,
  inferLitsxComponentEventNames,
  inferLitsxComponentEventMetadata,
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
  let virtualization = createVirtualLitsxJsxSource(sourceText, options);
  const hoistNames = new Set();
  const usesTypeScriptSyntax = options.plugins?.includes("typescript");

  for (const match of virtualization.code.matchAll(STATIC_HOIST_CALL_RE)) {
    hoistNames.add(match[1]);
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
  const componentEvents = inferLitsxComponentEventMetadata(sourceText, options);
  const toolingInsertions = [];
  const appendixEntries = [];

  for (const [componentName, metadata] of Object.entries(componentEvents)) {
      if (metadata.alreadyDeclared) continue;
      const runtimeValue = `{ events: ${JSON.stringify(metadata.events)}, complete: ${metadata.complete} }`;
      const inferredEventMap = metadata.events.length > 0
        ? `{ ${metadata.events.map((name) => `${JSON.stringify(name)}: unknown`).join("; ")} }`
        : "Record<string, unknown>";
      const eventMap = metadata.typeExpression ?? inferredEventMap;
      const declaration = `${runtimeValue} as import("@litsx/core").LitsxEventDeclaration<${eventMap}, ${metadata.complete}>`;

      if (
        usesTypeScriptSyntax &&
        (metadata.nodeType === "ArrowFunctionExpression" || metadata.nodeType === "FunctionExpression") &&
        typeof metadata.nodeStart === "number" &&
        typeof metadata.nodeEnd === "number"
      ) {
        const originalStart = remapTextSpanToOriginal(
          { start: metadata.nodeStart, length: 0 },
          virtualization.replacements,
        ).start;
        const originalEnd = remapTextSpanToOriginal(
          { start: metadata.nodeEnd, length: 0 },
          virtualization.replacements,
        ).start;
        toolingInsertions.push(
          { start: originalStart, end: originalStart, replacement: "Object.assign(" },
          { start: originalEnd, end: originalEnd, replacement: `, { events: ${declaration} })` },
        );
      } else if (usesTypeScriptSyntax && metadata.nodeType === "FunctionDeclaration") {
        appendixEntries.push(
          `${metadata.exported ? "export " : ""}namespace ${componentName} { export const events = ${declaration}; }\n`,
        );
      } else {
        appendixEntries.push(
          `/** @type {import("@litsx/core").LitsxEventDeclaration<Record<string, *>>} */\n${componentName}.events = ${runtimeValue};\n`,
        );
      }
  }

  if (toolingInsertions.length > 0) {
    const replacements = [...virtualization.replacements, ...toolingInsertions]
      .sort((left, right) => left.start - right.start || left.end - right.end);
    let cursor = 0;
    let code = "";
    for (const replacement of replacements) {
      code += sourceText.slice(cursor, replacement.start);
      code += replacement.replacement;
      cursor = replacement.end;
    }
    code += sourceText.slice(cursor);
    virtualization = { ...virtualization, code, replacements };
  }

  const toolingAppendix = appendixEntries.join("");

  return {
    ...virtualization,
    code: `${toolingPreamble}${virtualization.code}${toolingAppendix ? `\n${toolingAppendix}` : ""}`,
    toolingPreamble,
    toolingPreambleLength: toolingPreamble.length,
    toolingAppendix,
    toolingAppendixLength: toolingAppendix.length,
  };
}

export function needsToolingVirtualization(sourceText) {
  return looksLikeLitsxJsx(sourceText) || /\buseEmit\b/.test(sourceText ?? "");
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
  inferLitsxComponentEventMetadata,
  inferLitsxAttributeCompletionContext,
  inferLitsxAttributeInfoAtPosition,
  inferLitsxMarkupCompletionContext,
  getLitsxMarkupCompletionNames,
  looksLikeLitsxJsx,
  mapOriginalPositionToVirtual,
  remapTextSpanToOriginal,
  remapVirtualText,
};
