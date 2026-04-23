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
      /import \{ ShadowDomElementsMixin \} from "litsx\/runtime-infrastructure";/
    );
    assert.match(code, /class Screen extends ShadowDomElementsMixin\(LitElement\)/);
    assert.match(
      code,
      /import \{[^}]*ensureLazyElement[^}]*\} from "litsx";/
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
      /import \{[^}]*ensureLazyElement[^}]*\} from "litsx";/
    );
    assert.match(
      code,
      /const FancyButton = \(\) => import\(['"]\.\/FancyButton\.js['"]\);/
    );
    assert.match(
      code,
      /<suspense-boundary[\s\S]*\.fallbackRenderer=\{\(\)\s*=>\s*<span>loading<\/span>\}[\s\S]*\.contentRenderer=\{\(\)\s*=>\s*\{[\s\S]*ensureLazyElement\(this,\s*"fancy-button",\s*FancyButton\);[\s\S]*return <fancy-button label=['"]Save['"] \/>;[\s\S]*\}\}[\s\S]*><\/suspense-boundary>/s
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
      /<suspense-boundary[\s\S]*\.contentRenderer=\{\(\)\s*=>\s*\{[\s\S]*ensureLazyElement\(this,\s*"primary-action",\s*PrimaryAction\);[\s\S]*return <primary-action \/>;[\s\S]*\}\}[\s\S]*><\/suspense-boundary>/s
    );
  });
});
