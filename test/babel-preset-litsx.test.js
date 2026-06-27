import assert from "assert";
import fs from "fs";
import os from "os";
import path from "path";
import babelCore from "@babel/core";
import { beforeAll, describe, it } from "vitest";

import parser from "../packages/babel-parser-litsx/src/index.js";
import { interopDefault } from "./helpers/interop-default.js";
import { PLAYGROUND_TYPE_FILES } from "./helpers/playground-virtual-types.js";

const { transformFromAstSync } = babelCore;

let nativePreset;
let createLitsxPresetPlugins;
let detectLitsxSourceFeatures;

beforeAll(async () => {
  const [presetMod] = await Promise.all([
    import("../packages/babel-preset-litsx/src/index.js"),
  ]);

  nativePreset = interopDefault(presetMod);
  createLitsxPresetPlugins = presetMod.createLitsxPresetPlugins;
  detectLitsxSourceFeatures = presetMod.detectLitsxSourceFeatures;
});

describe("@litsx/babel-preset-litsx", () => {
  it("defaults to final html template lowering", () => {
    const source = [
      "export const Greeting = ({ label }) => {",
      "  return <button>{label}</button>;",
      "};",
    ].join("\n");

    const result = transformFromAstSync(parser.parse(source, { sourceType: "module" }), source, {
      configFile: false,
      babelrc: false,
      presets: [[nativePreset, {}]],
    });

    assert.match(result.code, /import \{ LitElement, html \} from "lit";/);
    assert.match(result.code, /return html`<button>\$\{this\.label\}<\/button>`;/);
  });

  it("matches the direct preset plugin factory", () => {
    const source = [
      "import FancyButton from './FancyButton.js';",
      "export const Greeting = ({ label = 'Save' }) => {",
      "  return <FancyButton .label={label} @click={save} />;",
      "};",
    ].join("\n");

    const presetResult = transformFromAstSync(parser.parse(source, { sourceType: "module" }), source, {
      configFile: false,
      babelrc: false,
      presets: [[nativePreset, {}]],
    });

    const pluginResult = transformFromAstSync(parser.parse(source, { sourceType: "module" }), source, {
      configFile: false,
      babelrc: false,
      plugins: createLitsxPresetPlugins({}),
    });

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

    const result = transformFromAstSync(parser.parse(source, { sourceType: "module" }), source, {
      configFile: false,
      babelrc: false,
      filename: "/virtual/stable-ids.litsx",
      presets: [[nativePreset, { jsxTemplate: false }]],
    });

    const ids = [...result.code.matchAll(/useStableId\((?:this|_host), "([^"]+)"\)/g)]
      .map((match) => match[1]);

    assert.match(result.code, /function useResourceKey\(_host\)/);
    assert.strictEqual(ids.length, 2);
    assert.notStrictEqual(ids[0], ids[1]);
    assert.ok(ids.every((id) => id.startsWith("litsx-stable-")));
  });

  it("compiles local structural hooks to host middleware reads", () => {
    const source = [
      'import { defineHook } from "@litsx/core";',
      "const useLocale = defineHook({",
      "  use(_host, _state, args) {",
      "    return args[0];",
      "  },",
      "});",
      "export function Greeting() {",
      "  const locale = useLocale('en');",
      "  return <div>{locale}</div>;",
      "}",
    ].join("\n");

    const result = transformFromAstSync(parser.parse(source, { sourceType: "module" }), source, {
      configFile: false,
      babelrc: false,
      filename: "/virtual/structural.litsx",
      presets: [[nativePreset, { jsxTemplate: false }]],
    });

    assert.match(result.code, /import \{[^}]*defineHook[^}]*useStructuralEntry[^}]*HostMiddlewareMixin[^}]*\} from "@litsx\/core";|import \{[^}]*HostMiddlewareMixin[^}]*defineHook[^}]*useStructuralEntry[^}]*\} from "@litsx\/core";/);
    assert.match(result.code, /class Greeting extends HostMiddlewareMixin\(LitElement\)/);
    assert.match(result.code, /static structuralEntries = \[/);
    assert.match(result.code, /callsiteIndex: 0/);
    assert.match(result.code, /useStructuralEntry\(this, 0, "litsx-structural-[^"]+", useLocale, \['en'\]|\["en"\]/);
    assert.match(result.code, /callsitePath: \["litsx-structural-[^"]+"\]/);
  });

  it("compiles static-only structural hooks without host lifecycle wrapping", () => {
    const source = [
      'import { defineHook } from "@litsx/core";',
      "const useStaticResource = defineHook({",
      "  static(name, meta) {",
      "    return { key: name, path: meta.callsitePath };",
      "  },",
      "  use(name, state, meta) {",
      "    return `${state.static.key}:${meta.callsitePath.length}`;",
      "  },",
      "});",
      "export function StaticCard() {",
      "  static styles = `:host { display: block; }`;",
      "  const value = useStaticResource('catalog');",
      "  return <div>{value}</div>;",
      "}",
    ].join("\n");

    const result = transformFromAstSync(parser.parse(source, { sourceType: "module" }), source, {
      configFile: false,
      babelrc: false,
      filename: "/virtual/static-structural.litsx",
      presets: [[nativePreset, { jsxTemplate: false }]],
    });

    assert.match(result.code, /import \{[^}]*useStructuralStaticEntry[^}]*defineHook[^}]*\} from "@litsx\/core";|import \{[^}]*defineHook[^}]*useStructuralStaticEntry[^}]*\} from "@litsx\/core";/);
    assert.doesNotMatch(result.code, /HostMiddlewareMixin/);
    assert.match(result.code, /class StaticCard extends (?:LitsxStaticHoistsMixin\(LitElement\)|LitElement)/);
    assert.match(result.code, /static structuralStaticEntries = \[/);
    assert.match(result.code, /args: \['catalog'\]|\["catalog"\]/);
    assert.match(result.code, /useStructuralStaticEntry\(this\.constructor, 0, "litsx-structural-[^"]+", useStaticResource, \['catalog'\]|\["catalog"\]/);
    assert.match(result.code, /static get styles\(\)/);
  });

  it("compiles mixed structural hooks through the instance middleware path", () => {
    const source = [
      'import { defineHook } from "@litsx/core";',
      "const useMixedResource = defineHook({",
      "  static(name) { return { key: name }; },",
      "  setup(name, staticState) { return { label: `${staticState.key}:${name}` }; },",
      "  middlewares: {",
      "    connectedCallback(next, state) {",
      "      state.instance.connected = true;",
      "      return next();",
      "    },",
      "  },",
      "  use(name, state) {",
      "    return `${state.static.key}:${state.instance.label}:${name}`;",
      "  },",
      "});",
      "export function MixedCard() {",
      "  const value = useMixedResource('catalog');",
      "  return <div>{value}</div>;",
      "}",
    ].join("\n");

    const result = transformFromAstSync(parser.parse(source, { sourceType: "module" }), source, {
      configFile: false,
      babelrc: false,
      filename: "/virtual/mixed-structural.litsx",
      presets: [[nativePreset, { jsxTemplate: false }]],
    });

    assert.match(result.code, /class MixedCard extends HostMiddlewareMixin\(LitElement\)/);
    assert.match(result.code, /static structuralEntries = \[/);
    assert.doesNotMatch(result.code, /static structuralStaticEntries/);
    assert.match(result.code, /useStructuralEntry\(this, 0, "litsx-structural-[^"]+", useMixedResource, \['catalog'\]|\["catalog"\]/);
  });

  it("compiles structural hooks used transitively through local custom hooks", () => {
    const source = [
      'import { defineHook } from "@litsx/core";',
      "const useResource = defineHook({",
      "  use(_host, _state, args) {",
      "    return args[0];",
      "  },",
      "});",
      "function useMessage(name) {",
      "  return useResource(name);",
      "}",
      "export function Greeting() {",
      "  const message = useMessage('hello');",
      "  return <div>{message}</div>;",
      "}",
    ].join("\n");

    const result = transformFromAstSync(parser.parse(source, { sourceType: "module" }), source, {
      configFile: false,
      babelrc: false,
      filename: "/virtual/structural-custom.litsx",
      presets: [[nativePreset, { jsxTemplate: false }]],
    });

    assert.match(result.code, /function useMessage\(_host, name\)/);
    assert.match(result.code, /static structuralEntries = \[/);
    assert.match(result.code, /useStructuralEntry\(_host, 0, "litsx-structural-[^"]+", useResource, \[name\]/);
    assert.match(result.code, /callsitePath: \["useMessage", "litsx-structural-[^"]+"\]/);
    assert.match(result.code, /class Greeting extends HostMiddlewareMixin\(LitElement\)/);
    assert.match(result.code, /useMessage\(this, 'hello'\)|useMessage\(this, "hello"\)/);
    const staticEntries = result.code.match(/static structuralEntries = \[([\s\S]*?)\];/)?.[1] ?? "";
    assert.strictEqual([...staticEntries.matchAll(/definition: useResource/g)].length, 1);
  });

  it("compiles imported structural hooks discovered from authored modules", () => {
    const source = [
      'import { useLocale } from "./hooks.litsx";',
      "export function Greeting() {",
      "  const locale = useLocale('en');",
      "  return <div>{locale}</div>;",
      "}",
    ].join("\n");
    const hooksSource = [
      'import { defineHook } from "@litsx/core";',
      "export const useLocale = defineHook({",
      "  use(_host, _state, args) {",
      "    return args[0];",
      "  },",
      "});",
    ].join("\n");

    const result = transformFromAstSync(parser.parse(source, { sourceType: "module" }), source, {
      configFile: false,
      babelrc: false,
      filename: "/virtual/imported-structural.litsx",
      presets: [[nativePreset, {
        jsxTemplate: false,
        inMemoryFiles: {
          "/virtual/hooks.litsx": hooksSource,
        },
      }]],
    });

    assert.match(result.code, /class Greeting extends HostMiddlewareMixin\(LitElement\)/);
    assert.match(result.code, /static structuralEntries = \[/);
    assert.match(result.code, /useStructuralEntry\(this, 0, "litsx-structural-[^"]+", useLocale, \['en'\]|\["en"\]/);
  });

  it("compiles imported static-only structural hooks without host lifecycle wrapping", () => {
    const source = [
      'import { useStaticLocale } from "./hooks.litsx";',
      "export function Greeting() {",
      "  const locale = useStaticLocale('en');",
      "  return <div>{locale}</div>;",
      "}",
    ].join("\n");
    const hooksSource = [
      'import { defineHook } from "@litsx/core";',
      "export const useStaticLocale = defineHook({",
      "  static(locale) {",
      "    return { locale };",
      "  },",
      "  use(locale, state) {",
      "    return `${state.static.locale}:${locale}`;",
      "  },",
      "});",
    ].join("\n");

    const result = transformFromAstSync(parser.parse(source, { sourceType: "module" }), source, {
      configFile: false,
      babelrc: false,
      filename: "/virtual/imported-static-structural.litsx",
      presets: [[nativePreset, {
        jsxTemplate: false,
        inMemoryFiles: {
          "/virtual/hooks.litsx": hooksSource,
        },
      }]],
    });

    assert.doesNotMatch(result.code, /HostMiddlewareMixin/);
    assert.match(result.code, /static structuralStaticEntries = \[/);
    assert.match(result.code, /useStructuralStaticEntry\(this\.constructor, 0, "litsx-structural-[^"]+", useStaticLocale, \['en'\]|\["en"\]/);
  });

  it("compiles namespace imported structural hooks discovered from authored modules", () => {
    const source = [
      'import * as hooks from "./hooks.litsx";',
      "export function Greeting() {",
      "  const locale = hooks.useLocale('en');",
      "  return <div>{locale}</div>;",
      "}",
    ].join("\n");
    const hooksSource = [
      'import { defineHook } from "@litsx/core";',
      "const useLocale = defineHook({",
      "  use(_host, _state, args) {",
      "    return args[0];",
      "  },",
      "});",
      "export { useLocale };",
    ].join("\n");

    const result = transformFromAstSync(parser.parse(source, { sourceType: "module" }), source, {
      configFile: false,
      babelrc: false,
      filename: "/virtual/imported-namespace-structural.litsx",
      presets: [[nativePreset, {
        jsxTemplate: false,
        inMemoryFiles: {
          "/virtual/hooks.litsx": hooksSource,
        },
      }]],
    });

    assert.match(result.code, /class Greeting extends HostMiddlewareMixin\(LitElement\)/);
    assert.match(result.code, /static structuralEntries = \[/);
    assert.match(result.code, /useStructuralEntry\(this, 0, "litsx-structural-[^"]+", hooks\.useLocale, \['en'\]|\["en"\]/);
  });

  it("resolves imported structural hooks through TypeScript path aliases", () => {
    const source = [
      'import { useLocale } from "@/hooks.litsx";',
      "export function Greeting() {",
      "  const locale = useLocale('en');",
      "  return <div>{locale}</div>;",
      "}",
    ].join("\n");
    const hooksSource = [
      'import { defineHook } from "@litsx/core";',
      "export const useLocale = defineHook({",
      "  use(_host, _state, args) {",
      "    return args[0];",
      "  },",
      "});",
    ].join("\n");

    const result = transformFromAstSync(parser.parse(source, { sourceType: "module" }), source, {
      configFile: false,
      babelrc: false,
      filename: "/virtual/src/path-alias-structural.litsx",
      presets: [[nativePreset, {
        jsxTemplate: false,
        compilerOptions: {
          baseUrl: "/virtual/src",
          paths: {
            "@/*": ["*"],
          },
        },
        inMemoryFiles: {
          "/virtual/src/hooks.litsx": hooksSource,
        },
      }]],
    });

    assert.match(result.code, /class Greeting extends HostMiddlewareMixin\(LitElement\)/);
    assert.match(result.code, /static structuralEntries = \[/);
    assert.match(result.code, /useStructuralEntry\(this, 0, "litsx-structural-[^"]+", useLocale, \['en'\]|\["en"\]/);
  });

  it("wraps hosts that call imported custom hooks containing structural hooks", () => {
    const source = [
      'import { useMessage } from "./hooks.litsx";',
      "export function Greeting() {",
      "  const message = useMessage('hello');",
      "  return <div>{message}</div>;",
      "}",
    ].join("\n");
    const hooksSource = [
      'import { defineHook } from "@litsx/core";',
      "const useResource = defineHook({",
      "  use(_host, _state, args) {",
      "    return args[0];",
      "  },",
      "});",
      "export function useMessage(name) {",
      "  return useResource(name);",
      "}",
    ].join("\n");

    const result = transformFromAstSync(parser.parse(source, { sourceType: "module" }), source, {
      configFile: false,
      babelrc: false,
      filename: "/virtual/imported-structural-custom.litsx",
      presets: [[nativePreset, {
        jsxTemplate: false,
        inMemoryFiles: {
          "/virtual/hooks.litsx": hooksSource,
        },
      }]],
    });

    assert.match(result.code, /class Greeting extends HostMiddlewareMixin\(LitElement\)/);
    assert.match(result.code, /static structuralEntries = \[\s*...getStructuralHookEntries\(useMessage\)/);
    assert.match(result.code, /useMessage\(this, 'hello'\)|useMessage\(this, "hello"\)/);
    assert.doesNotMatch(result.code, /useStructuralEntry\(this, 0, "litsx-structural-[^"]+", useMessage/);
  });

  it("attaches structural metadata to custom hooks that contain structural hooks", () => {
    const source = [
      'import { defineHook } from "@litsx/core";',
      "const useResource = defineHook({",
      "  use(_host, _state, args) {",
      "    return args[0];",
      "  },",
      "});",
      "export function useMessage(name) {",
      "  return useResource(name);",
      "}",
    ].join("\n");

    const result = transformFromAstSync(parser.parse(source, { sourceType: "module" }), source, {
      configFile: false,
      babelrc: false,
      filename: "/virtual/hooks-with-metadata.litsx",
      presets: [[nativePreset, { jsxTemplate: false }]],
    });

    assert.match(result.code, /import \{[^}]*defineHook[^}]*useStructuralEntry[^}]*defineStructuralHookEntries[^}]*\} from "@litsx\/core";|import \{[^}]*defineStructuralHookEntries[^}]*defineHook[^}]*useStructuralEntry[^}]*\} from "@litsx\/core";/);
    assert.match(result.code, /export function useMessage\(_host, name\)/);
    assert.match(result.code, /defineStructuralHookEntries\(useMessage, \[/);
    assert.match(result.code, /useStructuralEntry\(_host, 0, "litsx-structural-[^"]+", useResource, \[name\]/);
  });

  it("keeps structural callsite identity stable across repeated transforms", () => {
    const source = [
      'import { defineHook } from "@litsx/core";',
      "const useResource = defineHook({",
      "  use(_host, _state, args) {",
      "    return args[0];",
      "  },",
      "});",
      "export function Greeting() {",
      "  const first = useResource('a');",
      "  const second = useResource('b');",
      "  return <div>{first}{second}</div>;",
      "}",
    ].join("\n");
    const options = {
      configFile: false,
      babelrc: false,
      filename: "/virtual/structural-stability.litsx",
      presets: [[nativePreset, { jsxTemplate: false }]],
    };

    const first = transformFromAstSync(parser.parse(source, { sourceType: "module" }), source, options);
    const second = transformFromAstSync(parser.parse(source, { sourceType: "module" }), source, options);
    const firstIds = [...first.code.matchAll(/callsiteId: "(litsx-structural-[^"]+)"/g)]
      .map((match) => match[1]);
    const secondIds = [...second.code.matchAll(/callsiteId: "(litsx-structural-[^"]+)"/g)]
      .map((match) => match[1]);

    assert.strictEqual(firstIds.length, 2);
    assert.deepStrictEqual(firstIds, secondIds);
    assert.notStrictEqual(firstIds[0], firstIds[1]);
  });

  it("keeps structural callsite identity and paths consistent for SSR and client transforms", () => {
    const source = [
      'import { defineHook } from "@litsx/core";',
      "const useResource = defineHook({",
      "  use(_host, _state, args) {",
      "    return args[0];",
      "  },",
      "});",
      "const useScoped = defineHook({",
      "  use(_host, _state, args) {",
      "    return useResource(`scope:${args[0]}`);",
      "  },",
      "});",
      "export function Panel({ name = 'checkout' }) {",
      "  const value = useScoped(name);",
      "  return <div>{value}</div>;",
      "}",
    ].join("\n");
    const filename = "/virtual/ssr-client-structural.litsx";
    const transform = () => transformFromAstSync(parser.parse(source, { sourceType: "module" }), source, {
      configFile: false,
      babelrc: false,
      filename,
      presets: [[nativePreset, { jsxTemplate: false }]],
    });

    const ssr = transform();
    const client = transform();
    const getEntries = (code) => [...code.matchAll(/callsiteId: "(litsx-structural-[^"]+)"[\s\S]*?callsitePath: \[([^\]]+)\]/g)]
      .map((match) => ({
        id: match[1],
        path: match[2],
      }));

    assert.deepStrictEqual(getEntries(ssr.code), getEntries(client.code));
    assert.match(ssr.code, /callsitePath: \["useScoped", "use", "litsx-structural-[^"]+"\]/);
    assert.match(ssr.code, /callsitePath: \["litsx-structural-[^"]+"\]/);
  });

  it("compiles structural hooks nested inside defineHook use readers", () => {
    const source = [
      'import { defineHook } from "@litsx/core";',
      "const useInner = defineHook({",
      "  use(_host, _state, args) {",
      "    return args[0];",
      "  },",
      "});",
      "const useOuter = defineHook({",
      "  use(host, _state, args) {",
      "    return useInner(args[0]);",
      "  },",
      "});",
      "export function Greeting() {",
      "  const value = useOuter('ok');",
      "  return <div>{value}</div>;",
      "}",
    ].join("\n");

    const result = transformFromAstSync(parser.parse(source, { sourceType: "module" }), source, {
      configFile: false,
      babelrc: false,
      filename: "/virtual/nested-structural.litsx",
      presets: [[nativePreset, { jsxTemplate: false }]],
    });

    assert.match(result.code, /use: function \(host, _state, args\)|use\(host, _state, args\)/);
    assert.match(result.code, /static structuralEntries = \[/);
    assert.match(result.code, /callsiteIndex: 0/);
    assert.match(result.code, /callsiteIndex: 1/);
    assert.match(result.code, /useStructuralEntry\(host, 0, "litsx-structural-[^"]+", useInner, \[args\[0\]\]/);
    assert.match(result.code, /callsitePath: \["useOuter", "use", "litsx-structural-[^"]+"\]/);
    assert.match(result.code, /useStructuralEntry\(this, 1, "litsx-structural-[^"]+", useOuter, \['ok'\]|\["ok"\]/);
  });

  it("compiles the structural hooks authoring fixture end-to-end", () => {
    const fixturePath = path.resolve("test/fixtures/structural-hooks/consumer.litsx");
    const hooksPath = path.resolve("test/fixtures/structural-hooks/resource-hooks.litsx");
    const source = fs.readFileSync(fixturePath, "utf8");
    const hooksSource = fs.readFileSync(hooksPath, "utf8");

    const result = transformFromAstSync(parser.parse(source, { sourceType: "module" }), source, {
      configFile: false,
      babelrc: false,
      filename: fixturePath,
      presets: [[nativePreset, { jsxTemplate: false }]],
    });
    const hooksResult = transformFromAstSync(parser.parse(hooksSource, { sourceType: "module" }), hooksSource, {
      configFile: false,
      babelrc: false,
      filename: hooksPath,
      presets: [[nativePreset, { jsxTemplate: false }]],
    });

    assert.match(result.code, /import \{ useScopedResource \} from "\.\/resource-hooks\.litsx";/);
    assert.match(result.code, /class ResourceConsumer extends HostMiddlewareMixin\(LitElement\)/);
    assert.match(result.code, /static structuralEntries = \[\{\s*id: "litsx-structural-[^"]+"/);
    assert.match(result.code, /definition: useScopedResource/);
    assert.match(result.code, /useStructuralEntry\(this, 0, "litsx-structural-[^"]+", useScopedResource, \[this\.name\]/);
    assert.match(hooksResult.code, /defineStructuralHookEntries\(useScopedResource, \[/);
    assert.match(hooksResult.code, /useStructuralEntry\(_host, 0, "litsx-structural-[^"]+", useResource, \[`scope:\$\{args\[0\]\}`\]/);
  });

  it("rejects structural hook aliases so callsites stay static", () => {
    const source = [
      'import { defineHook } from "@litsx/core";',
      "const useLocale = defineHook({",
      "  use(_host) { return 'en'; },",
      "});",
      "const useAlias = useLocale;",
      "export function Greeting() {",
      "  return <div>{useAlias()}</div>;",
      "}",
    ].join("\n");

    assert.throws(
      () => transformFromAstSync(parser.parse(source, { sourceType: "module" }), source, {
        configFile: false,
        babelrc: false,
        filename: "/virtual/invalid-structural.litsx",
        presets: [[nativePreset, { jsxTemplate: false }]],
      }),
      /cannot be created through an alias/,
    );
  });

  it("rejects dynamic structural hook selection so callsites stay static", () => {
    const source = [
      'import { defineHook } from "@litsx/core";',
      "const useLocale = defineHook({ use(_host) { return 'en'; } });",
      "const useTheme = defineHook({ use(_host) { return 'dark'; } });",
      "const useSelected = ready ? useLocale : useTheme;",
      "export function Greeting() {",
      "  return <div>{useSelected()}</div>;",
      "}",
    ].join("\n");

    assert.throws(
      () => transformFromAstSync(parser.parse(source, { sourceType: "module" }), source, {
        configFile: false,
        babelrc: false,
        filename: "/virtual/invalid-dynamic-structural.litsx",
        presets: [[nativePreset, { jsxTemplate: false }]],
      }),
      /cannot be created through an alias/,
    );
  });

  it("rejects structural hooks stored in containers", () => {
    const objectSource = [
      'import { defineHook } from "@litsx/core";',
      "const useLocale = defineHook({ use(_host) { return 'en'; } });",
      "const hooks = { useLocale };",
      "export function Greeting() { return <div />; }",
    ].join("\n");
    const arraySource = [
      'import { defineHook } from "@litsx/core";',
      "const useLocale = defineHook({ use(_host) { return 'en'; } });",
      "const hooks = [useLocale];",
      "export function Greeting() { return <div />; }",
    ].join("\n");

    for (const source of [objectSource, arraySource]) {
      assert.throws(
        () => transformFromAstSync(parser.parse(source, { sourceType: "module" }), source, {
          configFile: false,
          babelrc: false,
          filename: "/virtual/invalid-container-structural.litsx",
          presets: [[nativePreset, { jsxTemplate: false }]],
        }),
        /cannot be stored in object or array containers/,
      );
    }
  });

  it("rejects computed namespace access for imported structural hooks", () => {
    const source = [
      'import * as hooks from "./hooks.litsx";',
      "const name = 'useLocale';",
      "export function Greeting() {",
      "  return <div>{hooks[name]('en')}</div>;",
      "}",
    ].join("\n");
    const hooksSource = [
      'import { defineHook } from "@litsx/core";',
      "export const useLocale = defineHook({ use(_host, _state, args) { return args[0]; } });",
    ].join("\n");

    assert.throws(
      () => transformFromAstSync(parser.parse(source, { sourceType: "module" }), source, {
        configFile: false,
        babelrc: false,
        filename: "/virtual/invalid-computed-namespace-structural.litsx",
        presets: [[nativePreset, {
          jsxTemplate: false,
          inMemoryFiles: {
            "/virtual/hooks.litsx": hooksSource,
          },
        }]],
      }),
      /must be accessed with a static property/,
    );
  });

  it("detects source features so the compiler can skip unnecessary native plugin passes", () => {
    const plainSource = [
      "export const Greeting = ({ label }) => {",
      "  return <button>{label}</button>;",
      "};",
    ].join("\n");
    const featureSource = [
      "import FancyButton from './FancyButton.js';",
      "import { useRef, useState } from '@litsx\/core';",
      "export function Greeting({ label }) {",
      "  const ref = useRef(null);",
      "  const [count] = useState(0);",
      "  return <FancyButton ref={ref}>{label}{count}</FancyButton>;",
      "}",
    ].join("\n");

    assert.deepStrictEqual(detectLitsxSourceFeatures(plainSource, {}), {
      hooks: false,
      domRefs: false,
      scopedElements: false,
    });

    assert.deepStrictEqual(detectLitsxSourceFeatures(featureSource, {}), {
      hooks: true,
      domRefs: true,
      scopedElements: true,
    });

    assert.strictEqual(
      detectLitsxSourceFeatures('import { useStableId } from "@litsx/core"; useStableId();', {}).hooks,
      true,
    );

    assert.strictEqual(
      detectLitsxSourceFeatures('import { defineHook } from "@litsx/core"; defineHook({});', {}).hooks,
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
        'function useFormat(value) { return String(value); } export function App() { return useFormat("x"); }',
        {},
      ).hooks,
      false,
    );

    assert.strictEqual(
      detectLitsxSourceFeatures('import type { useDemo } from "./types";', {}).hooks,
      false,
    );

    assert.deepStrictEqual(
      detectLitsxSourceFeatures(
        [
          "export function Greeting() {",
          "  static lightDom = true;",
          "  return <div>ready</div>;",
          "}",
        ].join("\n"),
        {},
      ),
      {
        hooks: false,
        domRefs: false,
        scopedElements: true,
      },
    );

    assert.strictEqual(
      createLitsxPresetPlugins({}, detectLitsxSourceFeatures(plainSource, {})).length,
      3,
    );
    assert.strictEqual(
      createLitsxPresetPlugins({}, detectLitsxSourceFeatures(featureSource, {})).length,
      6,
    );
  });

  it("can disable final template lowering", () => {
    const source = [
      "export const Greeting = ({ label }) => {",
      "  return <button @click={save}>{label}</button>;",
      "};",
    ].join("\n");

    const result = transformFromAstSync(parser.parse(source, { sourceType: "module" }), source, {
      configFile: false,
      babelrc: false,
      presets: [[nativePreset, { jsxTemplate: false }]],
    });

    assert.match(result.code, /class Greeting extends LitElement/);
    assert.match(result.code, /return <button @click=\{save\}>\{this\.label\}<\/button>;/);
    assert.doesNotMatch(result.code, /html`/);
  });

  it("keeps top-level lowercase helpers as plain functions and only lowers their JSX", () => {
    const source = [
      "function renderHelperWithArgs(alpha, beta, gamma) {",
      "  return <p>{alpha}{beta}{gamma}</p>;",
      "}",
      "export const Demo = () => {",
      "  return <section>{renderHelperWithArgs('a', 'b', 'c')}</section>;",
      "};",
    ].join("\n");

    const result = transformFromAstSync(parser.parse(source, { sourceType: "module" }), source, {
      configFile: false,
      babelrc: false,
      presets: [[nativePreset, {}]],
    });

    assert.match(result.code, /function renderHelperWithArgs\(alpha, beta, gamma\) \{\s*return html`<p>\$\{alpha\}\$\{beta\}\$\{gamma\}<\/p>`;\s*\}/);
    assert.match(result.code, /class Demo extends LitElement/);
    assert.doesNotMatch(result.code, /class renderHelperWithArgs extends/);
  });

  it("does not promote named lowercase exports to authored components", () => {
    const source = [
      "export function renderHelper() {",
      "  return <p>ok</p>;",
      "}",
    ].join("\n");

    const result = transformFromAstSync(parser.parse(source, { sourceType: "module" }), source, {
      configFile: false,
      babelrc: false,
      presets: [[nativePreset, {}]],
    });

    assert.match(result.code, /export function renderHelper\(\) \{\s*return html`<p>ok<\/p>`;\s*\}/);
    assert.doesNotMatch(result.code, /class renderHelper extends/);
  });

  it("can be consumed through createLitsxPresetPlugins directly", () => {
    const source = [
      "export const Greeting = ({ label }) => {",
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
      }
    );

    const pluginFactoryResult = transformFromAstSync(
      parser.parse(source, { sourceType: "module" }),
      source,
      {
        configFile: false,
        babelrc: false,
        plugins: createLitsxPresetPlugins({ jsxTemplate: false }),
      }
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
        presets: [[nativePreset, {}]],
      }
    );

    assert.match(result.code, /class TypedForm extends ShadowDomMixin\(LitElement\)/);
    assert.match(
      result.code,
      /static properties = \{[\s\S]*label: \{[\s\S]*type: String[\s\S]*count: \{[\s\S]*type: Number/s
    );
    assert.match(result.code, /static elements = \{\s*"fancy-button": FancyButton/s);
    assert.match(result.code, /html`/);
  }, 20000);

  it("does not lower React-only wrappers in the native preset", () => {
    const source = [
      "import { forwardRef, memo } from 'react';",
      "export const Card = memo(",
      "  forwardRef(function Card({ title }, ref) {",
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
      }
    );

    assert.match(result.code, /\bmemo\(/);
    assert.match(result.code, /\bforwardRef\(/);
    assert.doesNotMatch(result.code, /useCallbackRef\(this,/);
  });

  it("does not lower React propTypes in the native preset anymore", () => {
    const source = [
      "import PropTypes from 'prop-types';",
      "export function Card(props) {",
      "  return <article>{props.title}</article>;",
      "}",
      "Card.propTypes = {",
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
      }
    );

    assert.match(result.code, /Card\.propTypes = \{/);
    assert.match(result.code, /import PropTypes from ['"]prop-types['"]/);
    assert.doesNotMatch(result.code, /__litsx_static_properties\(/);
  });

  it("covers a combined native preset path with static hoists, handlers, refs, and scoped elements", () => {
    const source = [
      "import FancyButton from './FancyButton.js';",
      "import { useRef, useState } from '@litsx\/core';",
      "type Props = { label: string; active: boolean };",
      "export function ActionCard({ label, active }: Props) {",
      "  const buttonRef = useRef(null);",
      "  const [count, setCount] = useState(0);",
      "  static styles = `:host { display: block; }`;",
      "  static properties = { active: { reflect: true } };",
      "  return <FancyButton ref={buttonRef} .label={label} @click={() => setCount(count + 1)}>{active ? count : 0}</FancyButton>;",
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
        filename: "/virtual/ActionCard.tsx",
        presets: [[nativePreset, {}]],
      }
    );

    assert.match(result.code, /extends ShadowDomMixin\(LitsxStaticHoistsMixin\(LitElement\)\)|extends LitsxStaticHoistsMixin\(ShadowDomMixin\(LitElement\)\)/);
    assert.match(result.code, /static get styles\(\)/);
    assert.match(result.code, /static get properties\(\)/);
    assert.match(result.code, /reflect: true/);
    assert.match(result.code, /static elements = \{\s*"fancy-button": FancyButton\s*\}/);
    assert.match(result.code, /const buttonRef = useRef\(this, null\);/);
    assert.match(result.code, /const \[count, setCount\] = useState\(this, 0\);/);
    assert.match(result.code, /html`<fancy-button \.ref=\$\{buttonRef\} \.label=\$\{this\.label\} @click=\$\{\(\) => setCount\(count \+ 1\)\}>/);
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

      function Card(props: CardProps) {
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
        filename: "/virtual/Card.tsx",
        presets: [[nativePreset, {
          jsxTemplate: false,
          typeResolutionMode: "in-memory",
          inMemoryFiles: PLAYGROUND_TYPE_FILES,
        }]],
      }
    );

    assert.match(result.code, /title: \{\s*type: String\s*\}/);
    assert.match(result.code, /active: \{\s*type: Boolean\s*\}/);
    assert.match(result.code, /payload: \{\s*type: Object\s*\}/);
  });

  it("lowers native useState through the canonical preset", () => {
    const source = [
      "import { useState } from '@litsx\/core';",
      "export function Counter() {",
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
      }
    );

    assert.match(result.code, /class Counter extends LitElement/);
    assert.match(
      result.code,
      /import \{[^}]*useState[^}]*prepareEffects[^}]*\} from ['"]@litsx\/core['"]|import \{[^}]*prepareEffects[^}]*useState[^}]*\} from ['"]@litsx\/core['"]/
    );
    assert.match(result.code, /prepareEffects\(this\);/);
    assert.match(result.code, /const \[count, setCount\] = useState\(this, 1\);/);
    assert.match(result.code, /return <button @click=\{\(\) => setCount\(count \+ 1\)\}>\{count\}<\/button>;/);
  });

  it("preserves sibling declarators around native useState through the preset", () => {
    const source = [
      "import { useState } from '@litsx\/core';",
      "export function Counter() {",
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
      }
    );

    assert.match(result.code, /const label = 'ok',\s*\[count, setCount\] = useState\(this, 0\);/);
  });

  it("threads host through local custom hooks that call native useState", () => {
    const source = [
      "import { useState } from '@litsx\/core';",
      "function useCounter(initial) {",
      "  const [value, setValue] = useState(initial);",
      "  return [value, setValue];",
      "}",
      "export function Counter() {",
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
      }
    );

    assert.match(result.code, /function useCounter\(_[A-Za-z0-9]+, initial\)/);
    assert.match(result.code, /const \[value, setValue\] = useState\(_[A-Za-z0-9]+, initial\);/);
    assert.match(result.code, /prepareEffects\(this\);/);
    assert.match(result.code, /const \[value, setValue\] = useCounter\(this, 0\);/);
  });

  it("injects prepareEffects and host args for native effect hooks through the preset", () => {
    const source = [
      "import { useAfterUpdate } from '@litsx\/core';",
      "export function Counter() {",
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
      }
    );

    assert.match(
      result.code,
      /import \{[^}]*useAfterUpdate[^}]*prepareEffects[^}]*\} from ['"]@litsx\/core['"]|import \{[^}]*prepareEffects[^}]*useAfterUpdate[^}]*\} from ['"]@litsx\/core['"]/
    );
    assert.match(result.code, /prepareEffects\(this\);/);
    assert.match(result.code, /useAfterUpdate\(this, \(\) => \{\s*this\.flag = true;\s*}, \[]\);/s);
  });

  it("threads host through native custom hooks in the preset", () => {
    const source = [
      "import { useStableCallback, useAfterUpdate } from '@litsx\/core';",
      "function useCustom(flag) {",
      "  const callback = useStableCallback(() => flag, [flag]);",
      "  useAfterUpdate(() => flag && callback(), [flag, callback]);",
      "  return callback;",
      "}",
      "export function Counter() {",
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
      }
    );

    assert.match(result.code, /function useCustom\(_host, flag\)/);
    assert.match(result.code, /const callback = useStableCallback\(_host, \(\) => flag, \[flag\]\);/);
    assert.match(result.code, /useAfterUpdate\(_host, \(\) => flag && callback\(\), \[flag, callback\]\);/);
    assert.match(result.code, /prepareEffects\(this\);/);
    assert.match(result.code, /const value = useCustom\(this, this\.flag\);/);
  });

  it("injects host for native useEmit through the preset", () => {
    const source = [
      "import { useEmit } from '@litsx\/core';",
      "export function Counter() {",
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
      }
    );

    assert.match(result.code, /prepareEffects\(this\);/);
    assert.match(result.code, /const emit = useEmit\(this\);/);
    assert.match(result.code, /emit\('change', this\.value, \{\s*cancelable: true\s*\}\);/);
  });

  it("lowers native useRef DOM bindings through the canonical preset", () => {
    const source = [
      "import { useRef } from '@litsx\/core';",
      "export function Counter() {",
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
      }
    );

    assert.match(result.code, /import \{[^}]*useRef[^}]*\} from ['"]@litsx\/core['"]/);
    assert.match(result.code, /import \{[^}]*useCallbackRef[^}]*\} from ['"]@litsx\/core['"]/);
    assert.match(result.code, /import \{[^}]*prepareEffects[^}]*\} from ['"]@litsx\/core['"]/);
    assert.match(result.code, /prepareEffects\(this\);/);
    assert.match(result.code, /const buttonRef = useRef\(this, null\);/);
    assert.match(result.code, /useCallbackRef\(this, \(\) => this\._buttonRefElement, node => buttonRef\.current = node\);/);
    assert.match(result.code, /get _buttonRefElement\(\)/);
    assert.match(result.code, /data-ref="_buttonRefElement"/);
  });

  it("keeps non-DOM native useRef bindings as mutable refs through the preset", () => {
    const source = [
      "import { useRef } from '@litsx\/core';",
      "export function Counter() {",
      "  const workerRef = useRef(null);",
      "  workerRef.current = 'ok';",
      "  return <div>{workerRef.current}</div>;",
      "}",
    ].join("\n");

    const result = transformFromAstSync(
      parser.parse(source, { sourceType: "module" }),
      source,
      {
        configFile: false,
        babelrc: false,
        presets: [[nativePreset, { jsxTemplate: false }]],
      }
    );

    assert.match(result.code, /const workerRef = useRef\(this, null\);/);
    assert.match(result.code, /workerRef\.current = 'ok';/);
    assert.doesNotMatch(result.code, /get workerRef\(\)/);
    assert.doesNotMatch(result.code, /data-ref="/);
  });

  it("does not follow external playground imports when using in-memory mode", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "litsx-playground-"));
    const typesPath = path.join(tempDir, "types.ts");
    const componentPath = path.join(tempDir, "Card.tsx");

    fs.writeFileSync(
      typesPath,
      [
        "export interface CardProps {",
        "  title: string;",
        "  active: boolean;",
        "}",
      ].join("\n")
    );

    const source = [
      "import type { CardProps } from './types';",
      "function Card({ title, active }: CardProps) {",
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
        presets: [[nativePreset, {
          jsxTemplate: false,
          typeResolutionMode: "in-memory",
          inMemoryFiles: PLAYGROUND_TYPE_FILES,
        }]],
      }
    );

    assert.match(result.code, /title: \{\s*type: String\s*\}/);
    assert.match(result.code, /active: \{\s*type: String\s*\}/);
  });
});
