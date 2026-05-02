import assert from "assert";
import * as babelCore from "@babel/core";
import parser from "../packages/babel-parser-litsx/src/index.mjs";
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
  it("rewrites React useState calls to host-aware runtime state", () => {
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
      /import \{ useState, prepareEffects \} from "litsx";|import \{ prepareEffects, useState \} from "litsx";/
    );
    assert.match(code, /const \[count, setCount\] = useState\(this, 1\);/);
    assert.match(code, /prepareEffects\(this\);/);
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

    assert.match(code, /const \[count\] = useState\(this, 0\);/);
    assert.match(code, /onClick/);
  });

  it("preserves already host-aware calls without duplicating the host argument", () => {
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
    assert.match(code, /prepareEffects\(this\);/);
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
