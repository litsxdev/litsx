import assert from "assert";
import babelCore from "@babel/core";
import fs from "fs";
import { TraceMap, originalPositionFor } from "@jridgewell/trace-mapping";
import os from "os";
import path from "path";
import { describe, it, vi } from "vitest";
import * as jsxTemplateModule from "../packages/babel-plugin-transform-jsx-html-template/src/index.js";
import * as presetModule from "../packages/babel-preset-litsx/src/index.js";
import { createLitsxTypecheckSession } from "../packages/typescript-plugin-litsx/src/typecheck.js";

import {
  createLitsxCompilationSession,
  transformLitsx,
  transformLitsxSync,
} from "../packages/compiler/src/index.js";

const { types: t } = babelCore;

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

describe("@litsx/compiler", () => {
  it("compiles authored LitSX source and returns metadata", () => {
    const source = [
      "export const Counter = ({ label = 'Save' }) => {",
      "  return <button class=\"cta\" @click={save}>{label}</button>;",
      "};",
    ].join("\n");

    const result = transformLitsxSync(source, {
      filename: "/virtual/Counter.jsx",
    });

    assert.match(result.code, /html`/);
    assert.match(result.code, /@click=\$\{save\}/);
    assert.strictEqual(result.map, null);
    assert.ok(result.metadata);
    assert.ok(Array.isArray(result.metadata.litsxTemplateAttributeMappings));
  }, 20000);

  it("keeps lit-style attributes aligned in the final sourcemap", async () => {
    const source = [
      "export function Counter(){",
      "  return <button @click={save} .value={name} ?disabled={busy}>Hi</button>;",
      "}",
    ].join("\n");

    const result = await transformLitsx(source, {
      filename: "/virtual/Counter.tsx",
      sourceMaps: true,
    });

    assert.ok(result.map, "expected compiler to emit a sourcemap");
    const traceMap = new TraceMap(result.map);
    const checks = [
      ["@click", "@click"],
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
  }, 30_000);

  it("can consume a shared TypeScript project session from typecheck for native typed compilation", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "litsx-shared-ts-session-"));
    const tsconfigPath = path.join(tempDir, "tsconfig.json");
    const typesPath = path.join(tempDir, "types.ts");
    const filePath = path.join(tempDir, "card.tsx");
    const source = [
      "import type { CardProps } from './types';",
      "export function Card({ title, active }: CardProps) {",
      "  return <article>{title}{active ? 'on' : 'off'}</article>;",
      "}",
    ].join("\n");

    fs.writeFileSync(
      tsconfigPath,
      JSON.stringify({
        compilerOptions: {
          jsx: "preserve",
          noEmit: true,
        },
        include: ["card.tsx", "types.ts"],
      }),
    );
    fs.writeFileSync(
      typesPath,
      [
        "export type CardProps = {",
        "  title: string;",
        "  active: boolean;",
        "};",
      ].join("\n"),
    );
    fs.writeFileSync(filePath, source);

    try {
      const sharedSession = createLitsxTypecheckSession(["--project", tsconfigPath]);

      const withSharedSession = transformLitsxSync(source, {
        filename: filePath,
        jsxTemplate: false,
        typescriptSession: sharedSession.projectSession,
      });
      const standalone = transformLitsxSync(source, {
        filename: filePath,
        jsxTemplate: false,
      });

      assert.strictEqual(withSharedSession.code, standalone.code);
      assert.match(withSharedSession.code, /title: \{\s*type: String\s*\}/);
      assert.match(withSharedSession.code, /active: \{\s*type: Boolean\s*\}/);
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  }, 20_000);

  it("surfaces metadata warnings when native className is authored", () => {
    const source = [
      "export const Counter = () => {",
      "  return <button className=\"cta\">Save</button>;",
      "};",
    ].join("\n");

    const result = transformLitsxSync(source, {
      filename: "/virtual/Counter.jsx",
    });

    assert.ok(Array.isArray(result.metadata.litsxWarnings));
    assert.strictEqual(result.metadata.litsxWarnings.length, 1);
    assert.strictEqual(result.metadata.litsxWarnings[0].code, "LITSX_NATIVE_CLASSNAME");
    assert.match(result.metadata.litsxWarnings[0].message, /is not native LitSX syntax/);
  }, 20000);

  it("surfaces metadata warnings when React memo wrappers are lowered away", () => {
    const source = [
      "import { memo } from 'react';",
      "const Counter = memo(({ label }) => {",
      "  return <button>{label}</button>;",
      "});",
    ].join("\n");

    const result = transformLitsxSync(source, {
      filename: "/virtual/Counter.jsx",
    });

    assert.ok(Array.isArray(result.metadata.litsxWarnings));
    assert.strictEqual(result.metadata.litsxWarnings.length, 1);
    assert.strictEqual(result.metadata.litsxWarnings[0].code, "LITSX_REACT_MEMO_STRIPPED");
    assert.match(result.metadata.litsxWarnings[0].message, /migration wrapper only/);
  }, 20000);

  it("runs outputPlugins after the native preset pipeline", () => {
    const source = [
      "export const Counter = ({ label }) => {",
      "  return <button>{label}</button>;",
      "};",
    ].join("\n");

    const renameClassPlugin = () => ({
      visitor: {
        ClassDeclaration(path) {
          if (path.node.id?.name === "Counter") {
            path.node.id = t.identifier("CounterAfterNative");
          }
        },
      },
    });

    const result = transformLitsxSync(source, {
      filename: "/virtual/Counter.jsx",
      outputPlugins: [renameClassPlugin],
    });

    assert.match(result.code, /class CounterAfterNative extends LitElement/);
  }, 20000);

  it("runs authoringPlugins before the native preset pipeline", () => {
    const source = [
      "export const Counter = ({ label }) => {",
      "  return <x-rename-tag>{label}</x-rename-tag>;",
      "};",
    ].join("\n");

    const renameIntrinsicPlugin = () => ({
      visitor: {
        JSXIdentifier(path) {
          if (
            path.node.name === "x-rename-tag" &&
            path.parent?.type === "JSXOpeningElement"
          ) {
            path.node.name = "button";
          }
          if (
            path.node.name === "x-rename-tag" &&
            path.parent?.type === "JSXClosingElement"
          ) {
            path.node.name = "button";
          }
        },
      },
    });

    const result = transformLitsxSync(source, {
      filename: "/virtual/Counter.jsx",
      authoringPlugins: [renameIntrinsicPlugin],
    });

    assert.match(result.code, /html`<button>\$\{this\.label\}<\/button>`/);
    assert.doesNotMatch(result.code, /x-rename-tag/);
  }, 20000);

  it("can skip final template lowering while preserving native class lowering", () => {
    const source = [
      "export const Counter = ({ label }) => {",
      "  return <button @click={save}>{label}</button>;",
      "};",
    ].join("\n");

    const result = transformLitsxSync(source, {
      filename: "/virtual/Counter.jsx",
      jsxTemplate: false,
    });

    assert.match(result.code, /class Counter extends LitElement/);
    assert.match(result.code, /return <button @click=\{save\}>\{this\.label\}<\/button>;/);
    assert.doesNotMatch(result.code, /html`/);
  }, 20000);

  it("preserves the raw Babel sourcemap when final template lowering is disabled", () => {
    const source = [
      "export const Counter = ({ label }) => {",
      "  return <button @click={save}>{label}</button>;",
      "};",
    ].join("\n");

    const result = transformLitsxSync(source, {
      filename: "/virtual/Counter.jsx",
      jsxTemplate: false,
      sourceMaps: true,
    });

    assert.ok(result.map);
    assert.strictEqual(result.map.version, 3);
    assert.ok(Array.isArray(result.map.sources));
    assert.ok(result.map.sources.includes("/virtual/Counter.jsx"));
  }, 20000);

  it("dedupes authored and plugin warnings while tolerating missing warning fields", () => {
    const source = [
      "export const Counter = () => {",
      "  return <button className=\"cta\">Save</button>;",
      "};",
    ].join("\n");

    const pluginWarnings = () => ({
      post(file) {
        file.metadata.litsxWarnings = [
          { attributeName: "className", tagName: "button" },
          { attributeName: "className", tagName: "button" },
        ];
      },
    });

    const result = transformLitsxSync(source, {
      filename: "/virtual/Counter.jsx",
      outputPlugins: [pluginWarnings],
    });

    assert.ok(Array.isArray(result.metadata.litsxWarnings));
    assert.strictEqual(result.metadata.litsxWarnings.length, 2);
    assert.strictEqual(
      result.metadata.litsxWarnings.filter((warning) => warning.code === "LITSX_NATIVE_CLASSNAME").length,
      1
    );
    assert.strictEqual(
      result.metadata.litsxWarnings.filter((warning) => !warning.code).length,
      1
    );
  }, 20000);

  it("reuses memoized preset plugins for repeated compiler calls with the same options object", () => {
    const source = [
      "export const Counter = ({ label }) => {",
      "  return <button>{label}</button>;",
      "};",
    ].join("\n");
    const options = {
      filename: "/virtual/Counter.jsx",
      jsxTemplate: false,
    };
    const presetSpy = vi.spyOn(presetModule, "createLitsxPresetPlugins");

    try {
      transformLitsxSync(source, options);
      transformLitsxSync(source, options);

      assert.strictEqual(presetSpy.mock.calls.length, 1);
    } finally {
      presetSpy.mockRestore();
    }
  }, 20_000);

  it("provides a reusable compilation session facade", async () => {
    const session = createLitsxCompilationSession({
      transformOptions: {
        jsxTemplate: false,
      },
    });
    const source = [
      "export const Counter = ({ label }) => {",
      "  return <button>{label}</button>;",
      "};",
    ].join("\n");

    try {
      const first = session.transformSync(source, {
        filename: "/virtual/Counter.jsx",
      });
      const second = await session.transform(source, {
        filename: "/virtual/Counter.jsx",
      });

      assert.strictEqual(first.code, second.code);
      assert.equal(typeof session.getTypecheckSession, "function");

      session.invalidate(["/virtual/Counter.jsx"]);

      const third = session.transformSync(source, {
        filename: "/virtual/Counter.jsx",
      });
      assert.strictEqual(third.code, first.code);
    } finally {
      session.dispose();
    }
  }, 20_000);

  it("memoizes preset plugins per feature set for the same options object", () => {
    const plainSource = [
      "export const Counter = ({ label }) => {",
      "  return <button>{label}</button>;",
      "};",
    ].join("\n");
    const featureSource = [
      "import FancyButton from './FancyButton.js';",
      "import { useRef, useState } from 'litsx';",
      "export function Counter({ label }) {",
      "  const ref = useRef(null);",
      "  const [count] = useState(0);",
      "  return <FancyButton ref={ref}>{label}{count}</FancyButton>;",
      "}",
    ].join("\n");
    const options = {
      filename: "/virtual/Counter.jsx",
      jsxTemplate: false,
    };
    const presetSpy = vi.spyOn(presetModule, "createLitsxPresetPlugins");

    try {
      transformLitsxSync(plainSource, options);
      transformLitsxSync(featureSource, options);
      transformLitsxSync(featureSource, options);

      assert.strictEqual(presetSpy.mock.calls.length, 2);
    } finally {
      presetSpy.mockRestore();
    }
  }, 20_000);

  it("skips template sourcemap patching when no template attribute mappings are emitted", () => {
    const source = [
      "export const Counter = () => {",
      "  return <button>Save</button>;",
      "};",
    ].join("\n");
    const patchSpy = vi.spyOn(jsxTemplateModule, "patchLitAttributeSourcemap");

    try {
      const result = transformLitsxSync(source, {
        filename: "/virtual/Counter.jsx",
        sourceMaps: true,
      });

      assert.ok(result.map);
      assert.strictEqual(patchSpy.mock.calls.length, 0);
    } finally {
      patchSpy.mockRestore();
    }
  }, 20_000);
});
