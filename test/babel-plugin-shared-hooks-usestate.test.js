import assert from "assert";
import * as babelCore from "@babel/core";
import parser from "./helpers/litsx-parser.js";
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
  it("validates required options", () => {
    assert.throws(() => createUseStateTransform({}), /requires importSource/);
    assert.throws(
      () => createUseStateTransform({
        importSource: [],
        hookName: "useState",
        pluginName: "x",
      }),
      /requires importSource/
    );
    assert.throws(
      () => createUseStateTransform({
        importSource: "react",
        pluginName: "x",
      }),
      /requires importSource, hookName, and pluginName/
    );
  });

  it("rewrites useState calls without changing their authored arguments", () => {
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

    assert.match(code, /import \{[^}]*useState[^}]*renderWithHooks[^}]*\} from "@litsx\/core";/);
    assert.match(code, /renderWithHooks\(this, \(\) => \{/);
    assert.match(code, /const \[count, setCount\] = useState\(1\);/);
    assert.doesNotMatch(code, /prepareEffects|useState\(this,/);
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

    assert.match(code, /const \[count\] = useState\(\(\) => 1\);/);
  });

  it("preserves custom hook signatures and calls", () => {
    const source = `
      import { useState } from 'react';

      export function useCounter(initial) {
        const [count, setCount] = useState(initial);
        return [count, setCount];
      }
    `;

    const code = run(source);

    assert.match(code, /export function useCounter\(initial\)/);
    assert.match(code, /const \[count, setCount\] = useState\(initial\);/);
    assert.doesNotMatch(code, /_host|renderWithHooks/);
  });

  it("merges into an existing litsx runtime import instead of duplicating it", () => {
    const source = `
      import { LitElement } from 'lit';
      import { useId } from '@litsx/core';
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

    assert.strictEqual((code.match(/from ['"]@litsx\/core['"];/g) || []).length, 1);
    assert.match(code, /import \{[^}]*useState[^}]*useId[^}]*renderWithHooks[^}]*\} from ['"]@litsx\/core['"]|import \{[^}]*useId[^}]*useState[^}]*renderWithHooks[^}]*\} from ['"]@litsx\/core['"]/);
  });

  it("rewrites namespace imports behind the render boundary", () => {
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

    assert.doesNotMatch(code, /prepareEffects/);
    assert.match(code, /renderWithHooks\(this, \(\) => \{/);
    assert.match(code, /const \[count\] = useState\(0\);/);
    assert.match(code, /onClick/);
  });

  it("inserts a separate runtime import when litsx is already imported as a namespace", () => {
    const source = `
      import { LitElement } from 'lit';
      import * as runtime from '@litsx/core';
      import { useState } from 'react';

      class Counter extends LitElement {
        render() {
          const [count] = useState(0);
          return String(runtime) + count;
        }
      }
    `;

    const code = run(source);

    assert.match(code, /import \* as runtime from '@litsx\/core';|import \* as runtime from "@litsx\/core";/);
    assert.strictEqual((code.match(/from ['"]@litsx\/core['"];/g) || []).length, 2);
    assert.match(code, /import \{[^}]*useState[^}]*renderWithHooks[^}]*\} from ['"]@litsx\/core['"]/);
    assert.match(code, /const \[count\] = useState\(0\);/);
  });

  it("does not reinterpret an authored first argument as an internal host", () => {
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

    assert.match(code, /import \{[^}]*useState[^}]*renderWithHooks[^}]*\} from "@litsx\/core";/);
    assert.strictEqual((code.match(/useState\(this, 0\)/g) || []).length, 1);
    assert.doesNotMatch(code, /prepareEffects/);
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

  it("rejects React-style event attributes in render by default", () => {
    const source = `
      import { LitElement } from 'lit';
      import { useState } from 'react';

      class Counter extends LitElement {
        render() {
          const [count] = useState(0);
          return <button onClick={() => count}>Save</button>;
        }
      }
    `;

    assert.throws(() => run(source), /React-style event attributes are not allowed/);
  });

  it("inserts fallback runtime imports when an existing runtime import only provides a namespace", () => {
    const source = `
      import * as runtime from '@litsx/core';
      import React from 'react';

      class Counter {
        render() {
          const [count] = React.useState(this, 0);
          return String(runtime) + count;
        }
      }
    `;

    const code = run(source);

    assert.match(code, /import \* as runtime from '@litsx\/core';|import \* as runtime from "@litsx\/core";/);
    assert.match(
      code,
      /import \{[^}]*useState[^}]*renderWithHooks[^}]*\} from ['"]@litsx\/core['"]/
    );
    assert.doesNotMatch(code, /prepareEffects/);
  });
});
