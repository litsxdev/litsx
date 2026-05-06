import assert from "assert";
import { describe, it } from "vitest";
import plugin, { createLitsxProcessor } from "../packages/eslint-plugin-litsx/src/index.js";
import { getRuleIdForIssue, convertIssueToLintMessage } from "../packages/eslint-plugin-litsx/src/messages.js";
import {
  createMessageDedupKey,
  lineColumnToOffset,
  mapOriginalSpanToVirtual,
  offsetToLineColumn,
  remapLintFix,
  remapLintMessage,
  remapVirtualOffsetToOriginal,
} from "../packages/eslint-plugin-litsx/src/remap.js";
import {
  computeLineStarts as computeLintLineStarts,
  createLintState,
  getLintState,
  setLintState,
  takeLintState,
} from "../packages/eslint-plugin-litsx/src/state.js";
import { createIssueBackedRule } from "../packages/eslint-plugin-litsx/src/rule-utils.js";
import noUnknownStaticHoist from "../packages/eslint-plugin-litsx/src/rules/no-unknown-static-hoist.js";
import noNativeClassname from "../packages/eslint-plugin-litsx/src/rules/no-native-classname.js";

function computeLineStarts(text) {
  const starts = [0];
  for (let index = 0; index < text.length; index += 1) {
    if (text.charCodeAt(index) === 10) {
      starts.push(index + 1);
    }
  }
  return starts;
}

function offsetToLineColumn(offset, lineStarts) {
  let low = 0;
  let high = lineStarts.length - 1;

  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    if (lineStarts[mid] <= offset) {
      if (mid === lineStarts.length - 1 || lineStarts[mid + 1] > offset) {
        return {
          line: mid + 1,
          column: offset - lineStarts[mid] + 1,
        };
      }
      low = mid + 1;
      continue;
    }

    high = mid - 1;
  }

  return { line: 1, column: 1 };
}

async function createFlatESLint(options) {
  const moduleNamespace = await import("eslint/use-at-your-own-risk");
  const ctor =
    moduleNamespace.FlatESLint ||
    moduleNamespace.ESLint ||
    moduleNamespace.default?.FlatESLint ||
    moduleNamespace.default?.ESLint ||
    moduleNamespace.default;

  if (typeof ctor !== "function") {
    throw new TypeError("FlatESLint constructor is not available");
  }

  return new ctor(options);
}

async function createLegacyESLint(options) {
  const moduleNamespace = await import("eslint/use-at-your-own-risk");
  const ctor =
    moduleNamespace.LegacyESLint ||
    moduleNamespace.default?.LegacyESLint;

  if (typeof ctor !== "function") {
    throw new TypeError("LegacyESLint constructor is not available");
  }

  return new ctor(options);
}

