import assert from "assert";
import fs from "fs";
import path from "path";
import babelCore from "@babel/core";
import parser from "../packages/babel-parser-litsx/src/index.js";
import { beforeAll, describe, it } from "vitest";
import { interopDefault } from "./helpers/interop-default.js";

const { transformFromAstSync } = babelCore;
const fixtureDir = path.resolve("test/fixtures/transform-litsx-types");
let nativePreset;
const TEST_TIMEOUT = 30000;

function transformFixture(filename) {
  const filePath = path.join(fixtureDir, filename);
  const source = fs.readFileSync(filePath, "utf8");
  const inputAst = parser.parse(source, {
    sourceType: "module",
    plugins: ["typescript"],
  });

  return transformFromAstSync(inputAst, source, {
    configFile: false,
    babelrc: false,
    filename: filePath,
    presets: [[nativePreset, { jsxTemplate: false }]],
  }).code;
}

beforeAll(async () => {
  const mod = await import("../packages/babel-preset-litsx/src/index.js");
  nativePreset = interopDefault(mod);
});

describe("@litsx/babel-preset-litsx typed fixtures", () => {
  it("resolves imported utility types and merges ^properties overrides", () => {
    const code = transformFixture("shared-card.tsx");

    assert.match(code, /static get properties\(\)/);
    assert.match(code, /title: \{\s*type: String\s*\}/);
    assert.match(code, /active: \{\s*type: Boolean\s*\}/);
    assert.match(code, /reflect: true/);
    assert.match(code, /payload: \{\s*type: Object\s*\}/s);
    assert.match(code, /payload: \{\s*attribute: false\s*\}/s);
    assert.match(code, /onSelect: \{\s*type: Object,\s*attribute: false\s*\}/s);
    assert.match(code, /tags: \{\s*type: Array\s*\}/);
  }, TEST_TIMEOUT);

  it("resolves enterprise-style imported table props", () => {
    const code = transformFixture("table-view.tsx");

    assert.match(code, /columns: \{\s*type: Array\s*\}/);
    assert.match(code, /rows: \{\s*type: Array\s*\}/);
    assert.match(code, /selectedId: \{\s*type: String\s*\}/);
    assert.match(code, /onSelect: \{\s*type: Object,\s*attribute: false\s*\}/s);
  }, TEST_TIMEOUT);

  it("resolves branded primitive props and preserves richer Lit property options", () => {
    const code = transformFixture("resource-card.tsx");

    assert.match(code, /static get properties\(\)/);
    assert.match(code, /resourceId: \{\s*type: String\s*\}/s);
    assert.match(code, /attribute: "resource-id"/);
    assert.match(code, /useDefault: true/);
    assert.match(code, /status: \{\s*type: String\s*\}/s);
    assert.match(code, /reflect: true/);
    assert.match(code, /metadata: \{\s*type: Object\s*\}/s);
    assert.match(code, /metadata: \{\s*attribute: false,\s*converter: \{\s*fromAttribute\(value\)/s);
    assert.match(code, /onCommit: \{\s*type: Object,\s*attribute: false\s*\}/s);
    assert.match(code, /hasChanged\(value, oldValue\)/);
  }, TEST_TIMEOUT);

  it("resolves composed utility types and merges ^properties over inferred fields", () => {
    const code = transformFixture("form-panel.tsx");

    assert.match(code, /static get properties\(\)/);
    assert.match(code, /id: \{\s*type: String\s*\}/);
    assert.match(code, /disabled: \{\s*type: Boolean\s*\}/s);
    assert.match(code, /reflect: true/);
    assert.match(code, /submitLabel: \{\s*type: String\s*\}/);
    assert.match(code, /theme: \{\s*type: String\s*\}/);
    assert.match(code, /metadata: \{\s*type: Object\s*\}/s);
    assert.match(code, /metadata: \{\s*attribute: false\s*\}/s);
    assert.match(code, /onSubmit: \{\s*type: Object,\s*attribute: false\s*\}/s);
  }, TEST_TIMEOUT);

  it("resolves instantiated generic prop bags", () => {
    const code = transformFixture("async-panel.tsx");

    assert.match(code, /title: \{\s*type: String\s*\}/);
    assert.match(code, /id: \{\s*type: String\s*\}/);
    assert.match(code, /payload: \{\s*type: Object\s*\}/);
    assert.match(code, /ready: \{\s*type: Boolean\s*\}/);
    assert.match(code, /onResolve: \{\s*type: Object,\s*attribute: false\s*\}/s);
  }, TEST_TIMEOUT);

  it("resolves deep barrel imports and shared generic model types", () => {
    const code = transformFixture("project-grid.tsx");

    assert.match(code, /static get properties\(\)/);
    assert.match(code, /title: \{\s*type: String\s*\}/);
    assert.match(code, /filters: \{\s*type: Array\s*\}/);
    assert.match(code, /page: \{\s*type: Object\s*\}/s);
    assert.match(code, /page: \{\s*attribute: false\s*\}/s);
    assert.match(code, /selectedId: \{\s*type: String\s*\}/s);
    assert.match(code, /attribute: "selected-id"/);
    assert.match(code, /reflect: true/);
    assert.match(code, /onSelect: \{\s*type: Object,\s*attribute: false\s*\}/s);
  }, TEST_TIMEOUT);

  it("degrades complex conditional and mapped types to stable Lit descriptors", () => {
    const code = transformFixture("fallback-panel.tsx");

    assert.match(code, /envelope: \{\s*type: Object\s*\}/);
    assert.match(code, /flags: \{\s*type: Object\s*\}/);
    assert.match(code, /displayValue: \{\s*type: Object\s*\}/);
    assert.match(code, /onCommit: \{\s*type: Object,\s*attribute: false\s*\}/s);
  }, TEST_TIMEOUT);

  it("maps dates and enums while degrading mixed unions", () => {
    const code = transformFixture("edge-panel.tsx");

    assert.match(code, /createdAt: \{\s*type: Date\s*\}/);
    assert.match(code, /mode: \{\s*type: String\s*\}/);
    assert.match(code, /retryPolicy: \{\s*type: Number\s*\}/);
    assert.match(code, /mixed: \{\s*type: Object\s*\}/);
    assert.match(code, /onRetry: \{\s*type: Object,\s*attribute: false\s*\}/s);
  }, TEST_TIMEOUT);
});
