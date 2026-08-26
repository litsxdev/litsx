import assert from "assert";
import fs from "fs";
import os from "os";
import path from "path";
import * as babelCore from "@babel/core";
import ts from "typescript";
import { beforeAll, describe, it } from "vitest";

import parser from "./helpers/litsx-parser.js";
import { interopDefault } from "./helpers/interop-default.js";
import { PLAYGROUND_TYPE_FILES } from "./helpers/playground-virtual-types.js";
import { createProjectTsSession } from "../packages/typescript-session/src/index.js";

const { transformFromAstSync } = babelCore;

let nativePreset;
let createLitsxPresetPlugins;
let detectLitsxSourceFeatures;
let isLitsxRuntimeHookName;

function compileWithNativePreset(
  source,
  {
    filename = "/virtual/test.tsx",
    parserPlugins = [],
    presetOptions = {},
  } = {},
) {
  return transformFromAstSync(
    parser.parse(source, {
      sourceType: "module",
      plugins: parserPlugins,
    }),
    source,
    {
      configFile: false,
      babelrc: false,
      filename,
      presets: [[nativePreset, presetOptions]],
    },
  );
}

beforeAll(async () => {
  const [presetMod, runtimeHooksMod] = await Promise.all([
    import("../packages/babel-preset-litsx/src/index.js"),
    import("../packages/babel-preset-litsx/src/internal/runtime-hooks.js"),
  ]);

  nativePreset = interopDefault(presetMod);
  createLitsxPresetPlugins = presetMod.createLitsxPresetPlugins;
  detectLitsxSourceFeatures = presetMod.detectLitsxSourceFeatures;
  isLitsxRuntimeHookName = runtimeHooksMod.isLitsxRuntimeHookName;
});

