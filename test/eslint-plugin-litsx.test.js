import assert from "assert";
import { describe, it } from "vitest";
import { FlatESLint, LegacyESLint } from "eslint/use-at-your-own-risk";
import plugin, { createLitsxProcessor } from "../packages/eslint-plugin-litsx/src/index.js";

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

describe("@litsx/eslint-plugin", () => {
  it("exports the processor, rules, and configs", () => {
    assert.ok(plugin.processors.litsx);
    assert.ok(plugin.rules["no-native-classname"]);
    assert.ok(plugin.rules["no-duplicate-static-hoist"]);
    assert.ok(plugin.rules["no-react-compat-surface"]);
    assert.ok(plugin.rules["prefer-destructured-props"]);
    assert.ok(plugin.rules["no-opaque-prop-metadata-inference"]);
    assert.ok(plugin.rules["require-top-level-hoists-first"]);
    assert.ok(plugin.rules["no-unknown-static-hoist"]);
    assert.ok(plugin.configs.recommended);
    assert.ok(plugin.configs["recommended-react-migration"]);
    assert.ok(plugin.configs.strict);
    assert.ok(plugin.configs["recommended-flat"]);
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

  it("runs with flat config and reports LitSX rule ids", async () => {
    const eslint = new FlatESLint({
      cwd: process.cwd(),
      overrideConfigFile: true,
      overrideConfig: [plugin.configs["recommended-flat"]],
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
    const eslint = new FlatESLint({
      cwd: process.cwd(),
      fix: true,
      overrideConfigFile: true,
      overrideConfig: [plugin.configs["recommended-flat"]],
    });

    const [result] = await eslint.lintText(
      'const view = <button className="cta" />;',
      { filePath: "example.jsx" },
    );

    assert.equal(result.output, 'const view = <button class="cta" />;');
  });

  it("supports legacy config as well", async () => {
    const eslint = new LegacyESLint({
      cwd: process.cwd(),
      useEslintrc: false,
      plugins: {
        "@litsx": plugin,
      },
      overrideConfig: plugin.configs.recommended,
    });

    const [result] = await eslint.lintText(
      'function Card() { if (ready) { ^styles(`:host{display:block;}`); } return <div />; }',
      { filePath: "example.jsx" },
    );

    assert.equal(result.messages.length, 1);
    assert.equal(result.messages[0].ruleId, "@litsx/static-hoists-top-level");
  });

  it("reports duplicate native hoists in recommended config", async () => {
    const eslint = new FlatESLint({
      cwd: process.cwd(),
      overrideConfigFile: true,
      overrideConfig: [plugin.configs["recommended-flat"]],
    });

    const [result] = await eslint.lintText(
      'function Card() { ^styles(`:host{display:block;}`); ^styles(`:host{color:red;}`); return <div />; }',
      { filePath: "example.jsx" },
    );

    assert.equal(result.messages.length, 1);
    assert.equal(result.messages[0].ruleId, "@litsx/no-duplicate-static-hoist");
  });

  it("reports React compatibility surface in migration config", async () => {
    const eslint = new FlatESLint({
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
    const eslint = new FlatESLint({
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
    const eslint = new FlatESLint({
      cwd: process.cwd(),
      overrideConfigFile: true,
      overrideConfig: [
        {
          ...plugin.configs["recommended-flat"],
          rules: {
            ...plugin.configs["recommended-flat"].rules,
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
});
