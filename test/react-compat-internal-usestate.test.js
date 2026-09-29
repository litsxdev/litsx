import assert from "assert";
import * as babelCore from "@babel/core";
import parser from "./helpers/litsx-parser.js";
import { describe, it } from "vitest";
import { reactUseState as plugin } from "../packages/babel-preset-react-compat/src/internal/react-shared-hooks.js";

const { transformFromAstSync } = babelCore;

function run(source, options = {}) {
  const ast = parser.parse(source, {
    sourceType: "module",
    plugins: ["jsx", "typescript"],
  });

  const result = transformFromAstSync(ast, source, {
    configFile: false,
    babelrc: false,
    plugins: [[plugin, options]],
  });

  return result.code;
}

describe("react compat internal useState", () => {
  it("rewrites React useState calls behind a render boundary", () => {
    const source = `
      import { LitElement } from "lit";
      import { useState, useEffect } from "react";

      class Counter extends LitElement {
        render() {
          const [count, setCount] = useState(1);
          useEffect(() => {
            setCount((value) => value + 1);
          }, []);
          return count;
        }
      }
    `;

    const code = run(source);

    assert.match(
      code,
      /import \{[^}]*useState[^}]*renderWithHooks[^}]*\} from "@litsx\/core";/
    );
    assert.match(code, /const \[count, setCount\] = useState\(1\);/);
    assert.match(code, /renderWithHooks\(this, \(\) => \{/);
    assert.doesNotMatch(code, /prepareEffects/);
    assert.match(code, /useEffect/);
    assert.doesNotMatch(code, /import \{[^}]*\buseState\b[^}]*\} from "react";/);
  });

  it("allows authored onClick when allowReactAttributes is enabled", () => {
    const source = `
      import { LitElement } from "lit";
      import { useState } from "react";

      class Counter extends LitElement {
        render() {
          const [count] = useState(0);
          return <button onClick={() => count}>{count}</button>;
        }
      }
    `;

    const code = run(source, { allowReactAttributes: true });

    assert.match(code, /const \[count\] = useState\(0\);/);
    assert.match(code, /onClick/);
  });

  it("does not reinterpret authored first arguments as an internal host", () => {
    const source = `
      import { LitElement } from "lit";
      import { useState } from "react";

      class Counter extends LitElement {
        render() {
          const [count] = useState(this, 0);
          return count;
        }
      }
    `;

    const code = run(source);

    assert.strictEqual((code.match(/useState\(this, 0\)/g) || []).length, 1);
    assert.doesNotMatch(code, /useState\(this, this, 0\)/);
    assert.doesNotMatch(code, /prepareEffects/);
  });

  it("throws on authored React event attributes by default", () => {
    const source = `
      import { LitElement } from "lit";
      import { useState } from "react";

      class Counter extends LitElement {
        render() {
          const [count] = useState(0);
          return <button onClick={() => count}>{count}</button>;
        }
      }
    `;

    assert.throws(
      () => run(source),
      /React-style event attributes are not allowed/
    );
  });
});
