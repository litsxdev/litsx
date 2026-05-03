import assert from "assert";
import babelCore from "@babel/core";
import parser from "../packages/babel-parser-litsx/src/index.mjs";
import { describe, it } from "vitest";
import { createUseStateTransform } from "../packages/babel-plugin-shared-hooks/src/index.js";

const { transformFromAstSync } = babelCore;

const plugin = createUseStateTransform({
  importSource: "react",
  hookName: "useState",
  pluginName: "test-shared-hooks-usestate",
});

function run(source) {
  const ast = parser.parse(source, { sourceType: "module" });
  const result = transformFromAstSync(ast, source, {
    configFile: false,
    babelrc: false,
    plugins: [plugin],
  });
  return result.code;
}

describe("@litsx/babel-plugin-shared-hooks createUseStateTransform", () => {
  it("rewrites useState calls to host-aware runtime state and injects prepareEffects", () => {
    const source = `
      import { LitElement } from 'lit';
      import { useState } from 'react';

      class Counter extends LitElement {
        render() {
          const [count, setCount] = useState(1);
          return count + Number(Boolean(setCount));
        }
      }
    `;

    const code = run(source);

    assert.match(code, /import \{ useState, prepareEffects \} from "@litsx\/litsx";|import \{ prepareEffects, useState \} from "@litsx\/litsx";/);
    assert.match(code, /prepareEffects\(this\);/);
    assert.match(code, /const \[count, setCount\] = useState\(this, 1\);/);
    assert.doesNotMatch(code, /from 'react';|from "react";/);
  });

  it("preserves initializer functions when rewriting useState", () => {
    const source = `
      import { LitElement } from 'lit';
      import { useState } from 'react';

      class Counter extends LitElement {
        render() {
          const [count] = useState(() => 1);
          return count;
        }
      }
    `;

    const code = run(source);

    assert.match(code, /const \[count\] = useState\(this, \(\) => 1\);/);
  });

  it("injects host parameters for custom hooks that create state", () => {
    const source = `
      import { useState } from 'react';

      export function useCounter(initial) {
        const [count, setCount] = useState(initial);
        return [count, setCount];
      }
    `;

    const code = run(source);

    assert.match(code, /export function useCounter\(_host, initial\)/);
    assert.match(code, /const \[count, setCount\] = useState\(_host, initial\);/);
  });

  it("merges into an existing litsx runtime import instead of duplicating it", () => {
    const source = `
      import { LitElement } from 'lit';
      import { useId } from '@litsx/litsx';
      import { useState } from 'react';

      class Counter extends LitElement {
        render() {
          const id = useId();
          const [count] = useState(0);
          return String(id) + count;
        }
      }
    `;

    const code = run(source);

    assert.strictEqual((code.match(/from ['"]@litsx\/litsx['"];/g) || []).length, 1);
    assert.match(code, /import \{[^}]*useState[^}]*prepareEffects[^}]*useId[^}]*\} from ['"]@litsx\/litsx['"]|import \{[^}]*useId[^}]*useState[^}]*prepareEffects[^}]*\} from ['"]@litsx\/litsx['"]|import \{[^}]*prepareEffects[^}]*useId[^}]*useState[^}]*\} from ['"]@litsx\/litsx['"]/);
  });

  it("rewrites namespace imports and does not duplicate prepareEffects when already present", () => {
    const namespacePlugin = createUseStateTransform({
      importSource: ["react"],
      hookName: "useState",
      pluginName: "test-shared-hooks-usestate-namespace",
      allowEventAttributeOptionKey: "allowEventAttributes",
    });
    const source = `
      import { LitElement } from 'lit';
      import * as React from 'react';

      class Counter extends LitElement {
        render() {
          prepareEffects(this);
          const [count] = React.useState(0);
          return <button onClick={() => count} />;
        }
      }
    `;
    const ast = parser.parse(source, { sourceType: "module" });
    const result = transformFromAstSync(ast, source, {
      configFile: false,
      babelrc: false,
      plugins: [[namespacePlugin, { allowEventAttributes: true }]],
    });
    const code = result.code;

    assert.strictEqual((code.match(/prepareEffects\(this\);/g) || []).length, 1);
    assert.match(code, /const \[count\] = useState\(this, 0\);/);
    assert.match(code, /onClick/);
  });

  it("inserts a separate runtime import when litsx is already imported as a namespace", () => {
    const source = `
      import { LitElement } from 'lit';
      import * as runtime from '@litsx/litsx';
      import { useState } from 'react';

      class Counter extends LitElement {
        render() {
          const [count] = useState(0);
          return String(runtime) + count;
        }
      }
    `;

    const code = run(source);

    assert.match(code, /import \* as runtime from '@litsx\/litsx';|import \* as runtime from "@litsx\/litsx";/);
    assert.strictEqual((code.match(/from ['"]@litsx\/litsx['"];/g) || []).length, 2);
    assert.match(code, /import \{ useState, prepareEffects \} from ['"]@litsx\/litsx['"]|import \{ prepareEffects, useState \} from ['"]@litsx\/litsx['"]/);
    assert.match(code, /const \[count\] = useState\(this, 0\);/);
  });

  it("preserves already host-aware useState calls while still wiring prepareEffects and runtime imports", () => {
    const source = `
      import { LitElement } from 'lit';
      import { useState } from 'react';

      class Counter extends LitElement {
        render() {
          const [count] = useState(this, 0);
          return count;
        }
      }
    `;

    const code = run(source);

    assert.match(code, /import \{ useState, prepareEffects \} from "@litsx\/litsx";|import \{ prepareEffects, useState \} from "@litsx\/litsx";/);
    assert.strictEqual((code.match(/useState\(this, 0\)/g) || []).length, 1);
    assert.match(code, /prepareEffects\(this\);/);
    assert.doesNotMatch(code, /useState\(this, this, 0\)/);
  });

  it("throws when useState cannot resolve a host context", () => {
    const source = `
      import { useState } from 'react';

      function plainUtility() {
        return useState(0);
      }
    `;

    assert.throws(() => run(source), /unable to resolve host for useState inside custom hook/);
  });
});
