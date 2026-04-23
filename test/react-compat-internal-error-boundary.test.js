import assert from "assert";
import babelCore from "@babel/core";
import parser from "../packages/babel-parser-litsx/src/index.mjs";
import { beforeAll, describe, it } from "vitest";
import { interopDefault } from "./helpers/interop-default.js";

const { transformFromAstSync } = babelCore;
let plugin;

beforeAll(async () => {
  const mod = await import(
    "../packages/babel-preset-react-compat/src/internal/react-error-boundary.js"
  );
  plugin = interopDefault(mod);
});

describe("react compat internal error boundary", () => {
  function run(code) {
    const ast = parser.parse(code, { sourceType: "module" });
    const result = transformFromAstSync(ast, code, {
      configFile: false,
      babelrc: false,
      plugins: [plugin],
      generatorOpts: { decoratorsBeforeExport: true },
    });
    return result.code;
  }

  it("rewrites ErrorBoundary JSX into utility component markup", () => {
    const source = [
      "import { LitElement, html } from 'lit';",
      "import { ErrorBoundary } from 'react';",
      "",
      "class Example extends LitElement {",
      "  render() {",
      "    return (",
      "      <ErrorBoundary fallback={<p>Oops</p>} onError={handleError}>",
      "        <Widget />",
      "      </ErrorBoundary>",
      "    );",
      "  }",
      "}",
    ].join("\n");

    const code = run(source);

    assert.match(code, /import \{ ErrorBoundary \} from "litsx";/);
    assert.match(code, /<ErrorBoundary/);
    assert.match(code, /\.fallbackRenderer=\{\(\) => <p>Oops<\/p>\}/);
    assert.match(code, /\.contentRenderer=\{\(\) => <Widget \/>\}/);
    assert.match(code, /\.onError=\{handleError\}/);
    assert.doesNotMatch(code, /errorBoundary\(/);
    assert.doesNotMatch(code, /prepareEffects\(/);
  });

  it("uses keyed(...) when ErrorBoundary receives an explicit key", () => {
    const source = [
      "import { LitElement } from 'lit';",
      "import { ErrorBoundary } from 'react';",
      "",
      "class WithKey extends LitElement {",
      "  render() {",
      "    return (",
      "      <ErrorBoundary key={this.route} fallback={(error) => error.message}>",
      "        <Outlet />",
      "      </ErrorBoundary>",
      "    );",
      "  }",
      "}",
    ].join("\n");

    const code = run(source);

    assert.match(code, /import \{ keyed \} from "lit\/directives\/keyed\.js";/);
    assert.match(
      code,
      /keyed\(this\.route,\s*<ErrorBoundary[\s\S]*\.fallbackRenderer=\{error => error\.message\}[\s\S]*\.contentRenderer=\{\(\) => <Outlet \/>\}[\s\S]*<\/ErrorBoundary>\s*\)/s
    );
  });
});
