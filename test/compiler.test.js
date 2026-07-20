import assert from "assert";
import babelCore from "@babel/core";
import fs from "fs";
import { TraceMap, originalPositionFor } from "@jridgewell/trace-mapping";
import os from "os";
import path from "path";
import { describe, it, vi } from "vitest";
import packageJson from "../packages/compiler/package.json" with { type: "json" };
import * as jsxTemplateModule from "../packages/babel-plugin-transform-jsx-html-template/src/index.js";
import * as presetModule from "../packages/babel-preset-litsx/src/index.js";
import { createLitsxTypecheckSession } from "../packages/typescript/src/typecheck.js";

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
  it("publishes compiler runtime and declarations from dist", () => {
    assert.strictEqual(packageJson.module, "./src/index.js");
    assert.strictEqual(packageJson.types, "./src/index.d.ts");
    assert.strictEqual(packageJson.exports["."].import, "./src/index.js");
    assert.strictEqual(packageJson.exports["."].types, "./src/index.d.ts");
    assert.strictEqual(packageJson.exports["./authored-input"].import, "./src/authored-input.js");
    assert.strictEqual(packageJson.exports["./authored-input"].types, "./src/authored-input.d.ts");
    assert.deepStrictEqual(packageJson.files, ["dist", "src", "README.md"]);
  });

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

  it("compiles .litsx source with TypeScript syntax by default", () => {
    const source = [
      "export const Counter = ({ label }: { label: string }) => {",
      "  return <button class=\"cta\" @click={save}>{label}</button>;",
      "};",
    ].join("\n");

    const result = transformLitsxSync(source, {
      filename: "/virtual/Counter.litsx",
    });

    assert.match(result.code, /html`/);
    assert.match(result.code, /@click=\$\{save\}/);
    assert.doesNotMatch(result.code, /label: string/);
    assert.doesNotMatch(result.code, /type\s+[A-Za-z0-9_]+/);
  }, 20000);

  it("lowers authored local story hosts with expression props as property bindings", () => {
    const source = [
      "const VdsDrawerStory = ({ defaultOpen = false, heading = '', description = '' }) => {",
      "  return <div>{heading}{description}{String(defaultOpen)}</div>;",
      "};",
      "",
      "export const Playground = {",
      "  render: (args) => (",
      "    <VdsDrawerStory",
      "      defaultOpen={args.defaultOpen}",
      "      heading={args.heading}",
      "      description={args.description}",
      "      class=\"story-shell\"",
      "      data-testid={args.testId}",
      "    />",
      "  ),",
      "};",
    ].join("\n");

    const result = transformLitsxSync(source, {
      filename: "/virtual/vds-drawer.stories.litsx",
    });

    assert.match(result.code, /class VdsDrawerStory extends LitElement/);
    assert.match(result.code, /html`<vds-drawer-story \.defaultOpen=\$\{args\.defaultOpen\} \.heading=\$\{args\.heading\} \.description=\$\{args\.description\} class="story-shell" data-testid="\$\{args\.testId\}"><\/vds-drawer-story>`/);
    assert.doesNotMatch(result.code, /defaultOpen="\$\{args\.defaultOpen\}"/);
  }, 20000);

  it("materializes bare props references instead of reading a synthetic this.props", () => {
    const source = [
      "export function VdsOverlayBar(props) {",
      "  console.log(\"VdsOverlayBar props:\", props);",
      "  return <div>{props.heading}</div>;",
      "}",
    ].join("\n");

    const result = transformLitsxSync(source, {
      filename: "/virtual/VdsOverlayBar.litsx",
    });

    assert.match(result.code, /console\.log\("VdsOverlayBar props:", \{\s*heading: this\.heading\s*\}\);/);
    assert.doesNotMatch(result.code, /this\.props/);
  }, 20000);

  it("injects stable callsite metadata for useStableId", () => {
    const source = [
      'import { useStableId } from "@litsx/core";',
      "export function StableIds() {",
      "  const first = useStableId();",
      "  const second = useStableId();",
      "  return <div>{first}:{second}</div>;",
      "}",
    ].join("\n");
    const options = {
      filename: "/virtual/components/stable-ids.litsx",
      sourceMaps: false,
    };

    const firstResult = transformLitsxSync(source, options);
    const secondResult = transformLitsxSync(source, options);
    const ids = [...firstResult.code.matchAll(/useStableId\(this, "([^"]+)"\)/g)]
      .map((match) => match[1]);
    const nextIds = [...secondResult.code.matchAll(/useStableId\(this, "([^"]+)"\)/g)]
      .map((match) => match[1]);

    assert.strictEqual(ids.length, 2);
    assert.deepStrictEqual(ids, nextIds);
    assert.notStrictEqual(ids[0], ids[1]);
    assert.ok(ids.every((id) => id.startsWith("litsx-stable-")));
  }, 20000);

  it("injects stable host-type metadata for generated component classes", () => {
    const source = [
      "export function PrimaryCard() {",
      "  return <div>one</div>;",
      "}",
      "export function SecondaryCard() {",
      "  return <div>two</div>;",
      "}",
    ].join("\n");
    const options = {
      filename: "/virtual/components/stable-class-ids.litsx",
      sourceMaps: false,
    };

    const firstResult = transformLitsxSync(source, options);
    const secondResult = transformLitsxSync(source, options);
    const ids = [...firstResult.code.matchAll(/\[Symbol\.for\("litsx\.hostTypeId"\)\] = "([^"]+)"/g)]
      .map((match) => match[1]);
    const nextIds = [...secondResult.code.matchAll(/\[Symbol\.for\("litsx\.hostTypeId"\)\] = "([^"]+)"/g)]
      .map((match) => match[1]);

    assert.doesNotMatch(firstResult.code, /@litsx\/core\/elements/);
    assert.match(firstResult.code, /static \[Symbol\.for\("litsx\.component"\)\] = true;/);
    assert.strictEqual(ids.length, 2);
    assert.deepStrictEqual(ids, nextIds);
    assert.notStrictEqual(ids[0], ids[1]);
    assert.ok(ids.every((id) => id.startsWith("litsx-host-type-")));
  }, 20000);

  it("emits hydratable tag metadata for generated component classes", () => {
    const source = [
      "export function FeatureCard() {",
      "  return <div>feature</div>;",
      "}",
    ].join("\n");

    const result = transformLitsxSync(source, {
      filename: "/virtual/components/feature-card.litsx",
      sourceMaps: false,
    });

    assert.match(
      result.code,
      /static \[Symbol\.for\("litsx\.hydratableTag"\)\] = "feature-card";/,
    );
  }, 20000);

  it("threads host through useHostTypeId inside imported custom hooks", () => {
    const hookSource = [
      'import { useHostTypeId, useMemoValue } from "@litsx/core";',
      "export function useDemoType() {",
      "  const hostTypeId = useHostTypeId();",
      "  return useMemoValue(() => hostTypeId, [hostTypeId]);",
      "}",
    ].join("\n");
    const consumerSource = [
      'import { useDemoType } from "./demo-type";',
      "export const DemoComponent = () => {",
      "  const hostTypeId = useDemoType();",
      "  return <div>{hostTypeId}</div>;",
      "};",
    ].join("\n");

    const hookResult = transformLitsxSync(hookSource, {
      filename: "/virtual/demo-type.tsx",
      jsxTemplate: false,
    });
    const consumerResult = transformLitsxSync(consumerSource, {
      filename: "/virtual/demo-component.litsx",
      jsxTemplate: false,
      inMemoryFiles: {
        "/virtual/demo-type.tsx": hookSource,
      },
    });

    assert.match(hookResult.code, /export function useDemoType\(_host\)/);
    assert.match(hookResult.code, /const hostTypeId = useHostTypeId\(_host\);/);
    assert.match(hookResult.code, /useDemoType\[Symbol\.for\("litsx\.hook"\)\] = true;/);
    assert.match(consumerResult.code, /const hostTypeId = useDemoType\(this\);/);
  }, 20000);

  it("threads host through imported custom hooks that call LitSX runtime hooks", () => {
    const hookSource = [
      'import { useExternalStore, useMemoValue, useStableId } from "@litsx/core";',
      "const subscribe = (listener: () => void) => {",
      "  return () => {};",
      "};",
      "const getSnapshot = () => 0;",
      "export function useDemo(input: string) {",
      "  useExternalStore(subscribe, getSnapshot, getSnapshot);",
      "  const id = useStableId();",
      "  const value = useMemoValue(() => `${input}:${id}`, [input, id]);",
      "  return value;",
      "}",
    ].join("\n");
    const consumerSource = [
      'import { useDemo } from "./use-demo";',
      "export const DemoConsumer = () => {",
      '  const value = useDemo("x");',
      "  return <div>{value}</div>;",
      "};",
    ].join("\n");

    const hookResult = transformLitsxSync(hookSource, {
      filename: "/virtual/use-demo.tsx",
      jsxTemplate: false,
    });
    const consumerResult = transformLitsxSync(consumerSource, {
      filename: "/virtual/demo-consumer.litsx",
      jsxTemplate: false,
      inMemoryFiles: {
        "/virtual/use-demo.tsx": hookSource,
      },
    });

    assert.match(hookResult.code, /export function useDemo\(_host, input\)/);
    assert.match(hookResult.code, /useExternalStore\(_host, subscribe, getSnapshot, getSnapshot\)/);
    assert.match(hookResult.code, /useStableId\(_host, "litsx-stable-[^"]+"\)/);
    assert.match(hookResult.code, /useMemoValue\(_host, \(\) => `\$\{input\}:\$\{id\}`, \[input, id\]\)/);
    assert.match(hookResult.code, /useDemo\[Symbol\.for\("litsx\.hook"\)\] = true;/);
    assert.match(consumerResult.code, /prepareEffects\(this\);/);
    assert.match(consumerResult.code, /const value = useDemo\(this, "x"\);/);
    assert.doesNotMatch(consumerResult.code, /const value = useDemo\("x"\);/);
  }, 20000);

  it("recognizes precompiled LitSX runtime custom hooks from published metadata", () => {
    const hookSource = [
      'import { useMemoValue, useStableId } from "@litsx/core";',
      "export function useDemo(input: string) {",
      "  const id = useStableId();",
      "  return useMemoValue(() => `${input}:${id}`, [input, id]);",
      "}",
    ].join("\n");
    const compiledHookResult = transformLitsxSync(hookSource, {
      filename: "/virtual/use-demo.tsx",
      jsxTemplate: false,
    });
    const consumerSource = [
      'import { useDemo } from "./use-demo.js";',
      "export const DemoConsumer = () => {",
      '  const value = useDemo("x");',
      "  return <div>{value}</div>;",
      "};",
    ].join("\n");

    const consumerResult = transformLitsxSync(consumerSource, {
      filename: "/virtual/demo-consumer.litsx",
      jsxTemplate: false,
      inMemoryFiles: {
        "/virtual/use-demo.js": compiledHookResult.code,
      },
    });

    assert.match(compiledHookResult.code, /useDemo\[Symbol\.for\("litsx\.hook"\)\] = true;/);
    assert.match(consumerResult.code, /const value = useDemo\(this, "x"\);/);
  }, 20000);

  it("recognizes precompiled LitSX runtime custom hooks from direct Symbol.for metadata", () => {
    const compiledHookSource = [
      "export function useDemo(input) {",
      "  return `${input}:ok`;",
      "}",
      'useDemo[Symbol.for("litsx.hook")] = true;',
    ].join("\n");
    const consumerSource = [
      'import { useDemo } from "./use-demo.js";',
      "export const DemoConsumer = () => {",
      '  const value = useDemo("x");',
      "  return <div>{value}</div>;",
      "};",
    ].join("\n");

    const consumerResult = transformLitsxSync(consumerSource, {
      filename: "/virtual/demo-consumer.litsx",
      jsxTemplate: false,
      inMemoryFiles: {
        "/virtual/use-demo.js": compiledHookSource,
      },
    });

    assert.match(consumerResult.code, /const value = useDemo\(this, "x"\);/);
  }, 20000);

  it("recognizes precompiled LitSX runtime custom hooks through namespace imports", () => {
    const hookSource = [
      'import { useMemoValue, useStableId } from "@litsx/core";',
      "export function useDemo(input: string) {",
      "  const id = useStableId();",
      "  return useMemoValue(() => `${input}:${id}`, [input, id]);",
      "}",
    ].join("\n");
    const compiledHookResult = transformLitsxSync(hookSource, {
      filename: "/virtual/use-demo.tsx",
      jsxTemplate: false,
    });
    const consumerSource = [
      'import * as DemoHooks from "./use-demo.js";',
      "export const DemoConsumer = () => {",
      '  const value = DemoHooks.useDemo("x");',
      "  return <div>{value}</div>;",
      "};",
    ].join("\n");

    const consumerResult = transformLitsxSync(consumerSource, {
      filename: "/virtual/demo-consumer.litsx",
      jsxTemplate: false,
      inMemoryFiles: {
        "/virtual/use-demo.js": compiledHookResult.code,
      },
    });

    assert.match(consumerResult.code, /const value = DemoHooks\.useDemo\(this, "x"\);/);
  }, 20000);

  it("recognizes precompiled LitSX runtime custom hooks through compiled barrel re-exports", () => {
    const hookSource = [
      'import { useMemoValue, useStableId } from "@litsx/core";',
      "export function useDemo(input: string) {",
      "  const id = useStableId();",
      "  return useMemoValue(() => `${input}:${id}`, [input, id]);",
      "}",
    ].join("\n");
    const compiledHookResult = transformLitsxSync(hookSource, {
      filename: "/virtual/use-demo.tsx",
      jsxTemplate: false,
    });
    const barrelSource = 'export * from "./use-demo.js";';
    const consumerSource = [
      'import { useDemo } from "./hooks/index.js";',
      "export const DemoConsumer = () => {",
      '  const value = useDemo("x");',
      "  return <div>{value}</div>;",
      "};",
    ].join("\n");

    const consumerResult = transformLitsxSync(consumerSource, {
      filename: "/virtual/demo-consumer.litsx",
      jsxTemplate: false,
      inMemoryFiles: {
        "/virtual/hooks/use-demo.js": compiledHookResult.code,
        "/virtual/hooks/index.js": barrelSource,
      },
    });

    assert.match(consumerResult.code, /const value = useDemo\(this, "x"\);/);
  }, 20000);

  it("does not reprocess custom hooks already marked as compiled", () => {
    const source = [
      'import { useMemoValue, useStableId } from "@litsx/core";',
      "export function useDemo(_host, input) {",
      '  const id = useStableId(_host, "litsx-stable-demo");',
      "  return useMemoValue(_host, () => `${input}:${id}`, [input, id]);",
      "}",
      'useDemo[Symbol.for("litsx.hook")] = true;',
    ].join("\n");

    const result = transformLitsxSync(source, {
      filename: "/virtual/use-demo.js",
      jsxTemplate: false,
    });

    const markerMatches = result.code.match(/useDemo\[Symbol\.for\("litsx\.hook"\)\] = true;/g) || [];
    assert.strictEqual(markerMatches.length, 1);
    assert.match(result.code, /export function useDemo\(_host, input\)/);
    assert.doesNotMatch(result.code, /export function useDemo\(_host, _host, input\)/);
  }, 20000);

  it("recognizes useId from @litsx/core as a runtime hook inside imported custom hooks", () => {
    const hookSource = [
      'import { useId } from "@litsx/core";',
      "export function useDemoHook() {",
      "  const id = useId();",
      "  return id;",
      "}",
    ].join("\n");
    const consumerSource = [
      'import { useDemoHook } from "./demo-hook";',
      "export const DemoComponent = () => {",
      "  const id = useDemoHook();",
      "  return <div>{id}</div>;",
      "};",
    ].join("\n");

    const hookResult = transformLitsxSync(hookSource, {
      filename: "/virtual/demo-hook.tsx",
      jsxTemplate: false,
    });
    const consumerResult = transformLitsxSync(consumerSource, {
      filename: "/virtual/demo-component.litsx",
      jsxTemplate: false,
      inMemoryFiles: {
        "/virtual/demo-hook.tsx": hookSource,
      },
    });

    assert.match(hookResult.code, /export function useDemoHook\(_host\)/);
    assert.match(hookResult.code, /const id = useId\(_host\);/);
    assert.match(consumerResult.code, /const id = useDemoHook\(this\);/);
    assert.doesNotMatch(
      consumerResult.code,
      /Unable to resolve imported custom hook/
    );
  }, 20000);

  it("recognizes useContext from @litsx/core/context as a runtime hook inside imported custom hooks", () => {
    const hookSource = [
      'import { createContext, useContext } from "@litsx/core/context";',
      'export const ThemeContext = createContext("light");',
      "export function useThemeName() {",
      "  return useContext(ThemeContext);",
      "}",
    ].join("\n");
    const consumerSource = [
      'import { useThemeName } from "./theme-hook";',
      "export const DemoComponent = () => {",
      "  const theme = useThemeName();",
      "  return <div>{theme}</div>;",
      "};",
    ].join("\n");

    const hookResult = transformLitsxSync(hookSource, {
      filename: "/virtual/theme-hook.tsx",
      jsxTemplate: false,
    });
    const consumerResult = transformLitsxSync(consumerSource, {
      filename: "/virtual/demo-component.litsx",
      jsxTemplate: false,
      inMemoryFiles: {
        "/virtual/theme-hook.tsx": hookSource,
      },
    });

    assert.match(hookResult.code, /import \{ createContext, useContext \} from "@litsx\/core\/context";/);
    assert.doesNotMatch(hookResult.code, /import \{[^}]*useContext[^}]*\} from "@litsx\/core";/);
    assert.match(hookResult.code, /export function useThemeName\(_host\)/);
    assert.match(hookResult.code, /return useContext\(_host, ThemeContext\);/);
    assert.match(consumerResult.code, /const theme = useThemeName\(this\);/);
  }, 20000);

  it("threads host through imported custom hooks re-exported from barrels", () => {
    const hookSource = [
      'import { useMemoValue, useStableId } from "@litsx/core";',
      "export function useDemo(input: string) {",
      "  const id = useStableId();",
      "  return useMemoValue(() => `${input}:${id}`, [input, id]);",
      "}",
    ].join("\n");
    const barrelSource = 'export * from "./use-demo";';
    const consumerSource = [
      'import { useDemo } from "./hooks";',
      "export const DemoConsumer = () => {",
      '  const value = useDemo("x");',
      "  return <div>{value}</div>;",
      "};",
    ].join("\n");

    const result = transformLitsxSync(consumerSource, {
      filename: "/virtual/demo-consumer.litsx",
      jsxTemplate: false,
      inMemoryFiles: {
        "/virtual/hooks/index.ts": barrelSource,
        "/virtual/hooks/use-demo.ts": hookSource,
      },
    });

    assert.match(result.code, /prepareEffects\(this\);/);
    assert.match(result.code, /const value = useDemo\(this, "x"\);/);
  }, 20000);

  it("recognizes precompiled structural custom hooks from published metadata", () => {
    const hookSource = [
      'import { defineHook } from "@litsx/core";',
      "const useLocale = defineHook({",
      "  use(_host, _state, args) {",
      "    return args[0];",
      "  },",
      "});",
      "export function useMessage() {",
      "  return useLocale('en');",
      "}",
    ].join("\n");
    const compiledHookResult = transformLitsxSync(hookSource, {
      filename: "/virtual/use-message.tsx",
      jsxTemplate: false,
    });
    const consumerSource = [
      'import { useMessage } from "./use-message.js";',
      "export function Greeting() {",
      "  const locale = useMessage();",
      "  return <div>{locale}</div>;",
      "}",
    ].join("\n");

    const consumerResult = transformLitsxSync(consumerSource, {
      filename: "/virtual/greeting.litsx",
      jsxTemplate: false,
      inMemoryFiles: {
        "/virtual/use-message.js": compiledHookResult.code,
      },
    });

    assert.match(compiledHookResult.code, /useMessage\[Symbol\.for\("litsx\.structuralHookEntries"\)\] = \[/);
    assert.match(compiledHookResult.code, /useMessage\[Symbol\.for\("litsx\.hook"\)\] = true;/);
    assert.match(consumerResult.code, /extends HostMiddlewareMixin\(LitElement\)/);
    assert.match(consumerResult.code, /static structuralEntries = \[\s*\.\.\.\(useMessage\[Symbol\.for\("litsx\.structuralHookEntries"\)\] \|\| \[\]\)/);
    assert.match(consumerResult.code, /const locale = useMessage\(this\);/);
  }, 20000);

  it("recognizes precompiled structural custom hooks through namespace imports", () => {
    const hookSource = [
      'import { defineHook } from "@litsx/core";',
      "const useLocale = defineHook({",
      "  use(_host, _state, args) {",
      "    return args[0];",
      "  },",
      "});",
      "export function useMessage() {",
      "  return useLocale('en');",
      "}",
    ].join("\n");
    const compiledHookResult = transformLitsxSync(hookSource, {
      filename: "/virtual/use-message.tsx",
      jsxTemplate: false,
    });
    const consumerSource = [
      'import * as MessageHooks from "./use-message.js";',
      "export function Greeting() {",
      "  const locale = MessageHooks.useMessage();",
      "  return <div>{locale}</div>;",
      "}",
    ].join("\n");

    const consumerResult = transformLitsxSync(consumerSource, {
      filename: "/virtual/greeting.litsx",
      jsxTemplate: false,
      inMemoryFiles: {
        "/virtual/use-message.js": compiledHookResult.code,
      },
    });

    assert.match(consumerResult.code, /static structuralEntries = \[\s*\.\.\.\(MessageHooks\.useMessage\[Symbol\.for\("litsx\.structuralHookEntries"\)\] \|\| \[\]\)/);
    assert.match(consumerResult.code, /const locale = MessageHooks\.useMessage\(this\);/);
  }, 20000);

  it("does not reprocess component classes already marked as compiled", () => {
    const source = [
      'import { LitElement } from "lit";',
      "export class DemoComponent extends LitElement {",
      '  static [Symbol.for("litsx.component")] = true;',
      '  static [Symbol.for("litsx.hostTypeId")] = "litsx-host-type-demo";',
      "  render() {",
      "    return <div>demo</div>;",
      "  }",
      "}",
    ].join("\n");

    const result = transformLitsxSync(source, {
      filename: "/virtual/demo-component.js",
      jsxTemplate: false,
    });

    const markerMatches = result.code.match(/static \[Symbol\.for\("litsx\.component"\)\] = true;/g) || [];
    assert.strictEqual(markerMatches.length, 1);
    assert.match(result.code, /class DemoComponent extends LitElement/);
    assert.doesNotMatch(result.code, /extends HostMiddlewareMixin\(LitElement\)/);
  }, 20000);

  it("does not reprocess compiled structural component classes", () => {
    const source = [
      'import { HostMiddlewareMixin } from "@litsx/core";',
      'import { LitElement } from "lit";',
      "export class DemoComponent extends HostMiddlewareMixin(LitElement) {",
      '  static [Symbol.for("litsx.component")] = true;',
      '  static [Symbol.for("litsx.hostTypeId")] = "litsx-host-type-demo";',
      "  static structuralEntries = [];",
      "  render() {",
      "    return <div>demo</div>;",
      "  }",
      "}",
    ].join("\n");

    const result = transformLitsxSync(source, {
      filename: "/virtual/demo-component.js",
      jsxTemplate: false,
    });

    assert.strictEqual((result.code.match(/static \[Symbol\.for\("litsx\.component"\)\] = true;/g) || []).length, 1);
    assert.strictEqual((result.code.match(/static structuralEntries = \[];/g) || []).length, 1);
    assert.strictEqual((result.code.match(/HostMiddlewareMixin\(LitElement\)/g) || []).length, 1);
  }, 20000);

  it("threads host through local custom hooks that wrap imported runtime custom hooks", () => {
    const hookSource = [
      'import { useMemoValue, useStableId } from "@litsx/core";',
      "export function useDemo(input: string) {",
      "  const id = useStableId();",
      "  return useMemoValue(() => `${input}:${id}`, [input, id]);",
      "}",
    ].join("\n");
    const consumerSource = [
      'import { useDemo } from "./use-demo";',
      "function useWrappedDemo(input: string) {",
      "  return useDemo(input);",
      "}",
      "export const DemoConsumer = () => {",
      '  const value = useWrappedDemo("x");',
      "  return <div>{value}</div>;",
      "};",
    ].join("\n");

    const result = transformLitsxSync(consumerSource, {
      filename: "/virtual/demo-consumer.litsx",
      jsxTemplate: false,
      inMemoryFiles: {
        "/virtual/use-demo.ts": hookSource,
      },
    });

    assert.match(result.code, /function useWrappedDemo\(_host, input\)/);
    assert.match(result.code, /return useDemo\(_host, input\);/);
    assert.match(result.code, /const value = useWrappedDemo\(this, "x"\);/);
  }, 20000);

  it("throws when an imported custom hook call cannot be resolved for host analysis", () => {
    const source = [
      'import { useDemo } from "./missing";',
      "export const DemoConsumer = () => {",
      '  const value = useDemo("x");',
      "  return <div>{value}</div>;",
      "};",
    ].join("\n");

    assert.throws(
      () => transformLitsxSync(source, {
        filename: "/virtual/demo-consumer.litsx",
        jsxTemplate: false,
      }),
      /Unable to resolve imported custom hook "useDemo" from "\.\/missing"/,
    );
  }, 20000);

  it("does not thread host through imported use-prefixed functions without LitSX runtime hooks", () => {
    const utilSource = [
      "export function useFormat(input: string) {",
      "  return input.toUpperCase();",
      "}",
    ].join("\n");
    const consumerSource = [
      'import { useFormat } from "./format";',
      "export const DemoConsumer = () => {",
      '  const value = useFormat("x");',
      "  return <div>{value}</div>;",
      "};",
    ].join("\n");

    const result = transformLitsxSync(consumerSource, {
      filename: "/virtual/demo-consumer.litsx",
      jsxTemplate: false,
      inMemoryFiles: {
        "/virtual/format.ts": utilSource,
      },
    });

    assert.match(result.code, /const value = useFormat\("x"\);/);
    assert.doesNotMatch(result.code, /useFormat\(this, "x"\)/);
  }, 20000);

  it("does not thread host through local use-prefixed functions without LitSX runtime hooks", () => {
    const source = [
      "function useFormat(input: string) {",
      "  return input.toUpperCase();",
      "}",
      "export const DemoConsumer = () => {",
      '  const value = useFormat("x");',
      "  return <div>{value}</div>;",
      "};",
    ].join("\n");

    const result = transformLitsxSync(source, {
      filename: "/virtual/demo-consumer.litsx",
      jsxTemplate: false,
    });

    assert.match(result.code, /function useFormat\(input\)/);
    assert.match(result.code, /const value = useFormat\("x"\);/);
    assert.doesNotMatch(result.code, /useFormat\(this, "x"\)/);
    assert.doesNotMatch(result.code, /prepareEffects\(this\);/);
  }, 20000);

  it("keeps imported hook analysis isolated from imported renderer helper analysis", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "litsx-hook-renderer-cache-"));

    try {
      const rootHookFile = path.join(tempDir, "hook-consumer.litsx");
      const rootRendererFile = path.join(tempDir, "renderer-consumer.litsx");
      const helperFile = path.join(tempDir, "helpers.tsx");
      const buttonFile = path.join(tempDir, "litsx-button.litsx");

      fs.writeFileSync(
        helperFile,
        [
          'import { useMemoValue } from "@litsx/core";',
          'import { LitsxButton } from "./litsx-button.litsx";',
          "export function useDemo(input: string) {",
          "  return useMemoValue(() => input, [input]);",
          "}",
          "export function renderHeader() {",
          "  return <LitsxButton label='Save' />;",
          "}",
        ].join("\n")
      );

      fs.writeFileSync(
        buttonFile,
        [
          "export const LitsxButton = ({ label = '' }) => {",
          "  return <button>{label}</button>;",
          "};",
        ].join("\n")
      );

      const session = createLitsxCompilationSession();
      const hookConsumer = [
        'import { useDemo } from "./helpers";',
        "export const HookConsumer = () => {",
        '  const value = useDemo("x");',
        "  return <div>{value}</div>;",
        "};",
      ].join("\n");
      const rendererConsumer = [
        'import { renderHeader } from "./helpers";',
        "export const RendererConsumer = () => {",
        "  return <guide-card .header={renderHeader} />;",
        "};",
      ].join("\n");

      const hookResult = session.transformSync(hookConsumer, {
        filename: rootHookFile,
        jsxTemplate: false,
      });
      const rendererResult = session.transformSync(rendererConsumer, {
        filename: rootRendererFile,
        jsxTemplate: false,
      });

      assert.match(hookResult.code, /const value = useDemo\(this, "x"\);/);
      assert.match(rendererResult.code, /\.header=\{bindRendererContext\(typeof this === "undefined" \? null : this,\s*renderHeader,\s*\{\s*projected: true\s*\}\)\}/);
      assert.match(rendererResult.code, /static elements\s*=\s*\{[\s\S]*"litsx-button": (?:LitsxButton|__litsxImportedLitsxButton1)[\s\S]*\}/);
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  }, 20000);

  it("strips top-level TypeScript declarations from compiled .litsx output", () => {
    const source = [
      "interface ButtonProps {",
      "  label?: string;",
      "}",
      "type ButtonVariant = \"primary\" | \"secondary\";",
      "const buttonDefaults = { variant: \"primary\" } as const;",
      "export const Counter = ({ label = buttonDefaults.variant }: ButtonProps) => {",
      "  const values = [label] as string[];",
      "  return <button>{values[0]}</button>;",
      "};",
    ].join("\n");

    const result = transformLitsxSync(source, {
      filename: "/virtual/Counter.litsx",
    });

    assert.match(result.code, /html`/);
    assert.doesNotMatch(result.code, /interface ButtonProps/);
    assert.doesNotMatch(result.code, /type ButtonVariant/);
    assert.doesNotMatch(result.code, / as const/);
    assert.doesNotMatch(result.code, / as string\[\]/);
  }, 20000);

  it("strips TypeScript syntax from jsxTemplate=false output", () => {
    const source = [
      "type CounterProps = {",
      "  label: string;",
      "};",
      "export const Counter = ({ label }: CounterProps) => {",
      "  return <button>{label}</button>;",
      "};",
    ].join("\n");

    const result = transformLitsxSync(source, {
      filename: "/virtual/Counter.litsx",
      jsxTemplate: false,
    });

    assert.match(result.code, /class Counter extends LitElement/);
    assert.doesNotMatch(result.code, /type CounterProps/);
    assert.doesNotMatch(result.code, /label: string/);
  }, 20000);

  it("strips generic TypeScript syntax from compiled .litsx output", () => {
    const source = [
      "function identity<T>(value: T): T {",
      "  return value;",
      "}",
      "export const Counter = () => {",
      "  const label = identity<string>(\"Save\");",
      "  return <button>{label}</button>;",
      "};",
    ].join("\n");

    const result = transformLitsxSync(source, {
      filename: "/virtual/Counter.litsx",
    });

    assert.match(result.code, /html`/);
    assert.doesNotMatch(result.code, /<T>/);
    assert.doesNotMatch(result.code, /: T\b/);
    assert.doesNotMatch(result.code, /identity<string>/);
    assert.match(result.code, /identity\("Save"\)/);
  }, 20000);

  it("lowers direct children expressions to slots for implicit projection", () => {
    const source = [
      "export function Frame({ children }) {",
      "  return <section>{children}</section>;",
      "}",
      "export function Shell(props) {",
      "  return <Frame>{props.children}</Frame>;",
      "}",
      "export function Demo() {",
      "  return <Shell><p>Alpha</p></Shell>;",
      "}",
    ].join("\n");

    const result = transformLitsxSync(source, {
      filename: "/virtual/Children.litsx",
    });

    assert.match(result.code, /return html`<section><slot><\/slot><\/section>`;/);
    assert.match(result.code, /return html`<frame><slot><\/slot><\/frame>`;/);
    assert.match(result.code, /return html`<shell><p>Alpha<\/p><\/shell>`;/);
  }, 20000);

  it("compiles root fragments as component render output", () => {
    const source = [
      "export const Panel = ({ title }) => {",
      "  return <>",
      "    <h1>{title}</h1>",
      "    <p>Ready</p>",
      "  </>;",
      "};",
    ].join("\n");

    const result = transformLitsxSync(source, {
      filename: "/virtual/Panel.litsx",
    });

    assert.match(result.code, /class Panel extends LitElement/);
    assert.match(result.code, /return html`<h1>\$\{this\.title\}<\/h1><p>Ready<\/p>`;/);
  }, 20000);

  it("lowers authored JSX inside suspense content renderers", () => {
    const source = [
      'import { SuspenseBoundary } from "@litsx/core";',
      'import { GuideCard } from "./guide-card.litsx";',
      "export const Demo = () => {",
      "  return (",
      "    <SuspenseBoundary",
      "      fallback={null}",
      '    >',
      '      <GuideCard .eyebrow={"x"} .titleRenderer={() => "y"} .contentRenderer={() => <p>z</p>} />',
      "    </SuspenseBoundary>",
      "  );",
      "};",
    ].join("\n");

    const result = transformLitsxSync(source, {
      filename: "/virtual/Demo.litsx",
      jsxTemplate: false,
    });

    assert.doesNotMatch(result.code, /<GuideCard/);
    assert.match(result.code, /<guide-card/);
    assert.match(result.code, /"guide-card": GuideCard/);
    assert.match(result.code, /bindRendererContext/);
    assert.doesNotMatch(result.code, /\.titleRenderer=\{bindRendererContext\(typeof this === "undefined" \? null : this,\s*\(\) => "y"\)\}/);
    assert.doesNotMatch(result.code, /\.contentRenderer=\{bindRendererContext\(typeof this === "undefined" \? null : this,\s*\(\) => <p>z<\/p>\)\}/);
    assert.match(result.code, /\.content=\{bindRendererContext\(typeof this === "undefined" \? null : this,\s*\(\) => <guide-card[\s\S]*\/>,\s*\{\s*projected: true\s*\}\)\}/);
  }, 20000);

  it("binds only function props whose returned JSX needs component context", () => {
    const source = [
      'import { SuspenseBoundary } from "@litsx/core";',
      'import { GuideCard } from "./guide-card.litsx";',
      "const renderHeader = () => <p>plain</p>;",
      "const renderPanel = () => <fancy-panel />;",
      "export const Demo = () => {",
      "  return (",
      "    <>",
      '      <SuspenseBoundary .content={renderHeader} />',
      '      <guide-card .header={renderPanel} />',
      '      <GuideCard .title={renderHeader} />',
      '      <button .onclick={renderHeader}></button>',
      "    </>",
      "  );",
      "};",
    ].join("\n");

    const result = transformLitsxSync(source, {
      filename: "/virtual/Demo.litsx",
      jsxTemplate: false,
    });

    assert.doesNotMatch(result.code, /\.content=\{bindRendererContext\(typeof this === "undefined" \? null : this,\s*renderHeader\)\}/);
    assert.match(result.code, /\.header=\{bindRendererContext\(typeof this === "undefined" \? null : this,\s*renderPanel,\s*\{\s*projected: true\s*\}\)\}/);
    assert.doesNotMatch(result.code, /\.title=\{bindRendererContext\(typeof this === "undefined" \? null : this,\s*renderHeader\)\}/);
    assert.doesNotMatch(result.code, /\.onclick=\{bindRendererContext\(/);
  }, 20000);

  it("binds local helper references only when they transitively return component JSX", () => {
    const source = [
      "import { GuideCard } from './guide-card.litsx';",
      "const renderPlain = () => <p>plain</p>;",
      "const renderCard = () => <GuideCard />;",
      "const wrapPlain = () => renderPlain();",
      "const wrapCard = () => renderCard();",
      "export const Demo = () => {",
      "  return (",
      "    <guide-card",
      "      .plain={wrapPlain}",
      "      .card={wrapCard}",
      "    />",
      "  );",
      "};",
    ].join("\n");

    const result = transformLitsxSync(source, {
      filename: "/virtual/Demo.litsx",
      jsxTemplate: false,
    });

    assert.doesNotMatch(result.code, /\.plain=\{bindRendererContext\(/);
    assert.match(result.code, /\.card=\{bindRendererContext\(typeof this === "undefined" \? null : this,\s*wrapCard,\s*\{\s*projected: true\s*\}\)\}/);
  }, 20000);

  it("binds imported helper references when they transitively return component JSX from another file", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "litsx-imported-renderer-"));

    try {
      const rootFile = path.join(tempDir, "demo.litsx");
      const helperFile = path.join(tempDir, "renderers.js");
      const buttonFile = path.join(tempDir, "litsx-button.litsx");

      fs.writeFileSync(
        helperFile,
        [
          "import { LitsxButton } from './litsx-button.litsx';",
          "export function renderHeader() {",
          "  return <LitsxButton label='Save' />;",
          "}",
        ].join("\n")
      );

      fs.writeFileSync(
        buttonFile,
        [
          "export const LitsxButton = ({ label = '' }) => {",
          "  return <button>{label}</button>;",
          "};",
        ].join("\n")
      );

      const source = [
        "import { renderHeader } from './renderers.js';",
        "export const Demo = () => {",
        "  return <guide-card .header={renderHeader} />;",
        "};",
      ].join("\n");

      const result = transformLitsxSync(source, {
        filename: rootFile,
        jsxTemplate: false,
      });

      assert.match(result.code, /import \{ renderHeader \} from ['"]\.\/renderers\.js['"]/);
      assert.match(result.code, /import \{ LitsxButton(?: as __litsxImportedLitsxButton1)? \} from ['"]\.\/litsx-button\.litsx['"]/);
      assert.match(result.code, /\.header=\{bindRendererContext\(typeof this === "undefined" \? null : this,\s*renderHeader,\s*\{\s*projected: true\s*\}\)\}/);
      assert.match(result.code, /static elements\s*=\s*\{[\s\S]*"litsx-button": (?:LitsxButton|__litsxImportedLitsxButton1)[\s\S]*\}/);
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  }, 20000);

  it("follows imported helper chains across multiple files for renderer analysis", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "litsx-imported-renderer-chain-"));

    try {
      const rootFile = path.join(tempDir, "demo.litsx");
      const middleFile = path.join(tempDir, "renderers.js");
      const leafFile = path.join(tempDir, "deep-renderers.js");
      const buttonFile = path.join(tempDir, "litsx-button.litsx");

      fs.writeFileSync(
        middleFile,
        [
          "import { wrapHeader } from './deep-renderers.js';",
          "export { wrapHeader };",
        ].join("\n")
      );

      fs.writeFileSync(
        leafFile,
        [
          "import { LitsxButton } from './litsx-button.litsx';",
          "export const wrapHeader = () => renderHeader();",
          "function renderHeader() {",
          "  return <LitsxButton label='Chain' />;",
          "}",
        ].join("\n")
      );

      fs.writeFileSync(
        buttonFile,
        [
          "export const LitsxButton = ({ label = '' }) => {",
          "  return <button>{label}</button>;",
          "};",
        ].join("\n")
      );

      const source = [
        "import { wrapHeader } from './renderers.js';",
        "export const Demo = () => {",
        "  return <guide-card .header={wrapHeader} />;",
        "};",
      ].join("\n");

      const result = transformLitsxSync(source, {
        filename: rootFile,
        jsxTemplate: false,
      });

      assert.match(result.code, /\.header=\{bindRendererContext\(typeof this === "undefined" \? null : this,\s*wrapHeader,\s*\{\s*projected: true\s*\}\)\}/);
      assert.match(result.code, /import \{ LitsxButton(?: as __litsxImportedLitsxButton1)? \} from ['"]\.\/litsx-button\.litsx['"]/);
      assert.match(result.code, /static elements\s*=\s*\{[\s\S]*"litsx-button": (?:LitsxButton|__litsxImportedLitsxButton1)[\s\S]*\}/);
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  }, 20000);

  it("preserves bare package specifiers when imported helpers render package components", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "litsx-imported-renderer-node-modules-"));

    try {
      const rootFile = path.join(tempDir, "demo.litsx");
      const helperFile = path.join(tempDir, "renderers.js");
      const packageDir = path.join(tempDir, "node_modules", "@acme", "ui");

      fs.mkdirSync(packageDir, { recursive: true });
      fs.writeFileSync(
        path.join(packageDir, "package.json"),
        JSON.stringify({
          name: "@acme/ui",
          type: "module",
          exports: "./index.js",
        }, null, 2)
      );
      fs.writeFileSync(
        path.join(packageDir, "index.js"),
        [
          "export const FancyButton = ({ label = '' }) => {",
          "  return <button>{label}</button>;",
          "};",
        ].join("\n")
      );
      fs.writeFileSync(
        helperFile,
        [
          "import { FancyButton } from '@acme/ui';",
          "export function renderHeader() {",
          "  return <FancyButton label='Pkg' />;",
          "}",
        ].join("\n")
      );

      const source = [
        "import { renderHeader } from './renderers.js';",
        "export const Demo = () => {",
        "  return <guide-card .header={renderHeader} />;",
        "};",
      ].join("\n");

      const result = transformLitsxSync(source, {
        filename: rootFile,
        jsxTemplate: false,
      });

      assert.match(result.code, /import \{ FancyButton(?: as __litsxImportedFancyButton1)? \} from ['"]@acme\/ui['"]/);
      assert.match(result.code, /\.header=\{bindRendererContext\(typeof this === "undefined" \? null : this,\s*renderHeader,\s*\{\s*projected: true\s*\}\)\}/);
      assert.match(result.code, /static elements\s*=\s*\{[\s\S]*"fancy-button": (?:FancyButton|__litsxImportedFancyButton1)[\s\S]*\}/);
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  }, 20000);

  it("resolves alias specifiers for imported renderer helpers and preserves the alias import", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "litsx-imported-renderer-alias-"));

    try {
      const srcDir = path.join(tempDir, "src");
      const componentsDir = path.join(srcDir, "components");
      fs.mkdirSync(componentsDir, { recursive: true });

      const rootFile = path.join(srcDir, "demo.litsx");
      const helperFile = path.join(srcDir, "renderers.js");
      const buttonFile = path.join(componentsDir, "litsx-button.litsx");
      const tsconfigFile = path.join(tempDir, "tsconfig.json");

      fs.writeFileSync(
        tsconfigFile,
        JSON.stringify({
          compilerOptions: {
            target: "ESNext",
            module: "ESNext",
            moduleResolution: "Bundler",
            jsx: "preserve",
            allowJs: true,
            baseUrl: ".",
            paths: {
              "@/*": ["src/*"],
            },
          },
          include: ["src/**/*"],
        }, null, 2)
      );

      fs.writeFileSync(
        helperFile,
        [
          "import { LitsxButton } from '@/components/litsx-button.litsx';",
          "export const renderHeader = () => <LitsxButton label='Alias' />;",
        ].join("\n")
      );

      fs.writeFileSync(
        buttonFile,
        [
          "export const LitsxButton = ({ label = '' }) => {",
          "  return <button>{label}</button>;",
          "};",
        ].join("\n")
      );

      const session = createLitsxCompilationSession({
        projectPath: tsconfigFile,
      });

      const source = [
        "import { renderHeader } from './renderers.js';",
        "export const Demo = () => {",
        "  return <guide-card .header={renderHeader} />;",
        "};",
      ].join("\n");

      const result = session.transformSync(source, {
        filename: rootFile,
        jsxTemplate: false,
      });

      assert.match(result.code, /import \{ LitsxButton(?: as __litsxImportedLitsxButton1)? \} from ['"]@\/components\/litsx-button\.litsx['"]/);
      assert.match(result.code, /\.header=\{bindRendererContext\(typeof this === "undefined" \? null : this,\s*renderHeader,\s*\{\s*projected: true\s*\}\)\}/);
      assert.match(result.code, /static elements\s*=\s*\{[\s\S]*"litsx-button": (?:LitsxButton|__litsxImportedLitsxButton1)[\s\S]*\}/);

      session.dispose();
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  }, 20000);

  it("does not include unrelated top-level helpers in static elements collection", () => {
    const source = [
      "import { GuideCard } from './guide-card.litsx';",
      "import { LitsxButton } from './litsx-button.litsx';",
      "function unusedHelper() {",
      "  return <LitsxButton type=\"secondary\" label=\"unused\" />;",
      "}",
      "export function Demo() {",
      "  return <GuideCard />;",
      "}",
    ].join("\n");

    const result = transformLitsxSync(source, {
      filename: "/virtual/Demo.litsx",
      jsxTemplate: false,
    });

    assert.match(result.code, /static elements\s*=\s*\{[\s\S]*"guide-card": GuideCard[\s\S]*\}/);
    assert.doesNotMatch(result.code, /"litsx-button": LitsxButton/);
  }, 20000);

  it("fails compilation when PascalCase JSX does not resolve to an import or local declaration", () => {
    assert.throws(() => {
      transformLitsxSync(
        [
          "export function Demo() {",
          "  return <MissingThing />;",
          "}",
        ].join("\n"),
        {
          filename: "/virtual/Demo.litsx",
        }
      );
    }, /Unknown LitSX component "MissingThing"/);
  }, 20000);

  it("materializes zero-arg inline render thunks in child position", () => {
    const source = [
      "export function Demo() {",
      "  return <section>{() => <fancy-panel />}</section>;",
      "}",
    ].join("\n");

    const result = transformLitsxSync(source, {
      filename: "/virtual/Demo.litsx",
    });

    assert.match(result.code, /return html`<section>\$\{\(\(\) => html`<fancy-panel><\/fancy-panel>`\)\(\)\}<\/section>`;/);
  }, 20000);

  it("materializes zero-arg inline wrappers around local render helpers in child position", () => {
    const source = [
      "export function Demo() {",
      "  const fn = () => <fancy-panel />;",
      "  return <section>{() => fn()}</section>;",
      "}",
    ].join("\n");

    const result = transformLitsxSync(source, {
      filename: "/virtual/Demo.litsx",
    });

    assert.match(result.code, /fn\(\) \{\s*return html`<fancy-panel><\/fancy-panel>`;\s*\}/);
    assert.match(result.code, /return html`<section>\$\{\(\(\) => this\.fn\(\)\)\(\)\}<\/section>`;/);
  }, 20000);

  it("keeps direct local render helper calls working in child position, including arguments", () => {
    const source = [
      "export function Demo() {",
      "  const one = () => <fancy-panel />;",
      "  const many = (a, b, c) => <fancy-panel data-a={a} data-b={b} data-c={c} />;",
      "  return <section>{one()}{many(1, 2, 3)}</section>;",
      "}",
    ].join("\n");

    const result = transformLitsxSync(source, {
      filename: "/virtual/Demo.litsx",
    });

    assert.match(result.code, /one\(\) \{\s*return html`<fancy-panel><\/fancy-panel>`;\s*\}/);
    assert.match(result.code, /many\(a, b, c\) \{\s*return html`<fancy-panel data-a="\$\{a\}" data-b="\$\{b\}" data-c="\$\{c\}"><\/fancy-panel>`;\s*\}/);
    assert.match(result.code, /return html`<section>\$\{this\.one\(\)\}\$\{this\.many\(1, 2, 3\)\}<\/section>`;/);
  }, 20000);

  it("lowers capitalized JSX in lowercase helpers to equivalent html tags", () => {
    const source = [
      "import { LitsxButton } from './litsx-button.litsx';",
      "function renderButtonHeader() {",
      "  return <LitsxButton type=\"secondary\" label=\"Renderer returns component\" />;",
      "}",
      "export function Demo() {",
      "  return <section>{renderButtonHeader()}</section>;",
      "}",
    ].join("\n");

    const result = transformLitsxSync(source, {
      filename: "/virtual/Demo.litsx",
    });

    assert.match(result.code, /function renderButtonHeader\(\) \{\s*return html`<litsx-button type="secondary" label="Renderer returns component"><\/litsx-button>`;\s*\}/);
    assert.doesNotMatch(result.code, /html`\$\{LitsxButton\(/);
  }, 20000);

  it("lowers capitalized JSX in lowercase const helpers to equivalent html tags", () => {
    const source = [
      "import { LitsxButton } from './litsx-button.litsx';",
      "const renderButtonHeader = () => {",
      "  return <LitsxButton type=\"secondary\" label=\"Renderer returns component\" />;",
      "};",
      "export function Demo() {",
      "  return <section>{renderButtonHeader()}</section>;",
      "}",
    ].join("\n");

    const result = transformLitsxSync(source, {
      filename: "/virtual/Demo.litsx",
    });

    assert.match(result.code, /const renderButtonHeader = \(\) => \{\s*return html`<litsx-button type="secondary" label="Renderer returns component"><\/litsx-button>`;\s*\};/);
    assert.doesNotMatch(result.code, /html`\$\{LitsxButton\(/);
  }, 20000);

  it("materializes zero-arg inline thunks that return capitalized component JSX as equivalent html tags", () => {
    const source = [
      "import { LitsxButton } from './litsx-button.litsx';",
      "export function Demo() {",
      "  return <section>{() => <LitsxButton type=\"primary\" label=\"Inline thunk child\" />}</section>;",
      "}",
    ].join("\n");

    const result = transformLitsxSync(source, {
      filename: "/virtual/Demo.litsx",
    });

    assert.match(result.code, /return html`<section>\$\{\(\(\) => html`<litsx-button type="primary" label="Inline thunk child"><\/litsx-button>`\)\(\)\}<\/section>`;/);
  }, 20000);

  it("rewrites prop-backed renderer calls in JSX to renderRendererCall", () => {
    const source = [
      "export function Demo({ thunk }) {",
      "  return <section>{thunk('alpha')}</section>;",
      "}",
    ].join("\n");

    const result = transformLitsxSync(source, {
      filename: "/virtual/Demo.litsx",
      jsxTemplate: false,
    });

    assert.match(result.code, /import \{ renderRendererCall \} from "@litsx\/core\/rendering";/);
    assert.match(result.code, /return <section>\{renderRendererCall\(this\.thunk, 'alpha'\)\}<\/section>;/);
  }, 20000);

  it("binds renderer props that accept host-provided args and return component JSX", () => {
    const source = [
      "import { LitsxButton } from './litsx-button.litsx';",
      "export function ProbeHost({ itemRenderer }) {",
      "  return <section>{itemRenderer('alpha')}</section>;",
      "}",
      "export function Demo() {",
      "  return <ProbeHost .itemRenderer={(label) => <LitsxButton type=\"primary\" label={label} />} />;",
      "}",
    ].join("\n");

    const result = transformLitsxSync(source, {
      filename: "/virtual/Demo.litsx",
    });

    assert.match(result.code, /\.itemRenderer=\$\{bindRendererContext\(typeof this === "undefined" \? null : this,\s*label => html`<litsx-button type="primary" label="\$\{label\}"><\/litsx-button>`,\s*\{\s*projected: true\s*\}\)\}/);
    assert.match(result.code, /return html`<section>\$\{renderRendererCall\(this\.itemRenderer, 'alpha'\)\}<\/section>`;/);
    assert.match(result.code, /"litsx-button": LitsxButton/);
  }, 20000);

  it("binds transitive renderer helpers that return component JSX through wrapper functions", () => {
    const source = [
      "import { LitsxButton } from './litsx-button.litsx';",
      "function renderHeader() {",
      "  return <LitsxButton type=\"secondary\" label=\"Projected\" />;",
      "}",
      "function wrapHeader() {",
      "  return renderHeader();",
      "}",
      "export function Card({ header }) {",
      "  return <section>{header()}</section>;",
      "}",
      "export function Demo() {",
      "  return <Card .header={wrapHeader} />;",
      "}",
    ].join("\n");

    const result = transformLitsxSync(source, {
      filename: "/virtual/Demo.litsx",
    });

    assert.match(result.code, /function renderHeader\(\) \{\s*return html`<litsx-button type="secondary" label="Projected"><\/litsx-button>`;\s*\}/);
    assert.match(result.code, /\.header=\$\{bindRendererContext\(typeof this === "undefined" \? null : this,\s*wrapHeader,\s*\{\s*projected: true\s*\}\)\}/);
    assert.match(result.code, /return html`<section>\$\{renderRendererCall\(this\.header\)\}<\/section>`;/);
    assert.match(result.code, /"litsx-button": LitsxButton/);
  }, 20000);

  it("wraps stored local JSX values passed to renderer props", () => {
    const source = [
      "export function Card({ header }) {",
      "  return <section>{header()}</section>;",
      "}",
      "export function Demo() {",
      "  const header = <button @click={save}>Stored</button>;",
      "  return <Card .header={header} />;",
      "}",
    ].join("\n");

    const result = transformLitsxSync(source, {
      filename: "/virtual/Demo.litsx",
    });

    assert.match(result.code, /const header = html`<button @click=\$\{save\}>Stored<\/button>`;/);
    assert.match(result.code, /\.header=\$\{\(\) => header\}/);
    assert.match(result.code, /return html`<section>\$\{renderRendererCall\(this\.header\)\}<\/section>`;/);
  }, 20000);

  it("wraps stored branching JSX values passed to renderer props and preserves projected context", () => {
    const source = [
      "import { LitsxButton } from './litsx-button.litsx';",
      "export function Card({ header }) {",
      "  return <section>{header()}</section>;",
      "}",
      "export function Demo({ active }) {",
      "  const header = active ? <LitsxButton type=\"secondary\" label=\"Stored\" /> : <span>Idle</span>;",
      "  return <Card .header={header} />;",
      "}",
    ].join("\n");

    const result = transformLitsxSync(source, {
      filename: "/virtual/Demo.litsx",
    });

    assert.match(result.code, /const header = this\.active \? html`<litsx-button type="secondary" label="Stored"><\/litsx-button>` : html`<span>Idle<\/span>`;/);
    assert.match(result.code, /\.header=\$\{bindRendererContext\(typeof this === "undefined" \? null : this,\s*\(\) => header,\s*\{\s*projected: true\s*\}\)\}/);
    assert.match(result.code, /return html`<section>\$\{renderRendererCall\(this\.header\)\}<\/section>`;/);
    assert.match(result.code, /"litsx-button": LitsxButton/);
  }, 20000);

  it("wraps direct JSX values passed to renderer props", () => {
    const source = [
      "export function Card({ header }) {",
      "  return <section>{header()}</section>;",
      "}",
      "export function Demo() {",
      "  return <Card .header={<button @click={save}>Inline</button>} />;",
      "}",
    ].join("\n");

    const result = transformLitsxSync(source, {
      filename: "/virtual/Demo.litsx",
    });

    assert.match(result.code, /\.header=\$\{\(\) => html`<button @click=\$\{save\}>Inline<\/button>`\}/);
    assert.match(result.code, /return html`<section>\$\{renderRendererCall\(this\.header\)\}<\/section>`;/);
  }, 20000);

  it("keeps renderer projection working in light DOM components", () => {
    const source = [
      "export function Card({ header }) {",
      "  static lightDom = true;",
      "  return <section>{header()}</section>;",
      "}",
      "export function Demo() {",
      "  return <Card .header={() => <fancy-panel />} />;",
      "}",
    ].join("\n");

    const result = transformLitsxSync(source, {
      filename: "/virtual/Demo.litsx",
    });

    assert.match(result.code, /class Card extends LightDomMixin\(LitElement\)/);
    assert.match(result.code, /\.header=\$\{bindRendererContext\(typeof this === "undefined" \? null : this,\s*\(\) => html`<fancy-panel><\/fancy-panel>`,\s*\{\s*projected: true\s*\}\)\}/);
    assert.match(result.code, /return html`<section>\$\{renderRendererCall\(this\.header\)\}<\/section>`;/);
  }, 20000);

  it("keeps renderer context through multiple container components", () => {
    const source = [
      "import { LitsxButton } from './litsx-button.litsx';",
      "export function Card({ header }) {",
      "  return <section>{header()}</section>;",
      "}",
      "export function Middle({ header }) {",
      "  return <Card .header={header} />;",
      "}",
      "function renderHeader() {",
      "  return <LitsxButton type=\"secondary\" label=\"Deep\" />;",
      "}",
      "export function Outer() {",
      "  return <Middle .header={renderHeader} />;",
      "}",
    ].join("\n");

    const result = transformLitsxSync(source, {
      filename: "/virtual/Demo.litsx",
    });

    assert.match(result.code, /<middle \.header=\$\{bindRendererContext\(typeof this === "undefined" \? null : this,\s*renderHeader,\s*\{\s*projected: true\s*\}\)\}><\/middle>/);
    assert.match(result.code, /<card \.header=\$\{this\.header\}><\/card>/);
    assert.match(result.code, /return html`<section>\$\{renderRendererCall\(this\.header\)\}<\/section>`;/);
    assert.match(result.code, /"litsx-button": LitsxButton/);
  }, 20000);

  it("keeps renderer projection working for light DOM components when no scoped host elements are required", () => {
    const source = [
      "import { LitsxButton } from './litsx-button.litsx';",
      "export function Shell({ header }) {",
      "  static lightDom = true;",
      "  return <section><header>{header()}</header><slot /></section>;",
      "}",
      "export function Demo() {",
      "  return <Shell .header={() => <LitsxButton type=\"primary\" label=\"Mixed\" />}>Body</Shell>;",
      "}",
    ].join("\n");

    const result = transformLitsxSync(source, {
      filename: "/virtual/Demo.litsx",
    });

    assert.match(result.code, /class Shell extends LightDomMixin\(LitElement\)/);
    assert.match(result.code, /<shell \.header=\$\{bindRendererContext\(typeof this === "undefined" \? null : this,\s*\(\) => html`<litsx-button type="primary" label="Mixed"><\/litsx-button>`,\s*\{\s*projected: true\s*\}\)\}>Body<\/shell>/);
    assert.match(result.code, /return html`<section><header>\$\{renderRendererCall\(this\.header\)\}<\/header><slot><\/slot><\/section>`;/);
  }, 20000);

  it("does not rewrite ordinary callback props as renderer calls", () => {
    const source = [
      "export function Worker({ onResolve }) {",
      "  return <section>{[1, 2, 3].map(onResolve)}</section>;",
      "}",
    ].join("\n");

    const result = transformLitsxSync(source, {
      filename: "/virtual/Demo.litsx",
      jsxTemplate: false,
    });

    assert.doesNotMatch(result.code, /renderRendererCall/);
    assert.match(result.code, /return <section>\{\[1, 2, 3\]\.map\(this\.onResolve\)\}<\/section>;/);
  }, 20000);

  it("lowers renderer props that return mixed fragments with components", () => {
    const source = [
      "import { LitsxButton } from './litsx-button.litsx';",
      "export function Card({ header }) {",
      "  return <section>{header()}</section>;",
      "}",
      "export function Demo() {",
      "  return <Card .header={() => <><span>Lead</span><LitsxButton type=\"secondary\" label=\"Tail\" /></>} />;",
      "}",
    ].join("\n");

    const result = transformLitsxSync(source, {
      filename: "/virtual/Demo.litsx",
    });

    assert.match(result.code, /\.header=\$\{bindRendererContext\(typeof this === "undefined" \? null : this,\s*\(\) => html`<span>Lead<\/span><litsx-button type="secondary" label="Tail"><\/litsx-button>`,\s*\{\s*projected: true\s*\}\)\}/);
    assert.match(result.code, /return html`<section>\$\{renderRendererCall\(this\.header\)\}<\/section>`;/);
    assert.match(result.code, /"litsx-button": LitsxButton/);
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
    assert.strictEqual(result.metadata.litsxWarnings[0].filename, "/virtual/Counter.jsx");
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
    assert.strictEqual(result.metadata.litsxWarnings[0].code, 91016);
    assert.match(result.metadata.litsxWarnings[0].message, /migration wrapper only/);
  }, 20000);

  it("warns when external PascalCase imports are inferred as web components by usage", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "litsx-external-pascal-warning-"));
    const nodeModulesDir = path.join(tempDir, "node_modules", "fancy-wc");
    const filename = path.join(tempDir, "consumer.litsx");

    try {
      fs.mkdirSync(nodeModulesDir, { recursive: true });
      fs.writeFileSync(
        path.join(nodeModulesDir, "package.json"),
        JSON.stringify({ name: "fancy-wc", type: "module", exports: "./index.js" })
      );
      fs.writeFileSync(
        path.join(nodeModulesDir, "index.js"),
        [
          "export class FancyBox extends HTMLElement {}",
        ].join("\n")
      );

      const source = [
        'import { FancyBox } from "fancy-wc";',
        "export function Demo() {",
        "  return <FancyBox />;",
        "}",
      ].join("\n");

      const result = transformLitsxSync(source, {
        filename,
        jsxTemplate: false,
      });

      assert.ok(Array.isArray(result.metadata.litsxWarnings));
      assert.strictEqual(result.metadata.litsxWarnings.length, 1);
      assert.strictEqual(
        result.metadata.litsxWarnings[0].code,
        "LITSX_EXTERNAL_PASCAL_COMPONENT_INFERRED"
      );
      assert.match(result.metadata.litsxWarnings[0].message, /inferred imported PascalCase JSX "FancyBox"/);
      assert.match(result.metadata.litsxWarnings[0].message, /external module "fancy-wc"/);
      assert.match(result.metadata.litsxWarnings[0].message, /cannot verify at build time that this import is a web component/);
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  }, 20000);

  it("does not warn for external PascalCase imports that carry LitSX component metadata", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "litsx-external-pascal-compiled-"));
    const nodeModulesDir = path.join(tempDir, "node_modules", "fancy-litsx");
    const filename = path.join(tempDir, "consumer.litsx");

    try {
      fs.mkdirSync(nodeModulesDir, { recursive: true });
      fs.writeFileSync(
        path.join(nodeModulesDir, "package.json"),
        JSON.stringify({ name: "fancy-litsx", type: "module", exports: "./index.js" })
      );
      fs.writeFileSync(
        path.join(nodeModulesDir, "index.js"),
        [
          "export class FancyBox extends HTMLElement {",
          '  static [Symbol.for("litsx.component")] = true;',
          '  static [Symbol.for("litsx.hostTypeId")] = "litsx-host-type-fancy-box";',
          "}",
        ].join("\n")
      );

      const source = [
        'import { FancyBox } from "fancy-litsx";',
        "export function Demo() {",
        "  return <FancyBox />;",
        "}",
      ].join("\n");

      const result = transformLitsxSync(source, {
        filename,
        jsxTemplate: false,
      });

      assert.ok(Array.isArray(result.metadata.litsxWarnings));
      assert.deepStrictEqual(result.metadata.litsxWarnings, []);
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  }, 20000);

  it("does not warn for built-in boundary imports from compiled @litsx/core packages", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "litsx-external-core-boundaries-"));
    const nodeModulesDir = path.join(tempDir, "node_modules", "@litsx", "core");
    const filename = path.join(tempDir, "consumer.litsx");

    try {
      fs.mkdirSync(nodeModulesDir, { recursive: true });
      fs.writeFileSync(
        path.join(nodeModulesDir, "package.json"),
        JSON.stringify({ name: "@litsx/core", type: "module", exports: "./index.js" })
      );
      fs.writeFileSync(
        path.join(nodeModulesDir, "index.js"),
        [
          "export class SuspenseBoundary extends HTMLElement {",
          '  static [Symbol.for("litsx.component")] = true;',
          "}",
          "export class SuspenseList extends HTMLElement {",
          '  static [Symbol.for("litsx.component")] = true;',
          "}",
          "export class ErrorBoundary extends HTMLElement {",
          '  static [Symbol.for("litsx.component")] = true;',
          "}",
        ].join("\n")
      );

      const source = [
        'import { ErrorBoundary, SuspenseBoundary, SuspenseList } from "@litsx/core";',
        "export function Demo() {",
        "  return (",
        "    <SuspenseList>",
        "      <SuspenseBoundary fallback={null}>",
        "        <ErrorBoundary fallback={null}>ready</ErrorBoundary>",
        "      </SuspenseBoundary>",
        "    </SuspenseList>",
        "  );",
        "}",
      ].join("\n");

      const result = transformLitsxSync(source, {
        filename,
        jsxTemplate: false,
      });

      assert.ok(Array.isArray(result.metadata.litsxWarnings));
      assert.deepStrictEqual(result.metadata.litsxWarnings, []);
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  }, 20000);

  it("does not warn for external PascalCase imports reexported from compiled LitSX modules", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "litsx-external-pascal-reexported-"));
    const nodeModulesDir = path.join(tempDir, "node_modules", "fancy-litsx");
    const filename = path.join(tempDir, "consumer.litsx");

    try {
      fs.mkdirSync(nodeModulesDir, { recursive: true });
      fs.writeFileSync(
        path.join(nodeModulesDir, "package.json"),
        JSON.stringify({ name: "fancy-litsx", type: "module", exports: "./index.js" })
      );
      fs.writeFileSync(
        path.join(nodeModulesDir, "index.js"),
        [
          'export { FancyBox } from "./box.js";',
        ].join("\n")
      );
      fs.writeFileSync(
        path.join(nodeModulesDir, "box.js"),
        [
          "export class FancyBox extends HTMLElement {",
          '  static [Symbol.for("litsx.component")] = true;',
          '  static [Symbol.for("litsx.hostTypeId")] = "litsx-host-type-fancy-box";',
          "}",
        ].join("\n")
      );

      const source = [
        'import { FancyBox } from "fancy-litsx";',
        "export function Demo() {",
        "  return <FancyBox />;",
        "}",
      ].join("\n");

      const result = transformLitsxSync(source, {
        filename,
        jsxTemplate: false,
      });

      assert.ok(Array.isArray(result.metadata.litsxWarnings));
      assert.deepStrictEqual(result.metadata.litsxWarnings, []);
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  }, 20000);

  it("warns for aliased external PascalCase imports inferred as web components", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "litsx-external-pascal-alias-"));
    const nodeModulesDir = path.join(tempDir, "node_modules", "fancy-wc");
    const filename = path.join(tempDir, "consumer.litsx");

    try {
      fs.mkdirSync(nodeModulesDir, { recursive: true });
      fs.writeFileSync(
        path.join(nodeModulesDir, "package.json"),
        JSON.stringify({ name: "fancy-wc", type: "module", exports: "./index.js" })
      );
      fs.writeFileSync(
        path.join(nodeModulesDir, "index.js"),
        'export class FancyBox extends HTMLElement {}'
      );

      const source = [
        'import { FancyBox as Card } from "fancy-wc";',
        "export function Demo() {",
        "  return <Card />;",
        "}",
      ].join("\n");

      const result = transformLitsxSync(source, {
        filename,
        jsxTemplate: false,
      });

      assert.ok(Array.isArray(result.metadata.litsxWarnings));
      assert.strictEqual(result.metadata.litsxWarnings.length, 1);
      assert.strictEqual(result.metadata.litsxWarnings[0].code, "LITSX_EXTERNAL_PASCAL_COMPONENT_INFERRED");
      assert.match(result.metadata.litsxWarnings[0].message, /"Card"/);
      assert.match(result.metadata.litsxWarnings[0].message, /"fancy-wc"/);
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  }, 20000);

  it("warns for default external PascalCase imports inferred as web components", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "litsx-external-pascal-default-"));
    const nodeModulesDir = path.join(tempDir, "node_modules", "fancy-wc");
    const filename = path.join(tempDir, "consumer.litsx");

    try {
      fs.mkdirSync(nodeModulesDir, { recursive: true });
      fs.writeFileSync(
        path.join(nodeModulesDir, "package.json"),
        JSON.stringify({ name: "fancy-wc", type: "module", exports: "./index.js" })
      );
      fs.writeFileSync(
        path.join(nodeModulesDir, "index.js"),
        [
          "export default class FancyBox extends HTMLElement {}",
        ].join("\n")
      );

      const source = [
        'import FancyBox from "fancy-wc";',
        "export function Demo() {",
        "  return <FancyBox />;",
        "}",
      ].join("\n");

      const result = transformLitsxSync(source, {
        filename,
        jsxTemplate: false,
      });

      assert.ok(Array.isArray(result.metadata.litsxWarnings));
      assert.strictEqual(result.metadata.litsxWarnings.length, 1);
      assert.strictEqual(result.metadata.litsxWarnings[0].code, "LITSX_EXTERNAL_PASCAL_COMPONENT_INFERRED");
      assert.match(result.metadata.litsxWarnings[0].message, /"FancyBox"/);
      assert.match(result.metadata.litsxWarnings[0].message, /"fancy-wc"/);
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  }, 20000);

  it("warns for namespace external PascalCase imports inferred as web components", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "litsx-external-pascal-namespace-"));
    const nodeModulesDir = path.join(tempDir, "node_modules", "fancy-wc");
    const filename = path.join(tempDir, "consumer.litsx");

    try {
      fs.mkdirSync(nodeModulesDir, { recursive: true });
      fs.writeFileSync(
        path.join(nodeModulesDir, "package.json"),
        JSON.stringify({ name: "fancy-wc", type: "module", exports: "./index.js" })
      );
      fs.writeFileSync(
        path.join(nodeModulesDir, "index.js"),
        'export class FancyBox extends HTMLElement {}'
      );

      const source = [
        'import * as Fancy from "fancy-wc";',
        "const FancyBox = Fancy.FancyBox;",
        "export function Demo() {",
        "  return <FancyBox />;",
        "}",
      ].join("\n");

      const result = transformLitsxSync(source, {
        filename,
        jsxTemplate: false,
      });

      assert.ok(Array.isArray(result.metadata.litsxWarnings));
      assert.strictEqual(result.metadata.litsxWarnings.length, 1);
      assert.strictEqual(result.metadata.litsxWarnings[0].code, "LITSX_EXTERNAL_PASCAL_COMPONENT_INFERRED");
      assert.match(result.metadata.litsxWarnings[0].message, /"FancyBox"/);
      assert.match(result.metadata.litsxWarnings[0].message, /"fancy-wc"/);
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  }, 20000);

  it("warns for external PascalCase imports routed through package barrels", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "litsx-external-pascal-barrel-"));
    const nodeModulesDir = path.join(tempDir, "node_modules", "fancy-wc");
    const filename = path.join(tempDir, "consumer.litsx");

    try {
      fs.mkdirSync(nodeModulesDir, { recursive: true });
      fs.writeFileSync(
        path.join(nodeModulesDir, "package.json"),
        JSON.stringify({
          name: "fancy-wc",
          type: "module",
          exports: {
            ".": "./index.js",
            "./components": "./components.js",
          },
        })
      );
      fs.writeFileSync(path.join(nodeModulesDir, "index.js"), 'export * from "./components.js";');
      fs.writeFileSync(path.join(nodeModulesDir, "components.js"), 'export class FancyBox extends HTMLElement {}');

      const source = [
        'import { FancyBox } from "fancy-wc/components";',
        "export function Demo() {",
        "  return <FancyBox />;",
        "}",
      ].join("\n");

      const result = transformLitsxSync(source, {
        filename,
        jsxTemplate: false,
      });

      assert.ok(Array.isArray(result.metadata.litsxWarnings));
      assert.strictEqual(result.metadata.litsxWarnings.length, 1);
      assert.strictEqual(result.metadata.litsxWarnings[0].code, "LITSX_EXTERNAL_PASCAL_COMPONENT_INFERRED");
      assert.match(result.metadata.litsxWarnings[0].message, /"FancyBox"/);
      assert.match(result.metadata.litsxWarnings[0].message, /"fancy-wc\/components"/);
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  }, 20000);

  it("throws when implicit children are used outside direct JSX child projection", () => {
    const source = [
      "export function Panel({ children }) {",
      "  const body = children;",
      "  return <section>{body}</section>;",
      "}",
    ].join("\n");

    assert.throws(
      () => {
        transformLitsxSync(source, {
          filename: "/virtual/ChildrenError.litsx",
        });
      },
      /Implicit `children` projection is only supported as a direct JSX child expression/
    );
  }, 20000);

  it("throws when implicit children projection is duplicated in one render", () => {
    const source = [
      "export function Panel({ children }) {",
      "  return <section>{children}{children}</section>;",
      "}",
    ].join("\n");

    assert.throws(
      () => {
        transformLitsxSync(source, {
          filename: "/virtual/ChildrenDuplicate.litsx",
        });
      },
      /Implicit `children` projection can only appear once per component render/
    );
  }, 20000);

  it("accepts static hoist assignments without surfacing deprecation warnings", () => {
    const source = [
      "export const Counter = () => {",
      "  static styles = `:host { display: block; }`;",
      "  return <button>Save</button>;",
      "};",
    ].join("\n");

    const result = transformLitsxSync(source, {
      filename: "/virtual/Counter.jsx",
    });

    assert.ok(Array.isArray(result.metadata.litsxWarnings));
    assert.ok(!result.metadata.litsxWarnings.some((warning) => warning.code === 91020));
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

  it("runs outputPlugins before final TypeScript stripping", () => {
    const source = [
      "interface CounterProps {",
      "  label?: string;",
      "}",
      "type CounterVariant = \"primary\" | \"secondary\";",
      "export const Counter = ({ label = \"Save\" }: CounterProps) => {",
      "  return <button>{label}</button>;",
      "};",
    ].join("\n");

    const seenTypeDeclarations = [];
    const captureTypesPlugin = () => ({
      visitor: {
        TSInterfaceDeclaration(path) {
          seenTypeDeclarations.push(`interface:${path.node.id.name}`);
          path.insertAfter(
            t.variableDeclaration("const", [
              t.variableDeclarator(
                t.identifier("__sawInterfaceBeforeStrip"),
                t.booleanLiteral(true),
              ),
            ]),
          );
        },
        TSTypeAliasDeclaration(path) {
          seenTypeDeclarations.push(`type:${path.node.id.name}`);
          path.insertAfter(
            t.variableDeclaration("const", [
              t.variableDeclarator(
                t.identifier("__sawTypeAliasBeforeStrip"),
                t.booleanLiteral(true),
              ),
            ]),
          );
        },
      },
    });

    const result = transformLitsxSync(source, {
      filename: "/virtual/Counter.litsx",
      outputPlugins: [captureTypesPlugin],
    });

    assert.deepStrictEqual(seenTypeDeclarations, [
      "interface:CounterProps",
      "type:CounterVariant",
    ]);
    assert.match(result.code, /const __sawInterfaceBeforeStrip = true;/);
    assert.match(result.code, /const __sawTypeAliasBeforeStrip = true;/);
    assert.doesNotMatch(result.code, /interface CounterProps/);
    assert.doesNotMatch(result.code, /type CounterVariant/);
  }, 20000);

  it("lets outputPlugins inspect generic TypeScript syntax before final stripping", () => {
    const source = [
      "function identity<T>(value: T): T {",
      "  return value;",
      "}",
      "export const Counter = () => {",
      "  const label = identity<string>(\"Save\");",
      "  return <button>{label}</button>;",
      "};",
    ].join("\n");

    let sawTypeParameterDeclaration = false;
    let sawTypeParameterInstantiation = false;
    const captureGenericTypesPlugin = () => ({
      visitor: {
        FunctionDeclaration(path) {
          if (path.node.id?.name === "identity" && path.node.typeParameters) {
            sawTypeParameterDeclaration = true;
            path.insertBefore(
              t.variableDeclaration("const", [
                t.variableDeclarator(
                  t.identifier("__sawGenericDeclarationBeforeStrip"),
                  t.booleanLiteral(true),
                ),
              ]),
            );
          }
        },
        CallExpression(path) {
          if (
            path.node.callee?.type === "Identifier"
            && path.node.callee.name === "identity"
            && (path.node.typeParameters || path.node.typeArguments)
          ) {
            sawTypeParameterInstantiation = true;
            path.getStatementParent().insertBefore(
              t.variableDeclaration("const", [
                t.variableDeclarator(
                  t.identifier("__sawGenericInstantiationBeforeStrip"),
                  t.booleanLiteral(true),
                ),
              ]),
            );
          }
        },
      },
    });

    const result = transformLitsxSync(source, {
      filename: "/virtual/Counter.litsx",
      outputPlugins: [captureGenericTypesPlugin],
    });

    assert.strictEqual(sawTypeParameterDeclaration, true);
    assert.strictEqual(sawTypeParameterInstantiation, true);
    assert.match(result.code, /const __sawGenericDeclarationBeforeStrip = true;/);
    assert.match(result.code, /const __sawGenericInstantiationBeforeStrip = true;/);
    assert.doesNotMatch(result.code, /<T>/);
    assert.doesNotMatch(result.code, /identity<string>/);
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
      result.metadata.litsxWarnings.filter((warning) => warning.code === null).length,
      1
    );
    assert.ok(result.metadata.litsxWarnings.every((warning) => warning.filename === "/virtual/Counter.jsx"));
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

  it("clears compiler caches and overlay state when invalidating and disposing a session", () => {
    const session = createLitsxCompilationSession({
      transformOptions: {
        jsxTemplate: false,
      },
    });

    const invalidateSpy = vi.spyOn(session.typescriptSession, "invalidate");
    const clearOverlaySpy = vi.spyOn(session.typescriptSession, "clearOverlayFiles");

    session.sourceFeaturesCache.set("/virtual/a:src", {});
    session.authoredInputCache.set("/virtual/a:src", {});
    session.invalidate();

    assert.strictEqual(session.sourceFeaturesCache.size, 0);
    assert.strictEqual(session.authoredInputCache.size, 0);
    assert.deepStrictEqual(invalidateSpy.mock.calls[0], [{ host: true }]);

    session.dispose();

    expect(clearOverlaySpy).toHaveBeenCalledTimes(1);
    assert.strictEqual(session.typescriptSession, null);
  }, 20_000);

  it("invalidates the whole TypeScript session for authored source file extensions", () => {
    const session = createLitsxCompilationSession();
    const invalidateSpy = vi.spyOn(session.typescriptSession, "invalidate");

    session.sourceFeaturesCache.set("/virtual/demo.litsx:src", {});
    session.authoredInputCache.set("/virtual/demo.litsx:src", {});
    session.invalidate(["/virtual/demo.litsx"]);

    assert.strictEqual(session.sourceFeaturesCache.size, 0);
    assert.strictEqual(session.authoredInputCache.size, 0);
    expect(invalidateSpy).toHaveBeenCalledWith();

    session.dispose();
  }, 20_000);

  it("memoizes preset plugins per feature set for the same options object", () => {
    const plainSource = [
      "export const Counter = ({ label }) => {",
      "  return <button>{label}</button>;",
      "};",
    ].join("\n");
    const featureSource = [
      "import FancyButton from './FancyButton.js';",
      "import { useRef, useState } from '@litsx\/core';",
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
