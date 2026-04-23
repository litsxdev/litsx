import assert from "assert";
import babelCore from "@babel/core";
import parser from "../packages/babel-parser-litsx/src/index.mjs";
import { beforeAll, describe, it } from "vitest";
import { interopDefault } from "./helpers/interop-default.js";

const { transformFromAstSync } = babelCore;
let reactCompatPreset;

describe("@litsx/babel-preset-react-compat suspense boundaries", () => {
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

  function runFinal(code) {
    const ast = parser.parse(code, { sourceType: "module" });
    const result = transformFromAstSync(ast, code, {
      configFile: false,
      babelrc: false,
      presets: [[reactCompatPreset, {}]],
      generatorOpts: { decoratorsBeforeExport: true },
    });
    return result.code;
  }

  it("rewrites Suspense to a suspense-boundary utility component", () => {
    const source = [
      "import { Suspense } from 'react';",
      "",
      "export const Screen = () => {",
      "  return (",
      "    <Suspense fallback={<span>loading</span>}>",
      "      <div>ready</div>",
      "    </Suspense>",
      "  );",
      "};",
    ].join("\n");

    const code = run(source);

    assert.match(code, /class Screen extends ShadowDomElementsMixin\(LitElement\)/);
    assert.match(code, /import \{[^}]*SuspenseBoundary[^}]*\} from ["']litsx["']/);
    assert.match(code, /static elements = \{[\s\S]*"suspense-boundary": SuspenseBoundary[\s\S]*\}/);
    assert.match(code, /<suspense-boundary/);
    assert.match(code, /\.fallbackRenderer=\{\(\)\s*=>\s*<span>loading<\/span>\}/);
    assert.match(code, /\.contentRenderer=\{\(\)\s*=>\s*<div>ready<\/div>\}/);
    assert.doesNotMatch(code, /suspenseBoundary\(/);
  });

  it("rewrites SuspenseList to a suspense-list utility component", () => {
    const source = [
      "import React, { Suspense, SuspenseList } from 'react';",
      "",
      "export const Screen = () => {",
      "  return (",
      "    <SuspenseList revealOrder='forwards'>",
      "      <Suspense fallback={<span>One</span>}>",
      "        <div>alpha</div>",
      "      </Suspense>",
      "      <Suspense fallback={<span>Two</span>}>",
      "        <div>beta</div>",
      "      </Suspense>",
      "    </SuspenseList>",
      "  );",
      "};",
    ].join("\n");

    const code = run(source);

    assert.match(code, /import \{[^}]*SuspenseList[^}]*SuspenseBoundary[^}]*\} from ["']litsx["']|import \{[^}]*SuspenseBoundary[^}]*SuspenseList[^}]*\} from ["']litsx["']/);
    assert.match(
      code,
      /static elements = \{[\s\S]*"suspense-boundary": SuspenseBoundary[\s\S]*"suspense-list": SuspenseList[\s\S]*\}|static elements = \{[\s\S]*"suspense-list": SuspenseList[\s\S]*"suspense-boundary": SuspenseBoundary[\s\S]*\}/
    );
    assert.match(code, /<suspense-list revealOrder=['"]forwards['"]>/);
    const boundaryMatches = code.match(/<suspense-boundary/g) || [];
    assert.strictEqual(boundaryMatches.length, 2);
    assert.doesNotMatch(code, /suspenseBoundaryList\(/);
  });

  it("keeps lazy registration inside the content renderer of suspense-boundary", () => {
    const source = [
      "import { lazy, Suspense } from 'react';",
      "",
      "const FancyButton = lazy(() => import('./FancyButton.js'));",
      "",
      "export const Screen = () => {",
      "  return (",
      "    <Suspense fallback={<span>loading</span>}>",
      "      <FancyButton />",
      "    </Suspense>",
      "  );",
      "};",
    ].join("\n");

    const code = run(source);

    assert.match(
      code,
      /\.contentRenderer=\{\(\)\s*=>\s*\{[\s\S]*ensureLazyElement\(this,\s*"fancy-button",\s*FancyButton\);[\s\S]*return <fancy-button \/>;[\s\S]*\}\}/s
    );
    assert.doesNotMatch(
      code,
      /ensureLazyElement\(this,\s*"fancy-button",\s*FancyButton\);[\s\S]*<suspense-boundary/
    );
  });

  it("keeps each lazy registration inside its own suspense-boundary when using SuspenseList", () => {
    const source = [
      "import { lazy, Suspense, SuspenseList } from 'react';",
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
      /<suspense-boundary[\s\S]*\.contentRenderer=\{\(\)\s*=>\s*\{[\s\S]*ensureLazyElement\(this,\s*"alpha-panel",\s*AlphaPanel\);[\s\S]*return <alpha-panel \/>;[\s\S]*\}\}[\s\S]*<\/suspense-boundary>/s
    );
    assert.match(
      code,
      /<suspense-boundary[\s\S]*\.contentRenderer=\{\(\)\s*=>\s*\{[\s\S]*ensureLazyElement\(this,\s*"beta-panel",\s*BetaPanel\);[\s\S]*return <beta-panel \/>;[\s\S]*\}\}[\s\S]*<\/suspense-boundary>/s
    );
  });

  it("does not introduce boundary-key or list-key attributes in the component model", () => {
    const source = [
      "import { Suspense, SuspenseList } from 'react';",
      "",
      "export const Screen = () => {",
      "  return (",
      "    <SuspenseList revealOrder='forwards'>",
      "      <Suspense fallback={<span>One</span>}>",
      "        <div>alpha</div>",
      "      </Suspense>",
      "    </SuspenseList>",
      "  );",
      "};",
    ].join("\n");

    const code = run(source);

    assert.doesNotMatch(code, /boundary-key=/);
    assert.doesNotMatch(code, /list-key=/);
  });

  it("uses light-dom utility components rather than runtime helper functions", () => {
    const source = [
      "import { Suspense } from 'react';",
      "",
      "export const Screen = () => {",
      "  return (",
      "    <Suspense fallback={<span>loading</span>}>",
      "      <div>ready</div>",
      "    </Suspense>",
      "  );",
      "};",
    ].join("\n");

    const code = run(source);

    assert.match(code, /<suspense-boundary/);
    assert.doesNotMatch(code, /suspenseBoundary\(/);
    assert.doesNotMatch(code, /suspenseBoundaryList\(/);
  });

  it("emits final html output after lowering Suspense before the template pass", () => {
    const source = [
      "import { Suspense } from 'react';",
      "",
      "export const Screen = () => {",
      "  return (",
      "    <Suspense fallback={<span>loading</span>}>",
      "      <div>ready</div>",
      "    </Suspense>",
      "  );",
      "};",
    ].join("\n");

    const code = runFinal(source);

    assert.match(code, /import \{[^}]*SuspenseBoundary[^}]*ErrorBoundary[^}]*\} from "litsx"|import \{[^}]*ErrorBoundary[^}]*SuspenseBoundary[^}]*\} from "litsx"/);
    assert.match(code, /import \{ ShadowDomElementsMixin \} from "litsx\/runtime-infrastructure";/);
    assert.match(code, /return html`<suspense-boundary \.fallbackRenderer=\$\{\(\) => html`<span>loading<\/span>`\} \.contentRenderer=\$\{\(\) => html`<div>ready<\/div>`\}><\/suspense-boundary>`;/);
    assert.doesNotMatch(code, /<Suspense/);
  });

  it("lowers nested error and suspense structures through multiple recursion levels", () => {
    const source = [
      "import { ErrorBoundary } from 'react-error-boundary';",
      "import { lazy, Suspense, SuspenseList } from 'react';",
      "",
      "const AlphaPanel = lazy(() => import('./AlphaPanel.js'));",
      "",
      "export const Screen = () => {",
      "  return (",
      "    <ErrorBoundary fallback={<p>outer-fallback</p>}>",
      "      <section>",
      "        <SuspenseList revealOrder='forwards'>",
      "          <Suspense fallback={<span>alpha-loading</span>}>",
      "            <AlphaPanel />",
      "          </Suspense>",
      "          <Suspense fallback={<span>beta-loading</span>}>",
      "            <article><strong>beta-ready</strong></article>",
      "          </Suspense>",
      "        </SuspenseList>",
      "      </section>",
      "    </ErrorBoundary>",
      "  );",
      "};",
    ].join("\n");

    const code = runFinal(source);

    assert.match(
      code,
      /import \{[^}]*ensureLazyElement[^}]*ErrorBoundary[^}]*SuspenseBoundary[^}]*SuspenseList[^}]*\} from "litsx"|import \{[^}]*ensureLazyElement[^}]*ErrorBoundary[^}]*SuspenseList[^}]*SuspenseBoundary[^}]*\} from "litsx"|import \{[^}]*ErrorBoundary[^}]*SuspenseBoundary[^}]*SuspenseList[^}]*ensureLazyElement[^}]*\} from "litsx"/
    );
    assert.match(code, /import \{ LitElement, html \} from "lit";/);
    assert.match(code, /import \{ ShadowDomElementsMixin \} from "litsx\/runtime-infrastructure";/);
    assert.match(code, /ensureLazyElement\(this, "alpha-panel", AlphaPanel\);/);
    assert.match(code, /<error-boundary/);
    assert.match(code, /<suspense-list revealOrder="forwards">/);

    const boundaryMatches = code.match(/<suspense-boundary/g) || [];
    assert.strictEqual(boundaryMatches.length, 2);

    assert.match(code, /<alpha-panel><\/alpha-panel>/);
    assert.match(code, /<article><strong>beta-ready<\/strong><\/article>/);
    assert.doesNotMatch(code, /<Suspense/);
    assert.doesNotMatch(code, /<SuspenseList/);
    assert.doesNotMatch(code, /<ErrorBoundary/);
  });
});
