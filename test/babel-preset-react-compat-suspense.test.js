import assert from "assert";
import babelCore from "@babel/core";
import parser from "../packages/babel-parser-litsx/src/index.js";
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

  function transformAst(ast, source) {
    const result = transformFromAstSync(ast, source, {
      configFile: false,
      babelrc: false,
      presets: [[reactCompatPreset, { jsxTemplate: false }]],
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
    assert.match(code, /import \{[^}]*SuspenseBoundary[^}]*\} from ["']@litsx\/litsx["']/);
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

    assert.match(code, /import \{[^}]*SuspenseList[^}]*SuspenseBoundary[^}]*\} from ["']@litsx\/litsx["']|import \{[^}]*SuspenseBoundary[^}]*SuspenseList[^}]*\} from ["']@litsx\/litsx["']/);
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
      /\.contentRenderer=\{bindRendererContext\([\s\S]*?\(\)\s*=>\s*\{[\s\S]*ensureLazyElement\(this,\s*"fancy-button",\s*FancyButton\);[\s\S]*return <fancy-button \/>;[\s\S]*\}\)\}/s
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
      /<suspense-boundary[\s\S]*\.contentRenderer=\{bindRendererContext\([\s\S]*?\(\)\s*=>\s*\{[\s\S]*ensureLazyElement\(this,\s*"alpha-panel",\s*AlphaPanel\);[\s\S]*return <alpha-panel \/>;[\s\S]*\}\)\}[\s\S]*<\/suspense-boundary>/s
    );
    assert.match(
      code,
      /<suspense-boundary[\s\S]*\.contentRenderer=\{bindRendererContext\([\s\S]*?\(\)\s*=>\s*\{[\s\S]*ensureLazyElement\(this,\s*"beta-panel",\s*BetaPanel\);[\s\S]*return <beta-panel \/>;[\s\S]*\}\)\}[\s\S]*<\/suspense-boundary>/s
    );
  });

  it("handles namespace React.Suspense and React.SuspenseList forms", () => {
    const source = [
      "import * as React from 'react';",
      "",
      "export const Screen = () => {",
      "  return (",
      "    <React.SuspenseList revealOrder='forwards'>",
      "      <React.Suspense fallback={<span>loading</span>}>",
      "        <div>ready</div>",
      "      </React.Suspense>",
      "    </React.SuspenseList>",
      "  );",
      "};",
    ].join("\n");

    const code = run(source);

    assert.match(
      code,
      /import \{[^}]*SuspenseList[^}]*SuspenseBoundary[^}]*\} from ["']@litsx\/litsx["']|import \{[^}]*SuspenseBoundary[^}]*SuspenseList[^}]*\} from ["']@litsx\/litsx["']/
    );
    assert.match(code, /<suspense-list revealOrder=['"]forwards['"]>/);
    assert.match(code, /<suspense-boundary/);
    assert.doesNotMatch(code, /<React\.Suspense/);
    assert.doesNotMatch(code, /<React\.SuspenseList/);
  });

  it("emits null renderers when suspense has no fallback or content", () => {
    const source = [
      "import { Suspense } from 'react';",
      "",
      "export const Screen = () => {",
      "  return <Suspense />;",
      "};",
    ].join("\n");

    const code = run(source);

    assert.match(code, /<suspense-boundary/);
    assert.match(code, /\.fallbackRenderer=\{\(\)\s*=>\s*null\}/);
    assert.match(code, /\.contentRenderer=\{\(\)\s*=>\s*null\}/);
  });

  it("preserves fragment children inside the suspense content renderer", () => {
    const source = [
      "import { Suspense } from 'react';",
      "",
      "export const Screen = () => {",
      "  return (",
      "    <Suspense fallback={<span>loading</span>}>",
      "      <>",
      "        <div>alpha</div>",
      "        <div>beta</div>",
      "      </>",
      "    </Suspense>",
      "  );",
      "};",
    ].join("\n");

    const code = run(source);

    assert.match(code, /\.contentRenderer=\{\(\)\s*=>\s*<>\s*<div>alpha<\/div>\s*<div>beta<\/div>\s*<\/>\}/s);
  });

  it("supports boolean fallbacks and single expression children", () => {
    const source = [
      "import { Suspense as Wait } from 'react';",
      "",
      "export const Screen = ({ readyView }) => {",
      "  return <Wait fallback>{readyView}</Wait>;",
      "};",
    ].join("\n");

    const code = run(source);

    assert.match(code, /<suspense-boundary/);
    assert.match(code, /\.fallbackRenderer=\{\(\)\s*=>\s*true\}/);
    assert.match(code, /\.contentRenderer=\{\(\)\s*=>\s*this\.readyView\}/);
  });

  it("supports string fallbacks and plain text children", () => {
    const source = [
      "import { Suspense } from 'react';",
      "",
      "export const Screen = () => {",
      "  return <Suspense fallback=\"loading\">ready</Suspense>;",
      "};",
    ].join("\n");

    const code = run(source);

    assert.match(code, /\.fallbackRenderer=\{\(\)\s*=>\s*\"loading\"\}/);
    assert.match(code, /\.contentRenderer=\{\(\)\s*=>\s*\"ready\"\}/);
  });

  it("treats empty fallback expressions as boolean true instead of crashing", () => {
    const source = [
      "import { Suspense } from 'react';",
      "",
      "export const Screen = () => {",
      "  return <Suspense fallback={true}><div>ready</div></Suspense>;",
      "};",
    ].join("\n");
    const ast = parser.parse(source, { sourceType: "module" });
    ast.program.body[1].declaration.declarations[0].init.body.body[0].argument.openingElement.attributes[0].value.expression = {
      type: "JSXEmptyExpression",
    };

    const code = transformAst(ast, source);

    assert.match(code, /\.fallbackRenderer=\{\(\)\s*=>\s*true\}/);
    assert.match(code, /\.contentRenderer=\{\(\)\s*=>\s*<div>ready<\/div>\}/);
  });

  it("leaves non-React namespace suspense lookalikes untouched", () => {
    const source = [
      "import * as UI from 'ui-kit';",
      "",
      "export const Screen = () => {",
      "  return <UI.Suspense fallback=\"loading\"><div>ready</div></UI.Suspense>;",
      "};",
    ].join("\n");

    const code = run(source);

    assert.match(code, /<UI\.Suspense fallback="loading"><div>ready<\/div><\/UI\.Suspense>/);
    assert.doesNotMatch(code, /<suspense-boundary/);
  });

  it("drops key attributes from suspense lists imported under aliases", () => {
    const source = [
      "import { Suspense as Wait, SuspenseList as Queue } from 'react';",
      "",
      "export const Screen = () => {",
      "  return (",
      "    <Queue key=\"outer\" revealOrder=\"forwards\">",
      "      <Wait fallback={<span>One</span>}>",
      "        <div>alpha</div>",
      "      </Wait>",
      "    </Queue>",
      "  );",
      "};",
    ].join("\n");

    const code = run(source);

    assert.match(code, /<suspense-list revealOrder=\"forwards\">/);
    assert.doesNotMatch(code, /key=\"outer\"/);
    assert.match(code, /<suspense-boundary/);
  });

  it("renders numeric fallbacks and null content when suspense children are empty comments", () => {
    const source = [
      "import { Suspense } from 'react';",
      "",
      "export const Screen = () => {",
      "  return <Suspense fallback={404}>{/* empty */}</Suspense>;",
      "};",
    ].join("\n");

    const code = run(source);

    assert.match(code, /\.fallbackRenderer=\{\(\)\s*=>\s*404\}/);
    assert.match(code, /\.contentRenderer=\{\(\)\s*=>\s*null\}/);
  });

  it("moves only matching ensureLazyElement calls into suspense content renderers", () => {
    const source = [
      "import { ensureLazyElement } from '@litsx/litsx';",
      "import { Suspense } from 'react';",
      "",
      "const AlphaPanel = () => null;",
      "const BetaPanel = () => null;",
      "",
      "export const Screen = () => {",
      "  ensureLazyElement(this, 'alpha-panel', AlphaPanel);",
      "  ensureLazyElement(this, 'beta-panel', BetaPanel);",
      "  return (",
      "    <section>",
      "      <Suspense fallback={<span>loading</span>}>",
      "        <alpha-panel />",
      "      </Suspense>",
      "    </section>",
      "  );",
      "};",
    ].join("\n");

    const code = run(source);

    assert.match(
      code,
      /\.contentRenderer=\{bindRendererContext\([\s\S]*?\(\)\s*=>\s*\{[\s\S]*ensureLazyElement\(this,\s*'alpha-panel',\s*AlphaPanel\);[\s\S]*return <alpha-panel \/>;[\s\S]*\}\)\}/s
    );
    assert.match(code, /ensureLazyElement\(this,\s*'beta-panel',\s*BetaPanel\);/);
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

    assert.match(code, /import \{[^}]*SuspenseBoundary[^}]*ErrorBoundary[^}]*\} from "@litsx\/litsx"|import \{[^}]*ErrorBoundary[^}]*SuspenseBoundary[^}]*\} from "@litsx\/litsx"/);
    assert.match(code, /import \{ ShadowDomElementsMixin \} from "@litsx\/litsx\/runtime-infrastructure";/);
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
      /import \{[^}]*ensureLazyElement[^}]*ErrorBoundary[^}]*SuspenseBoundary[^}]*SuspenseList[^}]*\} from "@litsx\/litsx"|import \{[^}]*ensureLazyElement[^}]*ErrorBoundary[^}]*SuspenseList[^}]*SuspenseBoundary[^}]*\} from "@litsx\/litsx"|import \{[^}]*ErrorBoundary[^}]*SuspenseBoundary[^}]*SuspenseList[^}]*ensureLazyElement[^}]*\} from "@litsx\/litsx"/
    );
    assert.match(code, /import \{ LitElement, html \} from "lit";/);
    assert.match(code, /import \{ ShadowDomElementsMixin \} from "@litsx\/litsx\/runtime-infrastructure";/);
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
