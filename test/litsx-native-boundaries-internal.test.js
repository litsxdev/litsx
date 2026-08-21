import assert from "assert";
import babelCore from "@babel/core";
import { describe, it } from "vitest";
import transformLitsxBoundaries from "../packages/babel-preset-litsx/src/internal/transform-litsx-boundaries.js";

function transform(source, options = {}) {
  return babelCore.transformSync(source, {
    babelrc: false,
    configFile: false,
    filename: "/virtual/view.litsx",
    parserOpts: { plugins: ["jsx"] },
    plugins: [[transformLitsxBoundaries, options]],
  }).code;
}

describe("native boundary transform internals", () => {
  it("leaves elements alone when no LitSX boundary was imported", () => {
    const code = transform("const view = <Suspense fallback='loading'>ready</Suspense>;");

    assert.match(code, /<Suspense fallback=['"]loading['"]>ready<\/Suspense>/);
    assert.doesNotMatch(code, /\.content/);
  });

  it("lowers aliased SuspenseBoundary and ErrorBoundary renderers", () => {
    const code = transform(`
      import { SuspenseBoundary as Wait, ErrorBoundary as Catch } from "@litsx/core";
      const view = <>
        <Wait fallback="loading">ready</Wait>
        <Catch fallback={<span>failed</span>}><article>content</article></Catch>
      </>;
    `);

    assert.match(code, /<Wait \.fallback=\{\(\) => "loading"\} \.content=\{\(\) => "ready"\}><\/Wait>/);
    assert.match(code, /<Catch \.fallback=\{\(\) => <span>failed<\/span>\} \.content=\{\(\) => <article>content<\/article>\}><\/Catch>/);
  });

  it("emits null renderers for empty boundaries and fragments for multiple children", () => {
    const code = transform(`
      import { SuspenseBoundary } from "@litsx/core";
      const empty = <SuspenseBoundary />;
      const multiple = <SuspenseBoundary fallback>{"one"}<span>two</span></SuspenseBoundary>;
    `);

    assert.match(code, /<SuspenseBoundary \.fallback=\{\(\) => null\} \.content=\{\(\) => null\}><\/SuspenseBoundary>/);
    assert.match(code, /\.fallback=\{\(\) => true\}/);
    assert.match(code, /\.content=\{\(\) => <>\{"one"\}<span>two<\/span><\/>\}/);
  });

  it("uses an existing renderLight import when rendering boundaries for SSR", () => {
    const code = transform(`
      import { renderLight as render } from "@lit-labs/ssr-client/directives/render-light.js";
      import { SuspenseBoundary } from "@litsx/core";
      const view = <SuspenseBoundary>ready</SuspenseBoundary>;
    `, { ssr: true });

    assert.match(code, /\.fallback=\{\(\) => null\}/);
    assert.match(code, /\.content=\{\(\) => "ready"\}/);
    assert.match(code, /\{render\(\)\}/);
    assert.strictEqual((code.match(/@lit-labs\/ssr-client\/directives\/render-light\.js/g) ?? []).length, 1);
  });

  it("adds a collision-free renderLight import for SSR", () => {
    const code = transform(`
      import { ErrorBoundary } from "@litsx/core";
      const renderLight = "reserved";
      const view = <ErrorBoundary><p>ready</p></ErrorBoundary>;
    `, { ssr: true });

    assert.match(
      code,
      /import \{ renderLight as __litsxrenderLight1 \} from "@lit-labs\/ssr-client\/directives\/render-light\.js"/,
    );
    assert.match(code, /\{__litsxrenderLight1\(\)\}/);
  });

  it("augments an existing render-light module import that lacks the named helper", () => {
    const code = transform(`
      import renderDirective from "@lit-labs/ssr-client/directives/render-light.js";
      import { SuspenseBoundary } from "@litsx/core";
      const view = <SuspenseBoundary>ready</SuspenseBoundary>;
    `, { ssr: true });

    assert.match(
      code,
      /import renderDirective, \{ renderLight \} from "@lit-labs\/ssr-client\/directives\/render-light\.js"/,
    );
    assert.match(code, /\{renderLight\(\)\}/);
  });
});
