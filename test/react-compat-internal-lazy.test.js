import assert from "assert";
import babelCore from "@babel/core";
import parser from "../packages/babel-parser-litsx/src/index.mjs";
import { beforeAll, describe, it } from "vitest";
import { interopDefault } from "./helpers/interop-default.js";

const { transformFromAstSync } = babelCore;
let reactCompatPreset;

describe("react compat internal lazy", () => {
  beforeAll(async () => {
    const [presetMod] = await Promise.all([
      import("../packages/babel-preset-react-compat/src/index.js"),
    ]);

    reactCompatPreset = interopDefault(presetMod);
  });

  function run(code) {
    const ast = parser.parse(code, { sourceType: "module" });
    const result = transformFromAstSync(ast, code, {
      configFile: false,
      babelrc: false,
      presets: [[reactCompatPreset, { jsxTemplate: false }]],
      generatorOpts: { decoratorsBeforeExport: true },
    });
    return result.code;
  }

  it("rewrites direct lazy bindings to loaders and injects lazy registration", () => {
    const source = [
      "import { lazy } from 'react';",
      "",
      "const FancyButton = lazy(() => import('./FancyButton.js'));",
      "",
      "export const Screen = () => {",
      "  return <FancyButton label='Save' />;",
      "};",
    ].join("\n");

    const code = run(source);

    assert.match(
      code,
      /import \{ ShadowDomElementsMixin \} from "@litsx\/litsx\/runtime-infrastructure";/
    );
    assert.match(code, /class Screen extends ShadowDomElementsMixin\(LitElement\)/);
    assert.match(
      code,
      /import \{[^}]*ensureLazyElement[^}]*\} from "@litsx\/litsx";/
    );
    assert.match(
      code,
      /const FancyButton = \(\) => import\(['"]\.\/FancyButton\.js['"]\);/
    );
    assert.match(
      code,
      /ensureLazyElement\(this,\s*"fancy-button",\s*FancyButton\);/
    );
    assert.match(code, /return <fancy-button label=['"]Save['"] \/>;/);
    assert.doesNotMatch(code, /const FancyButton = lazy/);
  });

  it("derives the rendered tag from the final JSX alias binding", () => {
    const source = [
      "import { lazy } from 'react';",
      "",
      "const FancyButton = lazy(() => import('./FancyButton.js'));",
      "const PrimaryAction = FancyButton;",
      "",
      "export const Screen = () => {",
      "  return <PrimaryAction />;",
      "};",
    ].join("\n");

    const code = run(source);

    assert.match(
      code,
      /const FancyButton = \(\) => import\(['"]\.\/FancyButton\.js['"]\);/
    );
    assert.match(code, /const PrimaryAction = FancyButton;/);
    assert.match(
      code,
      /ensureLazyElement\(this,\s*"primary-action",\s*PrimaryAction\);/
    );
    assert.match(code, /return <primary-action \/>;/);
  });

  it("keeps the lazy registration inside suspense-boundary content renderers", () => {
    const source = [
      "import { lazy, Suspense } from 'react';",
      "",
      "const FancyButton = lazy(() => import('./FancyButton.js'));",
      "",
      "export const Screen = () => {",
      "  return (",
      "    <Suspense fallback={<span>loading</span>}>",
      "      <FancyButton label='Save' />",
      "    </Suspense>",
      "  );",
      "};",
    ].join("\n");

    const code = run(source);

    assert.match(code, /class Screen extends ShadowDomElementsMixin\(LitElement\)/);
    assert.match(
      code,
      /import \{[^}]*ensureLazyElement[^}]*\} from "@litsx\/litsx";/
    );
    assert.match(
      code,
      /const FancyButton = \(\) => import\(['"]\.\/FancyButton\.js['"]\);/
    );
    assert.match(
      code,
      /<suspense-boundary[\s\S]*\.fallbackRenderer=\{\(\)\s*=>\s*<span>loading<\/span>\}[\s\S]*\.contentRenderer=\{bindRendererContext\([\s\S]*?\(\)\s*=>\s*\{[\s\S]*ensureLazyElement\(this,\s*"fancy-button",\s*FancyButton\);[\s\S]*return <fancy-button label=['"]Save['"] \/>;[\s\S]*\}\)\}[\s\S]*><\/suspense-boundary>/s
    );
    assert.doesNotMatch(
      code,
      /ensureLazyElement\(this,\s*"fancy-button",\s*FancyButton\);[\s\S]*<suspense-boundary/
    );
  });

  it("supports named export resolution inside the loader expression", () => {
    const source = [
      "import { lazy } from 'react';",
      "",
      "const FancyButton = lazy(() => import('./buttons.js').then((mod) => mod.FancyButton));",
      "",
      "export const Screen = () => {",
      "  return <FancyButton />;",
      "};",
    ].join("\n");

    const code = run(source);

    assert.match(
      code,
      /const FancyButton = \(\) => import\(['"]\.\/buttons\.js['"]\)\.then\(mod => mod\.FancyButton\);/
    );
    assert.match(
      code,
      /ensureLazyElement\(this,\s*"fancy-button",\s*FancyButton\);/
    );
    assert.match(code, /return <fancy-button \/>;/);
  });

  it("supports lazy wrapping a loader resolver expression", () => {
    const source = [
      "import { lazy } from 'react';",
      "",
      "const resolveImport = (role) => {",
      "  if (role === 'admin') {",
      "    return () => import('./AdminButton.js');",
      "  }",
      "  return () => import('./DefaultButton.js');",
      "};",
      "",
      "const PrimaryAction = lazy(resolveImport(role));",
      "",
      "export const Screen = () => {",
      "  return <PrimaryAction />;",
      "};",
    ].join("\n");

    const code = run(source);

    assert.match(code, /const PrimaryAction = resolveImport\(role\);/);
    assert.match(
      code,
      /ensureLazyElement\(this,\s*"primary-action",\s*PrimaryAction\);/
    );
    assert.match(code, /return <primary-action \/>;/);
  });

  it("supports component-scope aliases that point at lazy bindings", () => {
    const source = [
      "import { lazy } from 'react';",
      "",
      "const FancyButton = lazy(() => import('./FancyButton.js'));",
      "",
      "export const Screen = () => {",
      "  const PrimaryAction = FancyButton;",
      "  return <PrimaryAction />;",
      "};",
    ].join("\n");

    const code = run(source);

    assert.match(
      code,
      /const FancyButton = \(\) => import\(['"]\.\/FancyButton\.js['"]\);/
    );
    assert.match(code, /const PrimaryAction = FancyButton;/);
    assert.match(
      code,
      /ensureLazyElement\(this,\s*"primary-action",\s*PrimaryAction\);/
    );
    assert.match(code, /return <primary-action \/>;/);
  });

  it("supports functions that return lazy values through branches", () => {
    const source = [
      "import { lazy } from 'react';",
      "",
      "function resolveButton(role) {",
      "  switch (role) {",
      "    case 'admin':",
      "      return lazy(() => import('./AdminButton.js'));",
      "    case 'guest':",
      "      return lazy(() => import('./GuestButton.js'));",
      "    default:",
      "      return lazy(() => import('./DefaultButton.js'));",
      "  }",
      "}",
      "",
      "export const Screen = ({ role }) => {",
      "  const PrimaryAction = resolveButton(role);",
      "  return <PrimaryAction />;",
      "};",
    ].join("\n");

    const code = run(source);

    assert.match(
      code,
      /function resolveButton\(role\) \{[\s\S]*return \(\) => import\(['"]\.\/AdminButton\.js['"]\);[\s\S]*return \(\) => import\(['"]\.\/GuestButton\.js['"]\);[\s\S]*return \(\) => import\(['"]\.\/DefaultButton\.js['"]\);[\s\S]*\}/s
    );
    assert.match(
      code,
      /const PrimaryAction = resolveButton\(this\.role\);/
    );
    assert.match(
      code,
      /ensureLazyElement\(this,\s*"primary-action",\s*PrimaryAction\);/
    );
    assert.match(code, /return <primary-action \/>;/);
  });

  it("supports nested if/else returns that resolve to lazy loaders", () => {
    const source = [
      "import { lazy } from 'react';",
      "",
      "function resolveButton(role) {",
      "  if (role === 'admin') {",
      "    return lazy(() => import('./AdminButton.js'));",
      "  }",
      "  if (role === 'guest') {",
      "    return lazy(() => import('./GuestButton.js'));",
      "  }",
      "  return lazy(() => import('./DefaultButton.js'));",
      "}",
      "",
      "export const Screen = ({ role }) => {",
      "  const PrimaryAction = resolveButton(role);",
      "  return <PrimaryAction />;",
      "};",
    ].join("\n");

    const code = run(source);

    assert.match(
      code,
      /function resolveButton\(role\) \{[\s\S]*return \(\) => import\(['"]\.\/AdminButton\.js['"]\);[\s\S]*return \(\) => import\(['"]\.\/GuestButton\.js['"]\);[\s\S]*return \(\) => import\(['"]\.\/DefaultButton\.js['"]\);[\s\S]*\}/s
    );
    assert.match(code, /ensureLazyElement\(this,\s*"primary-action",\s*PrimaryAction\);/);
  });

  it("supports member expressions that resolve to lazy loaders", () => {
    const source = [
      "import { lazy } from 'react';",
      "",
      "const controls = {",
      "  FancyButton: lazy(() => import('./FancyButton.js'))",
      "};",
      "",
      "export const Screen = () => {",
      "  return <controls.FancyButton />;",
      "};",
    ].join("\n");

    const code = run(source);

    assert.match(
      code,
      /const controls = \{[\s\S]*FancyButton: \(\) => import\(['"]\.\/FancyButton\.js['"]\)[\s\S]*\};/s
    );
    assert.match(
      code,
      /ensureLazyElement\(this,\s*"fancy-button",\s*controls\.FancyButton\);/
    );
    assert.match(code, /return <fancy-button \/>;/);
  });

  it("leaves computed member expressions untouched when they cannot be resolved statically", () => {
    const source = [
      "import { lazy } from 'react';",
      "",
      "const controls = {",
      "  FancyButton: lazy(() => import('./FancyButton.js'))",
      "};",
      "",
      "export const Screen = ({ kind }) => {",
      "  const PrimaryAction = controls[kind];",
      "  return <PrimaryAction />;",
      "};",
    ].join("\n");

    const code = run(source);

    assert.doesNotMatch(code, /ensureLazyElement\(/);
    assert.match(code, /const PrimaryAction = controls\[this\.kind\];/);
    assert.match(code, /return <PrimaryAction \/>;/);
    assert.doesNotMatch(code, /ShadowDomElementsMixin/);
  });

  it("supports React.lazy namespace calls", () => {
    const source = [
      "import * as React from 'react';",
      "",
      "const FancyButton = React.lazy(() => import('./FancyButton.js'));",
      "",
      "export const Screen = () => {",
      "  return <FancyButton />;",
      "};",
    ].join("\n");

    const code = run(source);

    assert.match(
      code,
      /const FancyButton = \(\) => import\(['"]\.\/FancyButton\.js['"]\);/
    );
    assert.match(
      code,
      /ensureLazyElement\(this,\s*"fancy-button",\s*FancyButton\);/
    );
    assert.match(code, /return <fancy-button \/>;/);
  });

  it("injects registration for multiple lazy bindings in the same render", () => {
    const source = [
      "import { lazy } from 'react';",
      "",
      "const PrimaryAction = lazy(() => import('./PrimaryAction.js'));",
      "const SecondaryAction = lazy(() => import('./SecondaryAction.js'));",
      "",
      "export const Screen = () => {",
      "  return (",
      "    <div>",
      "      <PrimaryAction />",
      "      <SecondaryAction />",
      "    </div>",
      "  );",
      "};",
    ].join("\n");

    const code = run(source);

    assert.match(
      code,
      /const PrimaryAction = \(\) => import\(['"]\.\/PrimaryAction\.js['"]\);/
    );
    assert.match(
      code,
      /const SecondaryAction = \(\) => import\(['"]\.\/SecondaryAction\.js['"]\);/
    );
    assert.match(
      code,
      /ensureLazyElement\(this,\s*"primary-action",\s*PrimaryAction\);/
    );
    assert.match(
      code,
      /ensureLazyElement\(this,\s*"secondary-action",\s*SecondaryAction\);/
    );
    assert.match(code, /<primary-action \/>/);
    assert.match(code, /<secondary-action \/>/);
  });

  it("allows the same loader to back different rendered tags through aliases", () => {
    const source = [
      "import { lazy } from 'react';",
      "",
      "const FancyButton = lazy(() => import('./FancyButton.js'));",
      "const PrimaryAction = FancyButton;",
      "const SecondaryAction = FancyButton;",
      "",
      "export const Screen = () => {",
      "  return (",
      "    <div>",
      "      <PrimaryAction />",
      "      <SecondaryAction />",
      "    </div>",
      "  );",
      "};",
    ].join("\n");

    const code = run(source);

    assert.match(
      code,
      /const FancyButton = \(\) => import\(['"]\.\/FancyButton\.js['"]\);/
    );
    assert.match(code, /const PrimaryAction = FancyButton;/);
    assert.match(code, /const SecondaryAction = FancyButton;/);
    assert.match(
      code,
      /ensureLazyElement\(this,\s*"primary-action",\s*PrimaryAction\);/
    );
    assert.match(
      code,
      /ensureLazyElement\(this,\s*"secondary-action",\s*SecondaryAction\);/
    );
    assert.match(code, /<primary-action \/>/);
    assert.match(code, /<secondary-action \/>/);
  });

  it("keeps lazy registrations inside each suspense-boundary created by SuspenseList", () => {
    const source = [
      "import React, { lazy, Suspense, SuspenseList } from 'react';",
      "",
      "const AlphaPanel = lazy(() => import('./AlphaPanel.js'));",
      "const BetaPanel = lazy(() => import('./BetaPanel.js'));",
      "",
      "export const Screen = () => {",
      "  return (",
      "    <SuspenseList revealOrder='forwards'>",
      "      <Suspense fallback={<span>One</span>}>",
      "        <AlphaPanel />",
      "      </Suspense>",
      "      <Suspense fallback={<span>Two</span>}>",
      "        <BetaPanel />",
      "      </Suspense>",
      "    </SuspenseList>",
      "  );",
      "};",
    ].join("\n");

    const code = run(source);

    assert.match(
      code,
      /<suspense-list revealOrder=['"]forwards['"]>/
    );
    assert.match(
      code,
      /<suspense-boundary[\s\S]*ensureLazyElement\(this,\s*"alpha-panel",\s*AlphaPanel\);[\s\S]*return <alpha-panel \/>;[\s\S]*<\/suspense-boundary>/s
    );
    assert.match(
      code,
      /<suspense-boundary[\s\S]*ensureLazyElement\(this,\s*"beta-panel",\s*BetaPanel\);[\s\S]*return <beta-panel \/>;[\s\S]*<\/suspense-boundary>/s
    );
  });

  it("handles repeated use of the same lazy binding within one render", () => {
    const source = [
      "import { lazy } from 'react';",
      "",
      "const PrimaryAction = lazy(() => import('./PrimaryAction.js'));",
      "",
      "export const Screen = () => {",
      "  return (",
      "    <div>",
      "      <PrimaryAction />",
      "      <PrimaryAction />",
      "    </div>",
      "  );",
      "};",
    ].join("\n");

    const code = run(source);

    assert.match(
      code,
      /const PrimaryAction = \(\) => import\(['"]\.\/PrimaryAction\.js['"]\);/
    );
    assert.match(
      code,
      /ensureLazyElement\(this,\s*"primary-action",\s*PrimaryAction\);/
    );
    assert.match(code, /<primary-action \/>/);
    const repeatedMatches =
      code.match(/ensureLazyElement\(this,\s*"primary-action",\s*PrimaryAction\);/g) || [];
    assert.strictEqual(
      repeatedMatches.length,
      1,
      "expected the repeated lazy binding to be registered exactly once per render scope"
    );
  });

  it("passes through null-like lazy resolutions and keeps registration as a runtime concern", () => {
    const source = [
      "import { lazy } from 'react';",
      "",
      "const resolveButton = (enabled) => lazy(enabled ? () => import('./FancyButton.js') : null);",
      "",
      "export const Screen = ({ enabled }) => {",
      "  const PrimaryAction = resolveButton(enabled);",
      "  return <PrimaryAction />;",
      "};",
    ].join("\n");

    const code = run(source);

    assert.match(
      code,
      /const resolveButton = enabled => enabled \? \(\) => import\(['"]\.\/FancyButton\.js['"]\) : null;/
    );
    assert.match(
      code,
      /const PrimaryAction = resolveButton\(this\.enabled\);/
    );
    assert.match(
      code,
      /ensureLazyElement\(this,\s*"primary-action",\s*PrimaryAction\);/
    );
  });

  it("lets runtime decide between direct custom element classes and loaders", () => {
    const source = [
      "import { lazy } from 'react';",
      "",
      "const resolveButton = (mode) => {",
      "  if (mode === 'eager') {",
      "    return FancyButtonElement;",
      "  }",
      "  return lazy(() => import('./FancyButton.js'));",
      "};",
      "",
      "export const Screen = ({ mode }) => {",
      "  const PrimaryAction = resolveButton(mode);",
      "  return <PrimaryAction />;",
      "};",
    ].join("\n");

    const code = run(source);

    assert.match(
      code,
      /function resolveButton|const resolveButton = mode =>/
    );
    assert.match(code, /return FancyButtonElement;/);
    assert.match(
      code,
      /return \(\) => import\(['"]\.\/FancyButton\.js['"]\);/
    );
    assert.match(
      code,
      /ensureLazyElement\(this,\s*"primary-action",\s*PrimaryAction\);/
    );
  });

  it("keeps hybrid runtime values inside suspense-boundary content renderers", () => {
    const source = [
      "import { lazy, Suspense } from 'react';",
      "",
      "const resolveButton = (mode) => {",
      "  if (mode === 'eager') {",
      "    return FancyButtonElement;",
      "  }",
      "  return lazy(() => import('./FancyButton.js'));",
      "};",
      "",
      "export const Screen = ({ mode }) => {",
      "  const PrimaryAction = resolveButton(mode);",
      "  return (",
      "    <Suspense fallback={<span>loading</span>}>",
      "      <PrimaryAction />",
      "    </Suspense>",
      "  );",
      "};",
    ].join('\n');

    const code = run(source);

    assert.match(
      code,
      /const PrimaryAction = resolveButton\(this\.mode\);/
    );
    assert.match(
      code,
      /<suspense-boundary[\s\S]*\.contentRenderer=\{bindRendererContext\([\s\S]*?\(\)\s*=>\s*\{[\s\S]*ensureLazyElement\(this,\s*"primary-action",\s*PrimaryAction\);[\s\S]*return <primary-action \/>;[\s\S]*\}\)\}[\s\S]*><\/suspense-boundary>/s
    );
  });

  it("reuses existing litsx imports without duplicating ensureLazyElement", () => {
    const source = [
      "import { ensureLazyElement, prepareEffects } from '@litsx\/litsx';",
      "import { lazy } from 'react';",
      "",
      "const FancyButton = lazy(() => import('./FancyButton.js'));",
      "",
      "export const Screen = () => {",
      "  return <FancyButton />;",
      "};",
    ].join("\n");

    const code = run(source);

    assert.match(
      code,
      /import \{[^}]*ensureLazyElement[^}]*prepareEffects[^}]*ErrorBoundary[^}]*\} from ['"]@litsx\/litsx['"];/
    );
    assert.match(code, /ensureLazyElement\(this,\s*"fancy-button",\s*FancyButton\);/);
  });

  it("inserts a named litsx import after an existing namespace import", () => {
    const source = [
      "import * as runtime from '@litsx\/litsx';",
      "import { lazy } from 'react';",
      "",
      "const FancyButton = lazy(() => import('./FancyButton.js'));",
      "",
      "export const Screen = () => {",
      "  return <FancyButton />;",
      "};",
    ].join("\n");

    const code = run(source);

    assert.match(code, /import \* as runtime,\s*\{\s*ErrorBoundary\s*\} from ['"]@litsx\/litsx['"];/);
    assert.match(code, /import \{ ensureLazyElement \} from "@litsx\/litsx";/);
    assert.match(code, /ensureLazyElement\(this,\s*"fancy-button",\s*FancyButton\);/);
  });

  it("keeps classes already wrapped with elements mixins and supports light DOM lazy components", () => {
    const source = [
      "import { lazy } from 'react';",
      "import { LightDomMixin, LightDomElementsMixin } from '@litsx/litsx/runtime-infrastructure';",
      "import { LitElement } from 'lit';",
      "",
      "const FancyButton = lazy(() => import('./FancyButton.js'));",
      "",
      "export class Screen extends LightDomElementsMixin(LightDomMixin(LitElement)) {",
      "  render() {",
      "    return <FancyButton />;",
      "  }",
      "}",
    ].join("\n");

    const code = run(source);

    assert.match(
      code,
      /class Screen extends ShadowDomElementsMixin\(LightDomElementsMixin\(LightDomMixin\(LitElement\)\)\)/
    );
    const lightDomMixinMatches = code.match(/LightDomElementsMixin/g) || [];
    assert.strictEqual(lightDomMixinMatches.length, 2);
    assert.match(code, /ensureLazyElement\(this,\s*"fancy-button",\s*FancyButton\);/);
    assert.match(code, /return <fancy-button \/>;/);
  });

  it("rewrites special member attributes and preserves registration before the return", () => {
    const source = [
      "import { lazy } from 'react';",
      "",
      "const controls = {",
      "  FancyButton: lazy(() => import('./FancyButton.js'))",
      "};",
      "",
      "export const Screen = () => {",
      "  return <controls .FancyButton />;",
      "};",
    ].join("\n");

    const code = run(source);

    assert.match(code, /ensureLazyElement\(this,\s*"fancy-button",\s*controls\.FancyButton\);/);
    assert.match(code, /return <fancy-button \/>;/);
    assert.doesNotMatch(code, /<controls \.FancyButton/);
  });

  it("rewrites non-self-closing member-expression lazy elements consistently", () => {
    const source = [
      "import { lazy } from 'react';",
      "",
      "const controls = {",
      "  FancyButton: lazy(() => import('./FancyButton.js'))",
      "};",
      "",
      "export const Screen = () => {",
      "  return <controls.FancyButton><span>Save</span></controls.FancyButton>;",
      "};",
    ].join("\n");

    const code = run(source);

    assert.match(code, /ensureLazyElement\(this,\s*"fancy-button",\s*controls\.FancyButton\);/);
    assert.match(code, /return <fancy-button><span>Save<\/span><\/fancy-button>;/);
    assert.doesNotMatch(code, /<controls\.FancyButton|<\/controls\.FancyButton>/);
  });

  it("rewrites non-self-closing special member attributes on both opening and closing tags", () => {
    const source = [
      "import { lazy } from 'react';",
      "",
      "const controls = {",
      "  FancyButton: lazy(() => import('./FancyButton.js'))",
      "};",
      "",
      "export const Screen = () => {",
      "  return <controls .FancyButton><span>Save</span></controls>;",
      "};",
    ].join("\n");

    const code = run(source);

    assert.match(code, /ensureLazyElement\(this,\s*"fancy-button",\s*controls\.FancyButton\);/);
    assert.match(code, /return <fancy-button><span>Save<\/span><\/fancy-button>;/);
    assert.doesNotMatch(code, /<controls \.FancyButton/);
    assert.doesNotMatch(code, /<\/controls>/);
  });

  it("leaves JSX namespaced names untouched because they do not map to lazy custom elements", () => {
    const source = [
      "import { lazy } from 'react';",
      "",
      "const FancyButton = lazy(() => import('./FancyButton.js'));",
      "",
      "export const Screen = () => {",
      "  return <ui:panel><FancyButton /></ui:panel>;",
      "};",
    ].join("\n");

    const code = run(source);

    assert.match(code, /<ui:panel>/);
    assert.match(code, /ensureLazyElement\(this,\s*"fancy-button",\s*FancyButton\);/);
    assert.match(code, /<fancy-button \/>/);
  });

  it("replaces lazy() calls without arguments with undefined and skips registration", () => {
    const source = [
      "import React from 'react';",
      "",
      "const FancyButton = React.lazy();",
      "",
      "export const Screen = () => {",
      "  return <div>{String(FancyButton)}</div>;",
      "};",
    ].join("\n");

    const code = run(source);

    assert.match(code, /const FancyButton = undefined;/);
    assert.doesNotMatch(code, /ensureLazyElement\(/);
  });

  it("extends existing runtime-infrastructure imports when a light-dom class needs lazy elements", () => {
    const source = [
      "import React from 'react';",
      "import { LightDomMixin } from '@litsx/litsx/runtime-infrastructure';",
      "import { LitElement } from 'lit';",
      "",
      "const FancyButton = React.lazy(() => import('./FancyButton.js'));",
      "",
      "export class Screen extends LightDomMixin(LitElement) {",
      "  render() {",
      "    return <FancyButton />;",
      "  }",
      "}",
    ].join("\n");

    const code = run(source);

    assert.match(
      code,
      /import \{ LightDomMixin,\s*ShadowDomElementsMixin \} from '@litsx\/litsx\/runtime-infrastructure';|import \{ ShadowDomElementsMixin,\s*LightDomMixin \} from "@litsx\/litsx\/runtime-infrastructure";/
    );
    assert.match(code, /class Screen extends ShadowDomElementsMixin\(LightDomMixin\(LitElement\)\)/);
    assert.match(code, /ensureLazyElement\(this,\s*"fancy-button",\s*FancyButton\);/);
  });
});