describe("@litsx/eslint-plugin", () => {
  it("exports the processor, rules, and configs", () => {
    assert.ok(plugin.processors.litsx);
    assert.ok(plugin.processors["litsx-editor"]);
    assert.ok(plugin.rules["no-native-classname"]);
    assert.ok(plugin.rules["no-duplicate-static-hoist"]);
    assert.ok(plugin.rules["no-react-compat-surface"]);
    assert.ok(plugin.rules["prefer-destructured-props"]);
    assert.ok(plugin.rules["no-opaque-prop-metadata-inference"]);
    assert.ok(plugin.rules["require-top-level-hoists-first"]);
    assert.ok(plugin.rules["no-unknown-static-hoist"]);
    assert.ok(plugin.configs.recommended);
    assert.ok(plugin.configs["recommended-lint"]);
    assert.ok(plugin.configs["recommended-react-migration"]);
    assert.ok(plugin.configs.strict);
    assert.ok(plugin.configs["recommended-flat"]);
    assert.ok(plugin.configs["recommended-lint-flat"]);
    assert.ok(plugin.configs["recommended-react-migration-flat"]);
    assert.ok(plugin.configs["strict-flat"]);
    assert.equal(typeof createLitsxProcessor, "function");
  });

  it("virtualizes authored syntax during preprocess", () => {
    const processor = createLitsxProcessor();
    const [virtualized] = processor.preprocess(
      'const view = <button @click={handleClick}>{label}</button>;',
      "/virtual/example.jsx",
    );

    assert.match(virtualized, /__litsx_event_click/);
  });

  it("remaps ESLint messages from virtualized text back to authored positions", () => {
    const processor = createLitsxProcessor();
    const originalSource = 'const view = <button @click={handleClick}>{label}</button>;';
    const [virtualized] = processor.preprocess(originalSource, "/virtual/example.jsx");

    const virtualLineStarts = computeLineStarts(virtualized);
    const originalLineStarts = computeLineStarts(originalSource);
    const virtualOffset = virtualized.indexOf("__litsx_event_click");
    const originalOffset = originalSource.indexOf("@click");
    const virtualLoc = offsetToLineColumn(virtualOffset, virtualLineStarts);
    const originalLoc = offsetToLineColumn(originalOffset, originalLineStarts);

    const [remapped] = processor.postprocess(
      [[{
        ruleId: "no-unused-vars",
        severity: 2,
        message: "Test message",
        line: virtualLoc.line,
        column: virtualLoc.column,
        endLine: virtualLoc.line,
        endColumn: virtualLoc.column + "__litsx_event_click".length,
      }]],
      "/virtual/example.jsx",
    );

    assert.equal(remapped.line, originalLoc.line);
    assert.equal(remapped.column, originalLoc.column);
  });

  it("appends baseline authored diagnostics during postprocess", () => {
    const processor = createLitsxProcessor();
    processor.preprocess(
      'const view = <button @click="handleClick">{label}</button>;',
      "/virtual/example.jsx",
    );

    const messages = processor.postprocess([[]], "/virtual/example.jsx");
    const authoredMessage = messages.find((message) => message.ruleId === "@litsx/authored-syntax");

    assert.ok(authoredMessage);
    assert.equal(authoredMessage.severity, 2);
    assert.match(authoredMessage.message, /must use an expression/);
  });

  it("recommended flat config stays quiet by default", async () => {
    const eslint = await createFlatESLint({
      cwd: process.cwd(),
      overrideConfigFile: true,
      overrideConfig: [plugin.configs["recommended-flat"]],
    });

    const [result] = await eslint.lintText(
      'import { memo } from "react";\nconst Button = memo(() => <button @click="handleClick" className="cta" />);',
      { filePath: "example.tsx" },
    );

    assert.deepStrictEqual(result.messages, []);
  });

  it("supports .litsx files in recommended lint flat config", async () => {
    const eslint = await createFlatESLint({
      cwd: process.cwd(),
      overrideConfigFile: true,
      overrideConfig: [plugin.configs["recommended-lint-flat"]],
    });

    const [result] = await eslint.lintText(
      'const Button = ({ label }: { label: string }) => <button @click={handleClick}>{label}</button>;',
      { filePath: "example.litsx" },
    );

    assert.deepStrictEqual(result.messages, []);
  });

  it("can suppress baseline authored diagnostics in the editor processor", () => {
    const processor = createLitsxProcessor({
      includeAuthoredDiagnostics: false,
    });
    processor.preprocess(
      'const view = <button @click="handleClick">{label}</button>;',
      "/virtual/example.jsx",
    );

    const messages = processor.postprocess([[]], "/virtual/example.jsx");

    assert.deepStrictEqual(messages, []);
  });

  it("runs with recommended lint flat config and reports LitSX rule ids", async () => {
    const eslint = await createFlatESLint({
      cwd: process.cwd(),
      overrideConfigFile: true,
      overrideConfig: [plugin.configs["recommended-lint-flat"]],
    });

    const [result] = await eslint.lintText(
      'import { memo } from "react";\nconst Button = memo(() => <button @click="handleClick" className="cta" />);',
      { filePath: "example.tsx" },
    );

    const ruleIds = result.messages.map((message) => message.ruleId).sort();
    assert.deepStrictEqual(ruleIds, [
      "@litsx/no-invalid-binding-value",
      "@litsx/no-native-classname",
      "@litsx/no-react-memo",
    ]);
  });

  it("supports autofix for no-native-classname through the processor", async () => {
    const eslint = await createFlatESLint({
      cwd: process.cwd(),
      fix: true,
      overrideConfigFile: true,
      overrideConfig: [plugin.configs["recommended-lint-flat"]],
    });

    const [result] = await eslint.lintText(
      'const view = <button className="cta" />;',
      { filePath: "example.jsx" },
    );

    assert.equal(result.output, 'const view = <button class="cta" />;');
  });

  it("supports legacy config as well", async () => {
    const eslint = await createLegacyESLint({
      cwd: process.cwd(),
      useEslintrc: false,
      plugins: {
        "@litsx": plugin,
      },
      overrideConfig: plugin.configs["recommended-lint"],
    });

    const [result] = await eslint.lintText(
      'function Card() { if (ready) { ^styles(`:host{display:block;}`); } return <div />; }',
      { filePath: "example.jsx" },
    );

    assert.equal(result.messages.length, 1);
    assert.equal(result.messages[0].ruleId, "@litsx/static-hoists-top-level");
  });


  it("reports duplicate native hoists in recommended config", async () => {
    const eslint = await createFlatESLint({
      cwd: process.cwd(),
      overrideConfigFile: true,
      overrideConfig: [plugin.configs["recommended-lint-flat"]],
    });

    const [result] = await eslint.lintText(
      'function Card() { ^styles(`:host{display:block;}`); ^styles(`:host{color:red;}`); return <div />; }',
      { filePath: "example.jsx" },
    );

    assert.equal(result.messages.length, 1);
    assert.equal(result.messages[0].ruleId, "@litsx/no-duplicate-static-hoist");
  });

  it("reports React compatibility surface in migration config", async () => {
    const eslint = await createFlatESLint({
      cwd: process.cwd(),
      overrideConfigFile: true,
      overrideConfig: [plugin.configs["recommended-react-migration-flat"]],
    });

    const [result] = await eslint.lintText(
      'const view = <label htmlFor="name"><input defaultValue="Ada" defaultChecked /></label>;',
      { filePath: "example.jsx" },
    );

    assert.deepStrictEqual(
      result.messages.map((message) => message.ruleId).sort(),
      [
        "@litsx/no-react-compat-surface",
        "@litsx/no-react-compat-surface",
        "@litsx/no-react-compat-surface",
      ],
    );
  });

  it("reports strict-mode props and hoist ordering warnings", async () => {
    const eslint = await createFlatESLint({
      cwd: process.cwd(),
      overrideConfigFile: true,
      overrideConfig: [plugin.configs["strict-flat"]],
    });

    const [result] = await eslint.lintText(
      'function Card(props) { const title = props.title; ^styles(`:host{display:block;}`); return <div>{title}</div>; }',
      { filePath: "example.jsx" },
    );

    const ruleIds = result.messages.map((message) => message.ruleId).sort();
    assert.deepStrictEqual(ruleIds, [
      "@litsx/no-opaque-prop-metadata-inference",
      "@litsx/prefer-destructured-props",
      "@litsx/require-top-level-hoists-first",
    ]);
  });

  it("supports the configurable unknown static hoist rule", async () => {
    const eslint = await createFlatESLint({
      cwd: process.cwd(),
      overrideConfigFile: true,
      overrideConfig: [
        {
          ...plugin.configs["recommended-lint-flat"],
          rules: {
            ...plugin.configs["recommended-lint-flat"].rules,
            "@litsx/no-unknown-static-hoist": "warn",
          },
        },
      ],
    });

    const [result] = await eslint.lintText(
      'function Card() { ^analyticsTag({ section: "hero" }); return <div />; }',
      { filePath: "example.jsx" },
    );

    assert.equal(result.messages.length, 1);
    assert.equal(result.messages[0].ruleId, "@litsx/no-unknown-static-hoist");
  });

  it("covers message helpers for known, unknown, and warning-level authored issues", () => {
    assert.equal(getRuleIdForIssue({ kind: "native-classname" }), "@litsx/no-native-classname");
    assert.equal(getRuleIdForIssue({ kind: "something-else" }), "@litsx/authored-syntax");

    const state = {
      originalLineStarts: computeLineStarts("alpha\nbeta"),
    };
    const message = convertIssueToLintMessage({
      severity: "warning",
      message: "Warn",
      start: -4,
      length: -10,
    }, state);
    const fallback = convertIssueToLintMessage({}, state);

    assert.deepStrictEqual(message, {
      ruleId: "@litsx/authored-syntax",
      severity: 1,
      message: "Warn",
      line: 1,
      column: 1,
      endLine: 1,
      endColumn: 1,
    });
    assert.equal(fallback.severity, 2);
    assert.equal(fallback.message, "Unknown LitSX authored syntax issue.");
  });

  it("covers remap helpers for offsets, spans, fixes, suggestions, and dedup keys", () => {
    const virtualization = {
      toolingPreambleLength: 3,
      replacements: [
        {
          start: 2,
          end: 8,
          replacement: "__litsx_event_click",
        },
      ],
    };
    const state = {
      virtualization,
      originalLineStarts: [0, 6],
      virtualLineStarts: [0, 9],
    };

    assert.deepStrictEqual(offsetToLineColumn(-5, [0, 6]), { line: 1, column: 1 });
    assert.equal(lineColumnToOffset(10, 0, [0, 6]), 6);
    assert.equal(remapVirtualOffsetToOriginal(1, null), 1);
    assert.equal(remapVirtualOffsetToOriginal(3, virtualization), 0);
    assert.equal(remapVirtualOffsetToOriginal(7, virtualization), 2);

    assert.deepStrictEqual(mapOriginalSpanToVirtual(2, 4, virtualization), {
      start: 5,
      end: 24,
    });
    assert.deepStrictEqual(mapOriginalSpanToVirtual(0, 10, virtualization), {
      start: 3,
      end: 26,
    });

    assert.deepStrictEqual(remapLintFix(null, virtualization), null);
    assert.equal(remapLintFix({ range: [5, 6], text: "x" }, virtualization), null);
    assert.deepStrictEqual(remapLintFix({ range: [0, 2], text: "ok" }, virtualization), {
      range: [0, 0],
      text: "ok",
    });

    const remapped = remapLintMessage({
      message: "bad",
      line: 1,
      column: 6,
      endLine: 1,
      endColumn: 7,
      fix: { range: [0, 2], text: "ok" },
      suggestions: [
        { desc: "drop", fix: { range: [5, 6], text: "x" } },
        { desc: "keep", fix: { range: [0, 2], text: "ok" } },
        { desc: "noop" },
      ],
    }, state);

    assert.equal(remapped.line, 1);
    assert.equal(remapped.fix.range[0], 0);
    assert.equal(remapped.suggestions.length, 3);
    assert.equal(remapped.suggestions[0].fix, null);
    assert.equal(remapLintMessage({ message: "plain" }, null).message, "plain");
    assert.equal(createMessageDedupKey({ severity: 2, message: "x", line: 3 }), "2|x|3");
  });

  it("covers remap helper fallbacks for empty line tables, replacement tails, and removed fixes", () => {
    const virtualization = {
      toolingPreambleLength: 2,
      replacements: [
        {
          start: 4,
          end: 7,
          replacement: "__x__",
        },
      ],
    };
    const state = {
      virtualization,
      originalLineStarts: [],
      virtualLineStarts: [0],
    };

    assert.deepStrictEqual(offsetToLineColumn(3, []), { line: 1, column: 1 });
    assert.equal(lineColumnToOffset(0, 0, []), 0);
    assert.equal(remapVirtualOffsetToOriginal(20, virtualization), 16);

    assert.deepStrictEqual(mapOriginalSpanToVirtual(6, 0, virtualization), {
      start: 6,
      end: 11,
    });
    assert.deepStrictEqual(mapOriginalSpanToVirtual(1, 5, virtualization), {
      start: 3,
      end: 11,
    });

    const remapped = remapLintMessage({
      message: "remove fix",
      line: 1,
      column: 4,
      endColumn: 5,
      fix: { range: [6, 7], text: "x" },
      suggestions: [
        { desc: "drop", fix: { range: [6, 7], text: "x" } },
        null,
      ],
    }, state);

    assert.ok(!("fix" in remapped));
    assert.deepStrictEqual(remapped.suggestions, [{ desc: "drop", fix: null }, null]);
  });

  it("covers lint state helpers and processor branches around missing state and deduping", () => {
    assert.deepStrictEqual(computeLintLineStarts("a\nb"), [0, 2]);

    const state = createLintState('const view = <button @click="nope" />;', "/virtual/state.jsx");
    setLintState("/virtual/manual.jsx", state);
    assert.strictEqual(getLintState("/virtual/manual.jsx"), state);
    assert.strictEqual(takeLintState("/virtual/manual.jsx"), state);
    assert.equal(getLintState("/virtual/manual.jsx"), null);

    const processor = createLitsxProcessor();
    const postWithoutPreprocess = processor.postprocess([[{
      ruleId: "demo",
      severity: 2,
      message: "plain",
      line: 1,
      column: 1,
    }]], "/virtual/missing.jsx");
    assert.equal(postWithoutPreprocess.length, 1);

    const dedupState = createLintState('const view = <button @click="nope" />;', "/virtual/dedup.jsx");
    const duplicateMessage = convertIssueToLintMessage(dedupState.authoredIssues[0], dedupState);
    setLintState("/virtual/dedup.jsx", dedupState);
    const deduped = processor.postprocess([[duplicateMessage]], "/virtual/dedup.jsx");

    assert.equal(deduped.length, 1);
    assert.equal(deduped[0].message, duplicateMessage.message);
  });

  it("covers generic issue-backed rules and no-native-classname fix fallback", () => {
    const reports = [];
    const context = {
      filename: "/virtual/rule.jsx",
      sourceCode: {
        text: 'const view = <button className="cta" />;',
      },
      report(payload) {
        reports.push(payload);
      },
    };

    const rule = createIssueBackedRule({
      name: "demo",
      meta: { type: "problem", schema: [] },
      matchesIssue: (issue) => issue.kind === "native-classname",
      buildFix: () => null,
    });

    rule.create(context).Program();
    assert.equal(reports.length, 1);
    assert.equal(reports[0].fix(() => {}), null);

    const noFixIssueRule = noNativeClassname.create({
      ...context,
      sourceCode: {
        text: 'const view = <button />;',
      },
    });
    const noFixReports = [];
    noFixIssueRule.Program?.call({
      report(payload) {
        noFixReports.push(payload);
      },
    });

    const nativeClassnameReports = [];
    noNativeClassname.create({
      ...context,
      sourceCode: {
        text: 'const view = <button className="cta" />;',
      },
      report(payload) {
        nativeClassnameReports.push(payload);
      },
    }).Program();

    assert.equal(nativeClassnameReports.length, 1);
    assert.deepStrictEqual(nativeClassnameReports[0].fix({
      replaceTextRange(range, text) {
        return { range, text };
      },
    }), {
      range: [21, 30],
      text: "class",
    });

    const nativeClassnameNoFixReports = [];
    setLintState("/virtual/native-classname-no-fix.jsx", {
      ...createLintState('const view = <button className="cta" />;', "/virtual/native-classname-no-fix.jsx"),
      authoredIssues: [{
        kind: "native-classname",
        message: "native classname",
        start: 21,
        length: 9,
        fix: null,
      }],
    });
    noNativeClassname.create({
      ...context,
      filename: "/virtual/native-classname-no-fix.jsx",
      sourceCode: {
        text: 'const view = <button className="cta" />;',
      },
      report(payload) {
        nativeClassnameNoFixReports.push(payload);
      },
    }).Program();

    assert.equal(nativeClassnameNoFixReports.length, 1);
    assert.equal(nativeClassnameNoFixReports[0].fix({
      replaceTextRange() {
        throw new Error("should not be called");
      },
    }), null);
  });

  it("covers configurable static hoist rule branches directly", () => {
    const reports = [];
    const visitor = noUnknownStaticHoist.create({
      options: [{ allow: ["analyticsTag"] }],
      report(payload) {
        reports.push(payload);
      },
    });

    visitor.CallExpression({ callee: { type: "MemberExpression", name: "__litsx_static_styles" } });
    visitor.CallExpression({ callee: { type: "Identifier", name: "__litsx_static_styles" } });
    visitor.CallExpression({ callee: { type: "Identifier", name: "__litsx_static_analyticsTag" } });
    visitor.CallExpression({ callee: { type: "Identifier", name: "__litsx_static_unknownMacro" } });

    assert.equal(reports.length, 1);
    assert.match(reports[0].message, /unknownMacro/);
  });
});