describe("@litsx/babel-preset-litsx", () => {
  it("lowers mixed HTML and SVG with canonical attributes and SVG dynamic fragments", () => {
    const source = [
      "type Shape = { d: string };",
      "type Props = { viewBox: string; strokeWidth: number; d: string; shapes: Shape[] };",
      "export const TestSvg = ({ viewBox, strokeWidth, d, shapes }: Props) => (",
      "  <section><svg viewBox={viewBox} strokeWidth={strokeWidth}>",
      "    <path d={d} strokeLinecap=\"round\" />",
      "    {shapes.map((shape) => <path d={shape.d} />)}",
      "    <foreignObject width={20}><div>HTML</div></foreignObject>",
      "  </svg></section>",
      ");",
    ].join("\n");

    const result = compileWithNativePreset(source, {
      parserPlugins: ["typescript"],
    });

    assert.match(result.code, /<svg viewBox="\$\{viewBox\}" stroke-width="\$\{strokeWidth\}">/);
    assert.match(result.code, /<path d="\$\{d\}" stroke-linecap="round">/);
    assert.match(result.code, /shapes\.map\(shape => svg`<path d="\$\{shape\.d\}"><\/path>`\)/);
    assert.match(result.code, /<foreignObject width="\$\{20\}"><div>HTML<\/div><\/foreignObject>/);
    assert.doesNotMatch(result.code, /\.viewBox=|\.strokeWidth=|\.d=/);
  });

  it("defaults to final html template lowering", () => {
    const source = [
      "export const TestGreeting = ({ label }) => {",
      "  return <button>{label}</button>;",
      "};",
    ].join("\n");

    const result = transformFromAstSync(
      parser.parse(source, { sourceType: "module" }),
      source,
      {
        configFile: false,
        babelrc: false,
        presets: [[nativePreset, {}]],
      },
    );

    assert.match(result.code, /import \{ LitElement, html \} from "lit";/);
    assert.match(
      result.code,
      /return html`<button>\$\{this\.label\}<\/button>`;/,
    );
  });

  it("routes ordinary JSX props into local component rest bags", () => {
    const source = [
      "const TestAction = ({ label, ...props }) => { return <button {...props}>{label}</button>; };",
      'export const TestScreen = () => { return <TestAction label="Save" aria-label="Save action" />; };',
    ].join("\n");

    const result = compileWithNativePreset(source);

    assert.match(
      result.code,
      /static \[Symbol\.for\("litsx\.restProps"\)\] = \{/,
    );
    assert.match(
      result.code,
      /jsxSpreadElement\("test-action", \[\{[\s\S]*?label: "Save",[\s\S]*?"aria-label": "Save action"/,
    );
  });

  it("matches the direct preset plugin factory", () => {
    const source = [
      "import FancyButton from './FancyButton.js';",
      "export const TestGreeting = ({ label = 'Save' }) => {",
      "  return <FancyButton .label={label} @click={save} />;",
      "};",
    ].join("\n");

    const presetResult = transformFromAstSync(
      parser.parse(source, { sourceType: "module" }),
      source,
      {
        configFile: false,
        babelrc: false,
        presets: [[nativePreset, {}]],
      },
    );

    const pluginResult = transformFromAstSync(
      parser.parse(source, { sourceType: "module" }),
      source,
      {
        configFile: false,
        babelrc: false,
        plugins: createLitsxPresetPlugins({}),
      },
    );

    assert.strictEqual(presetResult.code, pluginResult.code);
  });

  it("injects stable callsite metadata for useStableId in render and custom hooks", () => {
    const source = [
      'import { useStableId } from "@litsx/core";',
      "function useResourceKey() {",
      "  return useStableId();",
      "}",
      "export function StableIds() {",
      "  const first = useStableId();",
      "  const second = useResourceKey();",
      "  return <div>{first}:{second}</div>;",
      "}",
    ].join("\n");

    const result = transformFromAstSync(
      parser.parse(source, { sourceType: "module" }),
      source,
      {
        configFile: false,
        babelrc: false,
        filename: "/virtual/stable-ids.tsx",
        presets: [[nativePreset, { jsxTemplate: false }]],
      },
    );

    const ids = [
      ...result.code.matchAll(/useStableId\("([^"]+)"\)/g),
    ].map((match) => match[1]);

    assert.match(result.code, /function useResourceKey\(\)/);
    assert.strictEqual(ids.length, 2);
    assert.notStrictEqual(ids[0], ids[1]);
    assert.ok(ids.every((id) => id.startsWith("litsx-stable-")));
  });

  it("injects stable class metadata for generated component classes", () => {
    const source = [
      "export function PrimaryCard() {",
      "  return <div>one</div>;",
      "}",
      "export function SecondaryCard() {",
      "  return <div>two</div>;",
      "}",
    ].join("\n");

    const firstResult = transformFromAstSync(
      parser.parse(source, { sourceType: "module" }),
      source,
      {
        configFile: false,
        babelrc: false,
        filename: "/virtual/stable-class-ids.tsx",
        presets: [[nativePreset, { jsxTemplate: false }]],
      },
    );
    const secondResult = transformFromAstSync(
      parser.parse(source, { sourceType: "module" }),
      source,
      {
        configFile: false,
        babelrc: false,
        filename: "/virtual/stable-class-ids.tsx",
        presets: [[nativePreset, { jsxTemplate: false }]],
      },
    );

    const firstIds = [
      ...firstResult.code.matchAll(
        /\[Symbol\.for\("litsx\.hostTypeId"\)\] = "([^"]+)"/g,
      ),
    ].map((match) => match[1]);
    const secondIds = [
      ...secondResult.code.matchAll(
        /\[Symbol\.for\("litsx\.hostTypeId"\)\] = "([^"]+)"/g,
      ),
    ].map((match) => match[1]);

    assert.doesNotMatch(firstResult.code, /@litsx\/core\/elements/);
    assert.match(
      firstResult.code,
      /static \[Symbol\.for\("litsx\.component"\)\] = true;/,
    );
    assert.strictEqual(firstIds.length, 2);
    assert.deepStrictEqual(firstIds, secondIds);
    assert.notStrictEqual(firstIds[0], firstIds[1]);
    assert.ok(firstIds.every((id) => id.startsWith("litsx-host-type-")));
  });

  it("compiles structural hooks as deduplicated host capabilities", () => {
    const source = [
      'import { defineHook, useHost } from "@litsx/core";',
      "const CapabilityMixin = Base => class extends Base { get capability() { return 'ready'; } };",
      "const useCapability = defineHook({",
      "  mixin: CapabilityMixin,",
      "  use(suffix = '') { return useHost().capability + suffix; },",
      "});",
      "export function TestPanel() {",
      "  const first = useCapability(':first');",
      "  const second = useCapability(':second');",
      "  return <div>{first}{second}</div>;",
      "}",
    ].join("\n");

    const result = transformFromAstSync(
      parser.parse(source, { sourceType: "module" }),
      source,
      {
        configFile: false,
        babelrc: false,
        filename: "/virtual/structural-mixins.tsx",
        presets: [[nativePreset, { jsxTemplate: false }]],
      },
    );

    assert.match(
      result.code,
      /class TestPanel extends applyStructuralHooks\(LitElement, \[/,
    );
    assert.strictEqual(
      (
        result.code.match(
          /useCapability\[Symbol\.for\("litsx\.structuralHooks"\)\]/g,
        ) || []
      ).length,
      2,
    );
    assert.match(
      result.code,
      /readStructuralHook\(useCapability, \[':first'\]|\[":first"\]/,
    );
    assert.match(
      result.code,
      /readStructuralHook\(useCapability, \[':second'\]|\[":second"\]/,
    );
    assert.doesNotMatch(result.code, /HostMiddleware|structuralEntries/);
  });

  it("compiles installation-only structural hooks without an implicit host result", () => {
    const source = [
      'import { defineHook } from "@litsx/core";',
      "const FocusMixin = Base => class extends Base { static delegatesFocus = true; };",
      "const useFocusCapability = defineHook({ mixin: FocusMixin });",
      "export function TestPanel() {",
      "  useFocusCapability();",
      "  return <div>Ready</div>;",
      "}",
    ].join("\n");

    const result = transformFromAstSync(
      parser.parse(source, { sourceType: "module" }),
      source,
      {
        configFile: false,
        babelrc: false,
        filename: "/virtual/installation-only-mixin.tsx",
        presets: [[nativePreset, { jsxTemplate: false }]],
      },
    );

    assert.match(
      result.code,
      /class TestPanel extends applyStructuralHooks\(LitElement, \[/,
    );
    assert.match(result.code, /readStructuralHook\(useFocusCapability, \[\]\)/);
    assert.doesNotMatch(result.code, /useHost/);
  });

  it("propagates structural hook requirements through custom hooks", () => {
    const source = [
      'import { defineHook, useHost } from "@litsx/core";',
      "const I18nMixin = Base => class extends Base {};",
      "const useI18n = defineHook({ mixin: I18nMixin, use: () => useHost().i18n });",
      "export function useTranslatedLabel(key) {",
      "  return useI18n().t(key);",
      "}",
      "export function useToolbarLabel(key) {",
      "  return useTranslatedLabel(key);",
      "}",
      "export function TestButton() {",
      "  return <button>{useToolbarLabel('save')}</button>;",
      "}",
    ].join("\n");

    const result = transformFromAstSync(
      parser.parse(source, { sourceType: "module" }),
      source,
      {
        configFile: false,
        babelrc: false,
        filename: "/virtual/transitive-structural-mixins.tsx",
        presets: [[nativePreset, { jsxTemplate: false }]],
      },
    );

    assert.match(
      result.code,
      /useTranslatedLabel\[Symbol\.for\("litsx\.structuralHooks"\)\] = \[\.\.\.\(useI18n\[Symbol\.for\("litsx\.structuralHooks"\)\] \|\| \[useI18n\]\)\]/,
    );
    assert.match(
      result.code,
      /useToolbarLabel\[Symbol\.for\("litsx\.structuralHooks"\)\] = \[\.\.\.\(useI18n\[Symbol\.for\("litsx\.structuralHooks"\)\] \|\| \[useI18n\]\)\]/,
    );
    assert.match(
      result.code,
      /class TestButton extends applyStructuralHooks\(LitElement, \[/,
    );
    assert.match(result.code, /readStructuralHook\(useI18n, \[\]\)/);
  });

  it("rejects the removed structural middleware contract at compile time", () => {
    const source = [
      'import { defineHook } from "@litsx/core";',
      "const useLegacy = defineHook({",
      "  setup() {},",
      "  props: { value: {} },",
      "  use(host) { return host.value; },",
      "});",
    ].join("\n");

    assert.throws(
      () =>
        transformFromAstSync(
          parser.parse(source, { sourceType: "module" }),
          source,
          {
            configFile: false,
            babelrc: false,
            filename: "/virtual/removed-structural-contract.tsx",
            presets: [[nativePreset, { jsxTemplate: false }]],
          },
        ),
      /no longer accepts structural fields setup, props/,
    );
  });

  it("detects source features so the compiler can skip unnecessary native plugin passes", () => {
    const plainSource = [
      "export const TestGreeting = ({ label }) => {",
      "  return <button>{label}</button>;",
      "};",
    ].join("\n");
    const featureSource = [
      "import FancyButton from './FancyButton.js';",
      "import { useRef, useState } from '@litsx\/core';",
      "export function TestGreeting({ label }) {",
      "  const ref = useRef(null);",
      "  const [count] = useState(0);",
      "  return <FancyButton ref={ref}>{label}{count}</FancyButton>;",
      "}",
    ].join("\n");

    assert.deepStrictEqual(detectLitsxSourceFeatures(plainSource, {}), {
      hooks: false,
      domRefs: false,
      scopedElements: false,
      boundaries: false,
      lazy: false,
    });

    assert.deepStrictEqual(detectLitsxSourceFeatures(featureSource, {}), {
      hooks: true,
      domRefs: true,
      scopedElements: true,
      boundaries: false,
      lazy: false,
    });

    assert.strictEqual(
      detectLitsxSourceFeatures(
        'import { useStableId } from "@litsx/core"; useStableId();',
        {},
      ).hooks,
      true,
    );

    assert.strictEqual(
      detectLitsxSourceFeatures(
        'import { useId } from "@litsx/core"; useId();',
        {},
      ).hooks,
      true,
    );

    assert.strictEqual(
      detectLitsxSourceFeatures(
        'import { useContext } from "@litsx/core/context"; useContext(ThemeContext);',
        {},
      ).hooks,
      true,
    );

    assert.strictEqual(
      detectLitsxSourceFeatures(
        'import { defineHook } from "@litsx/core"; defineHook({ use() {} });',
        {},
      ).hooks,
      true,
    );

    assert.strictEqual(
      detectLitsxSourceFeatures(
        'import { SuspenseBoundary } from "@litsx/core"; <SuspenseBoundary fallback={null} />;',
        {},
      ).boundaries,
      true,
    );

    assert.strictEqual(
      detectLitsxSourceFeatures(
        'import { ErrorBoundary } from "@litsx/core"; <ErrorBoundary fallback={null} />;',
        {},
      ).boundaries,
      true,
    );

    assert.strictEqual(
      detectLitsxSourceFeatures(
        'import { lazy as defer } from "@litsx/core"; const TestPanel = defer(() => import("./panel.js"));',
        {},
      ).lazy,
      true,
    );

    assert.strictEqual(
      detectLitsxSourceFeatures(
        'import { useDemo } from "./use-demo"; export function App() { return useDemo(); }',
        {},
      ).hooks,
      true,
    );

    assert.strictEqual(
      detectLitsxSourceFeatures(
        'import { useDemo } from "./use-demo"; export function App() { return <div />; }',
        {},
      ).hooks,
      false,
    );

    assert.strictEqual(
      detectLitsxSourceFeatures(
        [
          "import {",
          "  useDemo as useScopedDemo,",
          '} from "./use-demo";',
          "export function App() { return useScopedDemo(); }",
        ].join("\n"),
        {},
      ).hooks,
      true,
    );

    assert.strictEqual(
      detectLitsxSourceFeatures(
        [
          "import * as sharedHooks",
          '  from "./use-demo";',
          "export function App() { return sharedHooks.useScopedDemo(); }",
        ].join("\n"),
        {},
      ).hooks,
      true,
    );

    assert.strictEqual(
      detectLitsxSourceFeatures(
        'function useFormat(value) { return String(value); } export function App() { return useFormat("x"); }',
        {},
      ).hooks,
      false,
    );

    assert.strictEqual(
      detectLitsxSourceFeatures('import type { useDemo } from "./types";', {})
        .hooks,
      false,
    );

    assert.deepStrictEqual(
      detectLitsxSourceFeatures(
        [
          "export function TestGreeting() {",
          "  return <div>ready</div>;",
          "}",
          "TestGreeting.lightDom = true;",
        ].join("\n"),
        {},
      ),
      {
        hooks: false,
        domRefs: false,
        scopedElements: true,
        boundaries: false,
        lazy: false,
      },
    );

    assert.strictEqual(
      createLitsxPresetPlugins({}, detectLitsxSourceFeatures(plainSource, {}))
        .length,
      8,
    );
    assert.strictEqual(
      createLitsxPresetPlugins({}, detectLitsxSourceFeatures(featureSource, {}))
        .length,
      11,
    );
  });

  it("keeps authored runtime hook detection aligned with @litsx/core naming", () => {
    const coreTypes = fs.readFileSync(
      path.join(process.cwd(), "packages/core/src/index.d.ts"),
      "utf8",
    );
    const contextTypes = fs.readFileSync(
      path.join(process.cwd(), "packages/core/src/context.d.ts"),
      "utf8",
    );
    const publicUseExports = [
      ...Array.from(
        coreTypes.matchAll(/export declare function (use[A-Z]\w*)\b/g),
        (match) => match[1],
      ).filter((name) => !name.startsWith("useStructural")),
      ...Array.from(
        contextTypes.matchAll(/export declare function (use[A-Z]\w*)\b/g),
        (match) => match[1],
      ),
    ];

    assert.deepStrictEqual(
      publicUseExports.filter((name) => !isLitsxRuntimeHookName(name)),
      [],
    );
  });

  it("can disable final template lowering", () => {
    const source = [
      "export const TestGreeting = ({ label }) => {",
      "  return <button @click={save}>{label}</button>;",
      "};",
    ].join("\n");

    const result = transformFromAstSync(
      parser.parse(source, { sourceType: "module" }),
      source,
      {
        configFile: false,
        babelrc: false,
        presets: [[nativePreset, { jsxTemplate: false }]],
      },
    );

    assert.match(result.code, /class TestGreeting extends LitElement/);
    assert.match(
      result.code,
      /return <button @click=\{save\}>\{this\.label\}<\/button>;/,
    );
    assert.doesNotMatch(result.code, /html`/);
  });

  it("keeps top-level lowercase helpers as plain functions and only lowers their JSX", () => {
    const source = [
      "function renderHelperWithArgs(alpha, beta, gamma) {",
      "  return <p>{alpha}{beta}{gamma}</p>;",
      "}",
      "export const TestDemo = () => {",
      "  return <section>{renderHelperWithArgs('a', 'b', 'c')}</section>;",
      "};",
    ].join("\n");

    const result = transformFromAstSync(
      parser.parse(source, { sourceType: "module" }),
      source,
      {
        configFile: false,
        babelrc: false,
        presets: [[nativePreset, {}]],
      },
    );

    assert.match(
      result.code,
      /function renderHelperWithArgs\(alpha, beta, gamma\) \{\s*return html`<p>\$\{alpha\}\$\{beta\}\$\{gamma\}<\/p>`;\s*\}/,
    );
    assert.match(result.code, /class TestDemo extends LitElement/);
    assert.doesNotMatch(result.code, /class renderHelperWithArgs extends/);
  });

  it("does not promote named lowercase exports to authored components", () => {
    const source = [
      "export function renderHelper() {",
      "  return <p>ok</p>;",
      "}",
    ].join("\n");

    const result = transformFromAstSync(
      parser.parse(source, { sourceType: "module" }),
      source,
      {
        configFile: false,
        babelrc: false,
        presets: [[nativePreset, {}]],
      },
    );

    assert.match(
      result.code,
      /export function renderHelper\(\) \{\s*return html`<p>ok<\/p>`;\s*\}/,
    );
    assert.doesNotMatch(result.code, /class renderHelper extends/);
  });

  it("can be consumed through createLitsxPresetPlugins directly", () => {
    const source = [
      "export const TestGreeting = ({ label }) => {",
      "  return <button @click={save}>{label}</button>;",
      "};",
    ].join("\n");

    const presetResult = transformFromAstSync(
      parser.parse(source, { sourceType: "module" }),
      source,
      {
        configFile: false,
        babelrc: false,
        presets: [[nativePreset, { jsxTemplate: false }]],
      },
    );

    const pluginFactoryResult = transformFromAstSync(
      parser.parse(source, { sourceType: "module" }),
      source,
      {
        configFile: false,
        babelrc: false,
        plugins: createLitsxPresetPlugins({ jsxTemplate: false }),
      },
    );

    assert.strictEqual(pluginFactoryResult.code, presetResult.code);
  });

  it("covers typed props, scoped elements, and final template lowering through the preset", () => {
    const source = [
      "import FancyButton from './FancyButton.js';",
      "type Props = { label: string; count: number };",
      "export const TypedForm = ({ label, count }: Props) => {",
      "  return <FancyButton .label={label}>{count}</FancyButton>;",
      "};",
    ].join("\n");

    const result = transformFromAstSync(
      parser.parse(source, {
        sourceType: "module",
        plugins: ["typescript"],
      }),
      source,
      {
        configFile: false,
        babelrc: false,
        filename: "/virtual/TypedForm.tsx",
        presets: [[nativePreset, { ssr: true }]],
      },
    );

    assert.match(
      result.code,
      /class TypedForm extends ShadowDomMixin\(HydrationSuspenseMixin\(LitElement\)\)/,
    );
    assert.match(
      result.code,
      /static properties = \{[\s\S]*label: \{[\s\S]*type: String[\s\S]*count: \{[\s\S]*type: Number/s,
    );
    assert.match(
      result.code,
      /static elements = \{[\s\S]*"fancy-button": annotateHydratableCustomElement\(FancyButton,\s*\{\s*tagName: "fancy-button",\s*moduleId: "\.\/FancyButton\.js"\s*\}\)/s,
    );
    assert.match(result.code, /html`/);
    assert.match(
      result.code,
      /static \[LITSX_MODULE_ID\] = "\/virtual\/TypedForm\.tsx";/,
    );
  }, 20000);

  it("rewrites renderToString roots into scoped templates", () => {
    const source = [
      "import { renderToString } from '@litsx/ssr';",
      "import ProductCard from './ProductCard.js';",
      "export async function renderProduct(product) {",
      "  return renderToString(<ProductCard .product={product} />);",
      "}",
    ].join("\n");

    const result = transformFromAstSync(
      parser.parse(source, { sourceType: "module" }),
      source,
      {
        configFile: false,
        babelrc: false,
        presets: [[nativePreset, {}]],
      },
    );

    assert.match(
      result.code,
      /import \{ __litsxScopedTemplate, annotateHydratableCustomElement \} from "@litsx\/core\/elements"|import \{ annotateHydratableCustomElement, __litsxScopedTemplate \} from "@litsx\/core\/elements";/,
    );
    assert.match(
      result.code,
      /renderToString\(__litsxScopedTemplate\(html`<product-card \.product=\$\{product\}><\/product-card>`\, \{\s*"product-card": annotateHydratableCustomElement\(ProductCard,\s*\{\s*tagName: "product-card",\s*moduleId: "\.\/ProductCard\.js"\s*\}\)\s*\}\)\)/,
    );
  });

  it("rewrites renderToStream roots into scoped templates", () => {
    const source = [
      "import { renderToStream } from '@litsx/ssr';",
      "import ProductCard from './ProductCard.js';",
      "export async function renderProduct(product) {",
      "  return renderToStream(<ProductCard .product={product} />);",
      "}",
    ].join("\n");

    const result = transformFromAstSync(
      parser.parse(source, { sourceType: "module" }),
      source,
      {
        configFile: false,
        babelrc: false,
        presets: [[nativePreset, {}]],
      },
    );

    assert.match(
      result.code,
      /import \{ __litsxScopedTemplate, annotateHydratableCustomElement \} from "@litsx\/core\/elements"|import \{ annotateHydratableCustomElement, __litsxScopedTemplate \} from "@litsx\/core\/elements";/,
    );
    assert.match(
      result.code,
      /renderToStream\(__litsxScopedTemplate\(html`<product-card \.product=\$\{product\}><\/product-card>`\, \{\s*"product-card": annotateHydratableCustomElement\(ProductCard,\s*\{\s*tagName: "product-card",\s*moduleId: "\.\/ProductCard\.js"\s*\}\)\s*\}\)\)/,
    );
  });

  it("keeps default async PascalCase exports out of the LitElement lowering path", () => {
    const source = [
      "export default async function ProductPage({ slug }) {",
      "  return <main>{slug}</main>;",
      "}",
    ].join("\n");

    const result = transformFromAstSync(
      parser.parse(source, { sourceType: "module" }),
      source,
      {
        configFile: false,
        babelrc: false,
        presets: [[nativePreset, {}]],
      },
    );

    assert.doesNotMatch(result.code, /class ProductPage extends LitElement/);
    assert.match(
      result.code,
      /return __litsxScopedTemplate\(html`<main>\$\{slug\}<\/main>`\, \{\}\);/,
    );
    assert.match(result.code, /ProductPage\[LITSX_SERVER_COMPONENT\] = true;/);
  });

  it("keeps default exports that resolve to async PascalCase bindings out of LitElement lowering", () => {
    const source = [
      "const ProductPage = async ({ slug }) => {",
      "  return <main>{slug}</main>;",
      "};",
      "export default ProductPage;",
    ].join("\n");

    const result = transformFromAstSync(
      parser.parse(source, { sourceType: "module" }),
      source,
      {
        configFile: false,
        babelrc: false,
        presets: [[nativePreset, {}]],
      },
    );

    assert.doesNotMatch(result.code, /class ProductPage extends LitElement/);
    assert.match(
      result.code,
      /const ProductPage = async \(\{\s*slug\s*\}\) => \{\s*return __litsxScopedTemplate\(html`<main>\$\{slug\}<\/main>`\, \{\}\);\s*\};/,
    );
    assert.match(result.code, /export default ProductPage;/);
    assert.match(result.code, /ProductPage\[LITSX_SERVER_COMPONENT\] = true;/);
  });

  it("does not treat named async exports as server-side components", () => {
    const source = [
      "export async function ProductPage({ slug }) {",
      "  return <main>{slug}</main>;",
      "}",
    ].join("\n");

    const result = transformFromAstSync(
      parser.parse(source, { sourceType: "module" }),
      source,
      {
        configFile: false,
        babelrc: false,
        presets: [[nativePreset, {}]],
      },
    );

    assert.doesNotMatch(result.code, /class ProductPage extends LitElement/);
    assert.match(
      result.code,
      /export async function ProductPage\(\{\s*slug\s*\}\) \{\s*return html`<main>\$\{slug\}<\/main>`;\s*\}/,
    );
  });

  it("fails when an async PascalCase binding is used as an SSR root without being the default export", () => {
    const source = [
      "import { renderToString } from '@litsx/ssr';",
      "async function ProductPage({ slug }) {",
      "  return <main>{slug}</main>;",
      "}",
      "export async function renderPage(slug) {",
      "  return renderToString(<ProductPage .slug={slug} />);",
      "}",
    ].join("\n");

    assert.throws(
      () =>
        transformFromAstSync(
          parser.parse(source, { sourceType: "module" }),
          source,
          {
            configFile: false,
            babelrc: false,
            presets: [[nativePreset, {}]],
          },
        ),
      /Server component "ProductPage" must be the module default export/,
    );
  });

  it("fails when a server component module is imported through a non-default binding", () => {
    const fixtureDirectory = fs.mkdtempSync(
      path.join(os.tmpdir(), "litsx-server-invalid-import-"),
    );
    const importedFilename = path.join(fixtureDirectory, "ProductPage.js");
    const entryFilename = path.join(fixtureDirectory, "entry.js");

    fs.writeFileSync(
      importedFilename,
      [
        "export default async function ProductPage({ slug }) {",
        "  return <main>{slug}</main>;",
        "}",
      ].join("\n"),
    );

    const source = [
      "import { renderToString } from '@litsx/ssr';",
      "import { ProductPage } from './ProductPage.js';",
      "export async function renderPage(slug) {",
      "  return renderToString(<ProductPage .slug={slug} />);",
      "}",
    ].join("\n");

    assert.throws(
      () =>
        transformFromAstSync(
          parser.parse(source, { sourceType: "module" }),
          source,
          {
            configFile: false,
            babelrc: false,
            filename: entryFilename,
            presets: [[nativePreset, {}]],
          },
        ),
      /must be imported as a default binding/,
    );
  });

  it("does not treat default async PascalCase exports without a renderable return as server-side components", () => {
    const source = [
      "export default async function ProductPage({ slug }) {",
      "  return slug.length;",
      "}",
    ].join("\n");

    const result = transformFromAstSync(
      parser.parse(source, { sourceType: "module" }),
      source,
      {
        configFile: false,
        babelrc: false,
        presets: [[nativePreset, {}]],
      },
    );

    assert.doesNotMatch(result.code, /class ProductPage extends LitElement/);
    assert.doesNotMatch(result.code, /import \{ html \} from "lit";/);
    assert.match(
      result.code,
      /export default async function ProductPage\(\{\s*slug\s*\}\) \{\s*return slug\.length;\s*\}/,
    );
  });

  it("lowers default async PascalCase exports with scoped JSX returns into server-side components", () => {
    const source = [
      "import ProductCard from './ProductCard.js';",
      "export default async function ProductPage({ product }) {",
      "  return <main><ProductCard .product={product} /></main>;",
      "}",
    ].join("\n");

    const result = transformFromAstSync(
      parser.parse(source, { sourceType: "module" }),
      source,
      {
        configFile: false,
        babelrc: false,
        presets: [[nativePreset, {}]],
      },
    );

    assert.doesNotMatch(result.code, /class ProductPage extends LitElement/);
    assert.match(
      result.code,
      /import \{[\s\S]*__litsxScopedTemplate[\s\S]*annotateHydratableCustomElement[\s\S]*LITSX_SERVER_COMPONENT[\s\S]*\} from "@litsx\/core\/elements";/,
    );
    assert.match(
      result.code,
      /return __litsxScopedTemplate\(html`<main><product-card \.product=\$\{product\}><\/product-card><\/main>`\, \{\s*"product-card": annotateHydratableCustomElement\(ProductCard,\s*\{\s*tagName: "product-card",\s*moduleId: "\.\/ProductCard\.js"\s*\}\)\s*\}\);/,
    );
    assert.match(result.code, /ProductPage\[LITSX_SERVER_COMPONENT\] = true;/);
  });

  it("uses Component.elements for html template returns in default async server components", () => {
    const source = [
      "import ProductCard from './ProductCard.js';",
      "export default async function ProductPage({ product }) {",
      "  return html`<main><product-card .product=${product}></product-card></main>`;",
      "}",
      "ProductPage.elements = {",
      "  'product-card': ProductCard,",
      "};",
    ].join("\n");

    const result = transformFromAstSync(
      parser.parse(source, { sourceType: "module" }),
      source,
      {
        configFile: false,
        babelrc: false,
        presets: [[nativePreset, {}]],
      },
    );

    assert.doesNotMatch(result.code, /class ProductPage extends LitElement/);
    assert.match(
      result.code,
      /return __litsxScopedTemplate\(html`<main><product-card \.product=\$\{product\}><\/product-card><\/main>`\, \{\s*"product-card": annotateHydratableCustomElement\(ProductCard,\s*\{\s*tagName: "product-card",\s*moduleId: "\.\/ProductCard\.js"\s*\}\)\s*\}\);/,
    );
    assert.match(
      result.code,
      /ProductPage\.elements = \{\s*'product-card': ProductCard\s*\};/,
    );
    assert.match(result.code, /ProductPage\[LITSX_SERVER_COMPONENT\] = true;/);
  });

  it("resolves stable const aliases inside Component.elements", () => {
    const source = [
      "import ProductCard from './ProductCard.js';",
      "const TestCard = ProductCard;",
      "export default async function ProductPage({ product }) {",
      "  return html`<main><product-card .product=${product}></product-card></main>`;",
      "}",
      "ProductPage.elements = {",
      "  'product-card': TestCard,",
      "};",
    ].join("\n");

    const result = transformFromAstSync(
      parser.parse(source, { sourceType: "module" }),
      source,
      {
        configFile: false,
        babelrc: false,
        presets: [[nativePreset, {}]],
      },
    );

    assert.match(
      result.code,
      /"product-card": annotateHydratableCustomElement\(ProductCard,\s*\{\s*tagName: "product-card",\s*moduleId: "\.\/ProductCard\.js"\s*\}\)/,
    );
  });

  it("resolves stable object member entries inside Component.elements", () => {
    const source = [
      "import ProductCard from './ProductCard.js';",
      "const controls = { ProductCard };",
      "export default async function ProductPage({ product }) {",
      "  return html`<main><product-card .product=${product}></product-card></main>`;",
      "}",
      "ProductPage.elements = {",
      "  'product-card': controls.ProductCard,",
      "};",
    ].join("\n");

    const result = transformFromAstSync(
      parser.parse(source, { sourceType: "module" }),
      source,
      {
        configFile: false,
        babelrc: false,
        presets: [[nativePreset, {}]],
      },
    );

    assert.match(
      result.code,
      /"product-card": annotateHydratableCustomElement\(ProductCard,\s*\{\s*tagName: "product-card",\s*moduleId: "\.\/ProductCard\.js"\s*\}\)/,
    );
  });

  it("rejects Component.elements entries that do not resolve to a single stable constructor", () => {
    const source = [
      "import ProductCard from './ProductCard.js';",
      "import FallbackCard from './FallbackCard.js';",
      "export default async function ProductPage({ product }) {",
      "  return html`<main><product-card .product=${product}></product-card></main>`;",
      "}",
      "ProductPage.elements = {",
      "  'product-card': flag ? ProductCard : FallbackCard,",
      "};",
    ].join("\n");

    assert.throws(
      () =>
        transformFromAstSync(
          parser.parse(source, { sourceType: "module" }),
          source,
          {
            configFile: false,
            babelrc: false,
            presets: [[nativePreset, {}]],
          },
        ),
      /could not resolve Component\.elements\["product-card"\] to a single stable custom element constructor/,
    );
  });

  it("rejects dynamic Component.elements entries without explicit metadata", () => {
    const source = [
      "import ProductCard from './ProductCard.js';",
      "const resolveCard = () => ProductCard;",
      "export default async function ProductPage({ product }) {",
      "  return html`<main><product-card .product=${product}></product-card></main>`;",
      "}",
      "ProductPage.elements = {",
      "  'product-card': resolveCard(),",
      "};",
    ].join("\n");

    assert.throws(
      () =>
        transformFromAstSync(
          parser.parse(source, { sourceType: "module" }),
          source,
          {
            configFile: false,
            babelrc: false,
            presets: [[nativePreset, {}]],
          },
        ),
      /could not resolve Component\.elements\["product-card"\] to a single stable custom element constructor/,
    );
  });

  it("rewrites renderToString server-component roots into awaited function calls", () => {
    const source = [
      "import { renderToString } from '@litsx/ssr';",
      "export default async function ProductPage({ slug }) {",
      "  return <main>{slug}</main>;",
      "}",
      "export async function renderPage(slug) {",
      "  return renderToString(<ProductPage .slug={slug} />);",
      "}",
    ].join("\n");

    const result = transformFromAstSync(
      parser.parse(source, { sourceType: "module" }),
      source,
      {
        configFile: false,
        babelrc: false,
        presets: [[nativePreset, {}]],
      },
    );

    assert.match(
      result.code,
      /import \{[\s\S]*__litsxServerComponentCall[\s\S]*\} from "@litsx\/core\/elements";/,
    );
    assert.match(
      result.code,
      /return renderToString\(__litsxServerComponentCall\(ProductPage, \{\s*slug: slug\s*\}\)\);/,
    );
    assert.doesNotMatch(result.code, /renderToString\(__litsxScopedTemplate/);
  });

  it("rewrites imported server-component roots into runtime call markers", () => {
    const fixtureDirectory = fs.mkdtempSync(
      path.join(os.tmpdir(), "litsx-server-root-"),
    );
    const importedFilename = path.join(fixtureDirectory, "ProductPage.js");
    const entryFilename = path.join(fixtureDirectory, "entry.js");

    fs.writeFileSync(
      importedFilename,
      [
        "export default async function ProductPage({ slug }) {",
        "  return <main>{slug}</main>;",
        "}",
      ].join("\n"),
    );

    const source = [
      "import { renderToString } from '@litsx/ssr';",
      "import ProductPage from './ProductPage.js';",
      "export async function renderPage(slug) {",
      "  return renderToString(<ProductPage .slug={slug} />);",
      "}",
    ].join("\n");

    const result = transformFromAstSync(
      parser.parse(source, { sourceType: "module" }),
      source,
      {
        configFile: false,
        babelrc: false,
        filename: entryFilename,
        presets: [[nativePreset, {}]],
      },
    );

    assert.match(
      result.code,
      /renderToString\(__litsxServerComponentCall\(ProductPage, \{\s*slug: slug\s*\}\)\);/,
    );
    assert.doesNotMatch(result.code, /renderToString\(__litsxScopedTemplate/);
  });

  it("rewrites aliased imported server-component roots through shared import resolution", () => {
    const fixtureDirectory = fs.mkdtempSync(
      path.join(os.tmpdir(), "litsx-server-root-alias-"),
    );

    try {
      const srcDirectory = path.join(fixtureDirectory, "src");
      fs.mkdirSync(path.join(srcDirectory, "pages"), { recursive: true });
      const importedFilename = path.join(
        srcDirectory,
        "pages",
        "ProductPage.js",
      );
      const entryFilename = path.join(srcDirectory, "entry.js");
      const tsconfigPath = path.join(fixtureDirectory, "tsconfig.json");

      fs.writeFileSync(
        tsconfigPath,
        JSON.stringify({
          compilerOptions: {
            baseUrl: ".",
            paths: {
              "@/*": ["src/*"],
            },
            allowJs: true,
            jsx: "preserve",
            module: "esnext",
            target: "esnext",
          },
          include: ["src/**/*"],
        }),
      );

      fs.writeFileSync(
        importedFilename,
        [
          "export default async function ProductPage({ slug }) {",
          "  return <main>{slug}</main>;",
          "}",
        ].join("\n"),
      );

      const source = [
        "import { renderToString } from '@litsx/ssr';",
        'import ProductPage from "@/pages/ProductPage.js";',
        "export async function renderPage(slug) {",
        "  return renderToString(<ProductPage slug={slug} />);",
        "}",
      ].join("\n");

      const configFile = ts.readConfigFile(tsconfigPath, ts.sys.readFile);
      const parsedCommandLine = ts.parseJsonConfigFileContent(
        configFile.config,
        ts.sys,
        fixtureDirectory,
        undefined,
        tsconfigPath,
      );
      const session = createProjectTsSession({
        typescript: ts,
        parsedCommandLine,
      });
      const result = transformFromAstSync(
        parser.parse(source, { sourceType: "module" }),
        source,
        {
          configFile: false,
          babelrc: false,
          filename: entryFilename,
          presets: [
            [
              nativePreset,
              {
                typescriptSession: session,
              },
            ],
          ],
        },
      );

      assert.match(
        result.code,
        /renderToString\(__litsxServerComponentCall\(ProductPage, \{\s*slug: slug\s*\}\)\);/,
      );
      assert.doesNotMatch(result.code, /renderToString\(__litsxScopedTemplate/);
    } finally {
      fs.rmSync(fixtureDirectory, { recursive: true, force: true });
    }
  });

  it("dedupes scoped entries across fragment SSR roots", () => {
    const source = [
      "import { renderToString } from '@litsx/ssr';",
      "import ProductCard from './ProductCard.js';",
      "export async function renderProducts(a, b) {",
      "  return renderToString(<>",
      "    <main><ProductCard .product={a} /></main>",
      "    <ProductCard .product={b} />",
      "  </>);",
      "}",
    ].join("\n");

    const result = transformFromAstSync(
      parser.parse(source, { sourceType: "module" }),
      source,
      {
        configFile: false,
        babelrc: false,
        presets: [[nativePreset, {}]],
      },
    );

    const matches =
      result.code.match(
        /"product-card": annotateHydratableCustomElement\(ProductCard,/g,
      ) || [];
    assert.strictEqual(matches.length, 1);
    assert.match(result.code, /renderToString\(__litsxScopedTemplate\(html`/);
  });

  it("lowers nested imported server components inside server-side component returns", () => {
    const fixtureDirectory = fs.mkdtempSync(
      path.join(os.tmpdir(), "litsx-server-nested-"),
    );
    const importedFilename = path.join(fixtureDirectory, "ProductSection.js");
    const entryFilename = path.join(fixtureDirectory, "ProductPage.js");

    fs.writeFileSync(
      importedFilename,
      [
        "export default async function ProductSection({ product }) {",
        "  return <section>{product.name}</section>;",
        "}",
      ].join("\n"),
    );

    const source = [
      "import ProductSection from './ProductSection.js';",
      "export default async function ProductPage({ product }) {",
      "  return <main><ProductSection .product={product} /></main>;",
      "}",
    ].join("\n");

    const result = transformFromAstSync(
      parser.parse(source, { sourceType: "module" }),
      source,
      {
        configFile: false,
        babelrc: false,
        filename: entryFilename,
        presets: [[nativePreset, {}]],
      },
    );

    assert.match(
      result.code,
      /import \{[\s\S]*__litsxServerComponentCall[\s\S]*\} from "@litsx\/core\/elements";/,
    );
    assert.match(
      result.code,
      /return __litsxScopedTemplate\(html`<main>\$\{__litsxServerComponentCall\(ProductSection, \{\s*product: product\s*\}\)\}<\/main>`\, \{\}\);/,
    );
    assert.doesNotMatch(result.code, /"product-section": ProductSection/);
  });

  it("allows nested async PascalCase bindings inside a default-export server component", () => {
    const source = [
      "async function ProductSection({ product }) {",
      "  return <section>{product.name}</section>;",
      "}",
      "export default async function ProductPage({ product }) {",
      "  return <main><ProductSection .product={product} /></main>;",
      "}",
    ].join("\n");

    const result = transformFromAstSync(
      parser.parse(source, { sourceType: "module" }),
      source,
      {
        configFile: false,
        babelrc: false,
        presets: [[nativePreset, {}]],
      },
    );

    assert.match(
      result.code,
      /return __litsxScopedTemplate\(html`<main>\$\{__litsxServerComponentCall\(ProductSection, \{\s*product: product\s*\}\)\}<\/main>`\, \{\}\);/,
    );
  });

  it("lowers nested async PascalCase bindings inside fragment returns for default-export server components", () => {
    const source = [
      "async function ProductSection({ product }) {",
      "  return <section>{product.name}</section>;",
      "}",
      "export default async function ProductPage({ product }) {",
      "  return <>",
      "    <ProductSection .product={product} />",
      "    <footer>done</footer>",
      "  </>;",
      "}",
    ].join("\n");

    const result = transformFromAstSync(
      parser.parse(source, { sourceType: "module" }),
      source,
      {
        configFile: false,
        babelrc: false,
        presets: [[nativePreset, {}]],
      },
    );

    assert.match(
      result.code,
      /return __litsxScopedTemplate\(html`\$\{__litsxServerComponentCall\(ProductSection, \{\s*product: product\s*\}\)\}<footer>done<\/footer>`\, \{\}\);/,
    );
  });

  it("keeps nested server-component projection inside Lit component light-dom children", () => {
    const fixtureDirectory = fs.mkdtempSync(
      path.join(os.tmpdir(), "litsx-server-lit-projection-"),
    );
    const importedFilename = path.join(fixtureDirectory, "ProductActions.js");
    const entryFilename = path.join(fixtureDirectory, "ProductPage.js");

    fs.writeFileSync(
      importedFilename,
      [
        "export default async function ProductActions({ product }) {",
        "  return <p>{product.copy}</p>;",
        "}",
      ].join("\n"),
    );

    const source = [
      "import ProductCard from './ProductCard.js';",
      "import ProductActions from './ProductActions.js';",
      "export default async function ProductPage({ product }) {",
      "  return <ProductCard .product={product}><ProductActions .product={product} /></ProductCard>;",
      "}",
    ].join("\n");

    const result = transformFromAstSync(
      parser.parse(source, { sourceType: "module" }),
      source,
      {
        configFile: false,
        babelrc: false,
        filename: entryFilename,
        presets: [[nativePreset, {}]],
      },
    );

    assert.match(
      result.code,
      /return __litsxScopedTemplate\(html`<product-card \.product=\$\{product\}>\$\{__litsxServerComponentCall\(ProductActions, \{\s*product: product\s*\}\)\}<\/product-card>`\, \{\s*"product-card": annotateHydratableCustomElement\(ProductCard,\s*\{\s*tagName: "product-card",\s*moduleId: "\.\/ProductCard\.js"\s*\}\)\s*\}\);/,
    );
    assert.doesNotMatch(result.code, /"product-actions": ProductActions/);
  });

  it("lowers an async server component's forwarded ref parameter to a Lit property binding", () => {
    const source = [
      "import ContextBar from './ContextBar.js';",
      "export default async function Page({ params }, ref) {",
      "  return <ContextBar ref={ref} .params={params} />;",
      "}",
    ].join("\n");

    const result = compileWithNativePreset(source, {
      filename: "/virtual/Page.tsx",
    });

    assert.match(
      result.code,
      /<context-bar \.ref=\$\{ref\} \.params=\$\{params\}><\/context-bar>/,
    );
    assert.doesNotMatch(result.code, /<context-bar ref=/);
  });

  it("keeps a layout's children.ref as an SSR composition binding", () => {
    const source = [
      "export default async function Layout({ children }) {",
      "  return <vds-navbar-top .contextRef={children.ref}>{children}</vds-navbar-top>;",
      "}",
    ].join("\n");

    const result = compileWithNativePreset(source, {
      filename: "/virtual/layout.tsx",
    });

    assert.match(
      result.code,
      /<vds-navbar-top \.contextRef=\$\{children\.ref\}>\$\{children\}<\/vds-navbar-top>/,
    );
  });

  it("injects SSR light DOM rendering for authored light DOM components", () => {
    const source = [
      "export function LightChild() {",
      "  return <span>child</span>;",
      "}",
      "LightChild.lightDom = true;",
      "export function TestParent() {",
      "  return <LightChild />;",
      "}",
    ].join("\n");

    const result = transformFromAstSync(
      parser.parse(source, { sourceType: "module" }),
      source,
      {
        configFile: false,
        babelrc: false,
        presets: [[nativePreset, { ssr: true }]],
      },
    );

    assert.match(
      result.code,
      /import \{[^}]*__litsxRenderLight[^}]*\} from "@litsx\/core\/elements";/,
    );
    assert.match(
      result.code,
      /return html`<light-child>\$\{__litsxRenderLight\(\)\}<\/light-child>`;/,
    );
  });

  it("injects SSR light DOM rendering for imported authored light DOM components", () => {
    const fixtureDirectory = fs.mkdtempSync(
      path.join(os.tmpdir(), "litsx-ssr-light-dom-import-"),
    );
    const importedFilename = path.join(fixtureDirectory, "LightChild.tsx");
    const entryFilename = path.join(fixtureDirectory, "TestParent.tsx");

    fs.writeFileSync(
      importedFilename,
      [
        "export function LightChild() {",
        "  return <span>child</span>;",
        "}",
        "LightChild.lightDom = true;",
      ].join("\n"),
    );

    const source = [
      'import { LightChild } from "./LightChild.tsx";',
      "export function TestParent() {",
      "  return <LightChild />;",
      "}",
    ].join("\n");

    const result = transformFromAstSync(
      parser.parse(source, { sourceType: "module" }),
      source,
      {
        configFile: false,
        babelrc: false,
        filename: entryFilename,
        presets: [[nativePreset, { ssr: true }]],
      },
    );

    assert.match(
      result.code,
      /import \{[^}]*__litsxRenderLight[^}]*\} from "@litsx\/core\/elements";/,
    );
    assert.match(
      result.code,
      /return html`<light-child>\$\{__litsxRenderLight\(\)\}<\/light-child>`;/,
    );
  });

  it("injects SSR light DOM rendering for core suspense boundaries", () => {
    const source = [
      'import { SuspenseBoundary } from "@litsx/core";',
      "export function TestParent() {",
      "  return <SuspenseBoundary fallback={<span>loading</span>}><article>ready</article></SuspenseBoundary>;",
      "}",
    ].join("\n");

    const result = transformFromAstSync(
      parser.parse(source, { sourceType: "module" }),
      source,
      {
        configFile: false,
        babelrc: false,
        presets: [[nativePreset, { ssr: true }]],
      },
    );

    assert.match(
      result.code,
      /import \{ renderLight \} from "@lit-labs\/ssr-client\/directives\/render-light\.js";/,
    );
    assert.match(
      result.code,
      /<suspense-boundary[\s\S]*>\$\{renderLight\(\)\}<\/suspense-boundary>/,
    );
  });

  it("does not lower React-only wrappers in the native preset", () => {
    const source = [
      "import { forwardRef, memo } from 'react';",
      "export const TestCard = memo(",
      "  forwardRef(function TestCard({ title }, ref) {",
      "    return <label ref={ref}>{title}</label>;",
      "  })",
      ");",
    ].join("\n");

    const result = transformFromAstSync(
      parser.parse(source, { sourceType: "module" }),
      source,
      {
        configFile: false,
        babelrc: false,
        presets: [[nativePreset, { jsxTemplate: false }]],
      },
    );

    assert.match(result.code, /\bmemo\(/);
    assert.match(result.code, /\bforwardRef\(/);
    assert.doesNotMatch(result.code, /useCallbackRef\(this,/);
  });

  it("does not lower React propTypes in the native preset anymore", () => {
    const source = [
      "import PropTypes from 'prop-types';",
      "export function TestCard(props) {",
      "  return <article>{props.title}</article>;",
      "}",
      "TestCard.propTypes = {",
      "  title: PropTypes.string,",
      "};",
    ].join("\n");

    const result = transformFromAstSync(
      parser.parse(source, { sourceType: "module" }),
      source,
      {
        configFile: false,
        babelrc: false,
        presets: [[nativePreset, { jsxTemplate: false }]],
      },
    );

    assert.match(result.code, /TestCard\.propTypes = \{/);
    assert.match(result.code, /import PropTypes from ['"]prop-types['"]/);
    assert.doesNotMatch(result.code, /__litsx_static_properties\(/);
  });

  it("covers a combined native preset path with standard metadata, handlers, refs, and scoped elements", () => {
    const source = [
      "import FancyButton from './FancyButton.js';",
      "import { css, useRef, useState } from '@litsx\/core';",
      "type Props = { label: string; active: boolean };",
      "export function ActionCard({ label, active }: Props) {",
      "  const buttonRef = useRef(null);",
      "  const [count, setCount] = useState(0);",
      "  return <FancyButton ref={buttonRef} label={label} on:click={() => setCount(count + 1)}>{active ? count : 0}</FancyButton>;",
      "}",
      "ActionCard.styles = css`:host { display: block; }`;",
      "ActionCard.properties = { active: { reflect: true } };",
    ].join("\n");

    const result = transformFromAstSync(
      parser.parse(source, {
        sourceType: "module",
        plugins: ["typescript"],
      }),
      source,
      {
        configFile: false,
        babelrc: false,
        filename: "/virtual/ActionCard.tsx",
        presets: [[nativePreset, {}]],
      },
    );

    assert.match(
      result.code,
      /extends ShadowDomMixin\(LitElement\)/,
    );
    assert.match(result.code, /static styles = \[super\.styles \?\? \[\],/);
    assert.match(result.code, /static properties = \{/);
    assert.match(result.code, /reflect: true/);
    assert.match(
      result.code,
      /static elements = \{\s*\.\.\.\(super\.elements \?\? \{\}\),\s*"fancy-button": FancyButton\s*\}/,
    );
    assert.match(result.code, /const buttonRef = useRef\(null\);/);
    assert.match(
      result.code,
      /const \[count, setCount\] = useState\(0\);/,
    );
    assert.match(
      result.code,
      /html`<fancy-button \.ref=\$\{buttonRef\} \.label=\$\{this\.label\} @click=\$\{\(\) => setCount\(count \+ 1\)\}>/,
    );
  }, 20_000);

  it("supports in-memory playground type resolution through the preset", () => {
    const source = `
      type BaseProps = {
        title: string;
        active: boolean;
        payload: Record<string, unknown>;
      };

      type CardProps = Pick<BaseProps, "title" | "active"> & {
        payload: BaseProps["payload"];
      };

      function TestCard(props: CardProps) {
        return <article>{props.title}</article>;
      }
    `;

    const result = transformFromAstSync(
      parser.parse(source, {
        sourceType: "module",
        plugins: ["typescript"],
      }),
      source,
      {
        configFile: false,
        babelrc: false,
        filename: "/virtual/TestCard.tsx",
        presets: [
          [
            nativePreset,
            {
              jsxTemplate: false,
              typeResolutionMode: "in-memory",
              inMemoryFiles: PLAYGROUND_TYPE_FILES,
            },
          ],
        ],
      },
    );

    assert.match(result.code, /title: \{\s*type: String\s*\}/);
    assert.match(result.code, /active: \{\s*type: Boolean\s*\}/);
    assert.match(result.code, /payload: \{\s*type: Object\s*\}/);
  });

  it("lowers native useState through the canonical preset", () => {
    const source = [
      "import { useState } from '@litsx\/core';",
      "export function TestCounter() {",
      "  const [count, setCount] = useState(1);",
      "  return <button @click={() => setCount(count + 1)}>{count}</button>;",
      "}",
    ].join("\n");

    const result = transformFromAstSync(
      parser.parse(source, { sourceType: "module" }),
      source,
      {
        configFile: false,
        babelrc: false,
        presets: [[nativePreset, { jsxTemplate: false }]],
      },
    );

    assert.match(result.code, /class TestCounter extends LitElement/);
    assert.match(
      result.code,
      /import \{[^}]*useState[^}]*renderWithHooks[^}]*\} from ['"]@litsx\/core['"]/,
    );
    assert.doesNotMatch(result.code, /prepareEffects/);
    assert.match(
      result.code,
      /const \[count, setCount\] = useState\(1\);/,
    );
    assert.match(
      result.code,
      /return <button @click=\{\(\) => setCount\(count \+ 1\)\}>\{count\}<\/button>;/,
    );
  });

  it("preserves sibling declarators around native useState through the preset", () => {
    const source = [
      "import { useState } from '@litsx\/core';",
      "export function TestCounter() {",
      "  const label = 'ok', [count, setCount] = useState(0);",
      "  setCount(count + 1);",
      "  return <div>{label}: {count}</div>;",
      "}",
    ].join("\n");

    const result = transformFromAstSync(
      parser.parse(source, { sourceType: "module" }),
      source,
      {
        configFile: false,
        babelrc: false,
        presets: [[nativePreset, { jsxTemplate: false }]],
      },
    );

    assert.match(
      result.code,
      /const label = 'ok',\s*\[count, setCount\] = useState\(0\);/,
    );
  });

  it("preserves local custom hook signatures that call native useState", () => {
    const source = [
      "import { useState } from '@litsx\/core';",
      "function useCounter(initial) {",
      "  const [value, setValue] = useState(initial);",
      "  return [value, setValue];",
      "}",
      "export function TestCounter() {",
      "  const [value, setValue] = useCounter(0);",
      "  return <button @click={() => setValue(value + 1)}>{value}</button>;",
      "}",
    ].join("\n");

    const result = transformFromAstSync(
      parser.parse(source, { sourceType: "module" }),
      source,
      {
        configFile: false,
        babelrc: false,
        presets: [[nativePreset, { jsxTemplate: false }]],
      },
    );

    assert.match(result.code, /function useCounter\(initial\)/);
    assert.match(
      result.code,
      /const \[value, setValue\] = useState\(initial\);/,
    );
    assert.doesNotMatch(result.code, /prepareEffects|_host/);
    assert.match(
      result.code,
      /const \[value, setValue\] = useCounter\(0\);/,
    );
  });

  it("runs native effect hooks inside the generated render boundary", () => {
    const source = [
      "import { useAfterUpdate } from '@litsx\/core';",
      "export function TestCounter() {",
      "  useAfterUpdate(() => {",
      "    this.flag = true;",
      "  }, []);",
      "  return <p>{this.flag}</p>;",
      "}",
    ].join("\n");

    const result = transformFromAstSync(
      parser.parse(source, { sourceType: "module" }),
      source,
      {
        configFile: false,
        babelrc: false,
        presets: [[nativePreset, { jsxTemplate: false }]],
      },
    );

    assert.match(
      result.code,
      /import \{[^}]*useAfterUpdate[^}]*renderWithHooks[^}]*\} from ['"]@litsx\/core['"]/,
    );
    assert.doesNotMatch(result.code, /prepareEffects/);
    assert.match(
      result.code,
      /useAfterUpdate\(\(\) => \{\s*this\.flag = true;\s*}, \[]\);/s,
    );
  });

  it("preserves native custom hook signatures in the preset", () => {
    const source = [
      "import { useStableCallback, useAfterUpdate } from '@litsx\/core';",
      "function useCustom(flag) {",
      "  const callback = useStableCallback(() => flag, [flag]);",
      "  useAfterUpdate(() => flag && callback(), [flag, callback]);",
      "  return callback;",
      "}",
      "export function TestCounter() {",
      "  const value = useCustom(this.flag);",
      "  return <button>{String(value && value())}</button>;",
      "}",
    ].join("\n");

    const result = transformFromAstSync(
      parser.parse(source, { sourceType: "module" }),
      source,
      {
        configFile: false,
        babelrc: false,
        presets: [[nativePreset, { jsxTemplate: false }]],
      },
    );

    assert.match(result.code, /function useCustom\(flag\)/);
    assert.match(
      result.code,
      /const callback = useStableCallback\(\(\) => flag, \[flag\]\);/,
    );
    assert.match(
      result.code,
      /useAfterUpdate\(\(\) => flag && callback\(\), \[flag, callback\]\);/,
    );
    assert.doesNotMatch(result.code, /prepareEffects|_host/);
    assert.match(result.code, /const value = useCustom\(this\.flag\);/);
  });

  it("resolves native useEmit from the render context", () => {
    const source = [
      "import { useEmit } from '@litsx\/core';",
      "export function TestCounter() {",
      "  const emit = useEmit();",
      "  emit('change', this.value, { cancelable: true });",
      "  return <div>{this.value}</div>;",
      "}",
    ].join("\n");

    const result = transformFromAstSync(
      parser.parse(source, { sourceType: "module" }),
      source,
      {
        configFile: false,
        babelrc: false,
        presets: [[nativePreset, { jsxTemplate: false }]],
      },
    );

    assert.doesNotMatch(result.code, /prepareEffects/);
    assert.match(result.code, /const emit = useEmit\(\);/);
    assert.match(
      result.code,
      /emit\('change', this\.value, \{\s*cancelable: true\s*\}\);/,
    );
    assert.match(
      result.code,
      /static \[Symbol\.for\("litsx\.events"\)\] = \{\s*events: \["change"\],\s*complete: true\s*\};/,
    );
    assert.match(
      result.code,
      /static events = \{\s*events: \["change"\],\s*complete: true\s*\};/,
    );
    assert.deepStrictEqual(result.metadata.litsxComponentEvents.TestCounter, {
      events: ["change"],
      complete: true,
    });
  });

  it("discovers events through aliased and namespace useEmit imports", () => {
    const source = [
      "import { useEmit as createEmitter } from '@litsx/core';",
      "import * as core from '@litsx/core';",
      "export function TestAliased() {",
      "  const emit = createEmitter();",
      "  emit('primary-action');",
      "  return <button />;",
      "}",
      "export function TestNamespaced() {",
      "  const emit = core.useEmit();",
      "  emit('url-change');",
      "  return <button />;",
      "}",
    ].join("\n");

    const result = transformFromAstSync(
      parser.parse(source, { sourceType: "module" }),
      source,
      {
        configFile: false,
        babelrc: false,
        presets: [[nativePreset, { jsxTemplate: false }]],
      },
    );

    assert.deepStrictEqual(result.metadata.litsxComponentEvents.TestAliased, {
      events: ["primary-action"],
      complete: true,
    });
    assert.deepStrictEqual(result.metadata.litsxComponentEvents.TestNamespaced, {
      events: ["url-change"],
      complete: true,
    });
  });

  it("preserves explicit public event metadata as the component contract", () => {
    const source = [
      "import { useEmit } from '@litsx/core';",
      "export function TestCounter() {",
      "  const emit = useEmit();",
      "  emit(this.eventName);",
      "  return <button />;",
      "}",
      "TestCounter.events = { events: ['primary-action'], complete: true };",
    ].join("\n");

    const result = transformFromAstSync(
      parser.parse(source, { sourceType: "module" }),
      source,
      {
        configFile: false,
        babelrc: false,
        presets: [[nativePreset, { jsxTemplate: false }]],
      },
    );

    assert.match(
      result.code,
      /static \[Symbol\.for\("litsx\.events"\)\] = \{\s*events: \["primary-action"\],\s*complete: true\s*\};/,
    );
    assert.doesNotMatch(result.code, /static events =/);
    assert.match(
      result.code,
      /TestCounter\.events = \{\s*events: \['primary-action'\],\s*complete: true\s*\};/,
    );
    assert.deepStrictEqual(result.metadata.litsxComponentEvents.TestCounter, {
      events: ["primary-action"],
      complete: true,
      explicit: true,
    });
  });

  it("lowers native useRef DOM bindings through the canonical preset", () => {
    const source = [
      "import { useRef } from '@litsx\/core';",
      "export function TestCounter() {",
      "  const buttonRef = useRef(null);",
      "  return <button ref={buttonRef}>Click</button>;",
      "}",
    ].join("\n");

    const result = transformFromAstSync(
      parser.parse(source, { sourceType: "module" }),
      source,
      {
        configFile: false,
        babelrc: false,
        presets: [[nativePreset, { jsxTemplate: false }]],
      },
    );

    assert.match(
      result.code,
      /import \{[^}]*useRef[^}]*\} from ['"]@litsx\/core['"]/,
    );
    assert.match(result.code, /renderWithHooks\(this, \(\) => \{/);
    assert.doesNotMatch(result.code, /prepareEffects/);
    assert.match(result.code, /const buttonRef = useRef\(null\);/);
    assert.match(result.code, /<button ref=\{buttonRef\}>Click<\/button>/);
    assert.doesNotMatch(
      result.code,
      /data-ref|querySelector|_buttonRefElement/,
    );
  });

  it("keeps non-DOM native useRef bindings as mutable refs through the preset", () => {
    const source = [
      "import { useRef } from '@litsx\/core';",
      "export function TestCounter() {",
      "  const workerRef = useRef(null);",
      "  workerRef.value = 'ok';",
      "  return <div>{workerRef.value}</div>;",
      "}",
    ].join("\n");

    const result = transformFromAstSync(
      parser.parse(source, { sourceType: "module" }),
      source,
      {
        configFile: false,
        babelrc: false,
        presets: [[nativePreset, { jsxTemplate: false }]],
      },
    );

    assert.match(result.code, /const workerRef = useRef\(null\);/);
    assert.match(result.code, /workerRef\.value = 'ok';/);
    assert.doesNotMatch(result.code, /get workerRef\(\)/);
    assert.doesNotMatch(result.code, /data-ref="/);
  });

  it("does not follow external playground imports when using in-memory mode", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "litsx-playground-"));
    const typesPath = path.join(tempDir, "types.ts");
    const componentPath = path.join(tempDir, "TestCard.tsx");

    fs.writeFileSync(
      typesPath,
      [
        "export interface CardProps {",
        "  title: string;",
        "  active: boolean;",
        "}",
      ].join("\n"),
    );

    const source = [
      "import type { CardProps } from './types';",
      "function TestCard({ title, active }: CardProps) {",
      "  return <article>{title} {active ? 'on' : 'off'}</article>;",
      "}",
    ].join("\n");

    const result = transformFromAstSync(
      parser.parse(source, {
        sourceType: "module",
        plugins: ["typescript"],
      }),
      source,
      {
        configFile: false,
        babelrc: false,
        filename: componentPath,
        presets: [
          [
            nativePreset,
            {
              jsxTemplate: false,
              typeResolutionMode: "in-memory",
              inMemoryFiles: PLAYGROUND_TYPE_FILES,
            },
          ],
        ],
      },
    );

    assert.match(result.code, /title: \{\s*type: String\s*\}/);
    assert.match(result.code, /active: \{\s*type: String\s*\}/);
  });
});
