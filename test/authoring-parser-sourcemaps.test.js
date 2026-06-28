import assert from "assert";
import babelCore from "@babel/core";
import { TraceMap, originalPositionFor } from "@jridgewell/trace-mapping";
import parser, {
  getLitsxVirtualizationMetadata,
} from "./helpers/litsx-parser.js";
import { beforeAll, describe, it } from "vitest";
import { interopDefault } from "./helpers/interop-default.js";

const { transformFromAstSync } = babelCore;

let nativePreset;
let patchLitAttributeSourcemap;

function positionFromIndex(text, index) {
  let line = 1;
  let column = 0;

  for (let cursor = 0; cursor < index; cursor += 1) {
    if (text[cursor] === "\n") {
      line += 1;
      column = 0;
      continue;
    }

    column += 1;
  }

  return { line, column };
}

function findPosition(text, needle) {
  const index = text.indexOf(needle);
  assert.notStrictEqual(index, -1, `expected to find "${needle}"`);
  return positionFromIndex(text, index);
}

beforeAll(async () => {
  nativePreset = interopDefault(
    await import("../packages/babel-preset-litsx/src/index.js")
  );
  ({ patchLitAttributeSourcemap } = await import(
    "../packages/babel-plugin-transform-jsx-html-template/src/index.js"
  ));
});

describe("@litsx/authoring parser sourcemaps", () => {
  it("keeps virtualization maps aligned to authored lit-flavoured attributes", () => {
    const source = [
      "export function Counter(){",
      "  return <button @click={save} .value={name} ?disabled={busy}>Hi</button>;",
      "}",
    ].join("\n");

    const ast = parser.parse(source, {
      sourceType: "module",
      sourceFileName: "/virtual/Counter.tsx",
    });
    const virtualization = getLitsxVirtualizationMetadata(ast);
    assert.ok(virtualization?.map, "expected virtualization sourcemap metadata");

    const traceMap = new TraceMap(virtualization.map);
    const checks = [
      ["__litsx_event_click", "@click"],
      ["__litsx_prop_value", ".value"],
      ["__litsx_bool_disabled", "?disabled"],
    ];

    for (const [generatedNeedle, originalNeedle] of checks) {
      const generated = findPosition(virtualization.code, generatedNeedle);
      const expected = findPosition(source, originalNeedle);
      const actual = originalPositionFor(traceMap, generated);

      assert.strictEqual(actual.source, "/virtual/Counter.tsx");
      assert.strictEqual(actual.line, expected.line);
      assert.strictEqual(actual.column, expected.column);
    }
  });

  it("keeps later virtual attributes aligned through the Babel transform pipeline", () => {
    const source = [
      "export function Counter(){",
      "  return <button @click={save} .value={name} ?disabled={busy}>Hi</button>;",
      "}",
    ].join("\n");

    const ast = parser.parse(source, {
      sourceType: "module",
      sourceFileName: "/virtual/Counter.tsx",
    });
    const virtualization = getLitsxVirtualizationMetadata(ast);
    assert.ok(virtualization?.map, "expected virtualization sourcemap metadata");

    const resultRaw = transformFromAstSync(ast, source, {
      filename: "/virtual/Counter.tsx",
      sourceFileName: "/virtual/Counter.tsx",
      configFile: false,
      babelrc: false,
      inputSourceMap: virtualization.map,
      sourceMaps: true,
      presets: [[nativePreset, {}]],
    });
    const result = {
      ...resultRaw,
      map: patchLitAttributeSourcemap(
        resultRaw.code,
        resultRaw.map,
        resultRaw.metadata?.litsxTemplateAttributeMappings || []
      ),
    };

    assert.ok(result?.map, "expected Babel to emit a sourcemap");

    const traceMap = new TraceMap(result.map);
    const checks = [
      [".value", ".value"],
      ["?disabled", "?disabled"],
    ];

    for (const [generatedNeedle, originalNeedle] of checks) {
      const generated = findPosition(result.code, generatedNeedle);
      const expected = findPosition(source, originalNeedle);
      const actual = originalPositionFor(traceMap, generated);

      assert.strictEqual(actual.source, "/virtual/Counter.tsx");
      assert.strictEqual(actual.line, expected.line);
      assert.strictEqual(actual.column, expected.column);
    }
  }, 30000);
});
