import assert from "assert";
import babelCore from "@babel/core";
import parser from "../packages/babel-parser-litsx/src/index.mjs";
import { describe, it } from "vitest";
import { createUseRefTransform } from "../packages/babel-plugin-shared-hooks/src/index.js";

const { transformFromAstSync } = babelCore;

const plugin = createUseRefTransform({
  importSource: "react",
  hookName: "useRef",
  pluginName: "test-shared-hooks-useref",
});

function run(source, parserOptions = {}) {
  const ast = parser.parse(source, {
    sourceType: "module",
    ...(parserOptions || {}),
  });
  const result = transformFromAstSync(ast, source, {
    configFile: false,
    babelrc: false,
    plugins: [plugin],
  });
  return result.code;
}

describe("@litsx/babel-plugin-shared-hooks createUseRefTransform", () => {
  it("rewrites mutable DOM refs with a runtime ref import, getter, and data-ref attribute", () => {
    const source = `
      import { LitElement } from 'lit';
      import { useRef } from 'react';

      class SearchInput extends LitElement {
        render() {
          const inputRef = useRef(null);
          return <input ref={inputRef} />;
        }
      }
    `;

    const code = run(source);

    assert.match(code, /import \{ useRef, useCallbackRef \} from "@litsx\/litsx";|import \{ useCallbackRef, useRef \} from "@litsx\/litsx";/);
    assert.match(code, /get _inputRefElement\(\)/);
    assert.match(code, /data-ref="_inputRefElement"/);
    assert.match(code, /const inputRef = useRef\(this, null\);/);
    assert.match(code, /useCallbackRef\(this, \(\) => this\._inputRefElement, node => inputRef\.current = node\);/);
    assert.strictEqual((code.match(/get _inputRefElement\(\)/g) || []).length, 1);
  });

  it("keeps component refs as .ref bindings rather than DOM getters", () => {
    const source = `
      import { LitElement } from 'lit';
      import { useRef } from 'react';

      class TypedRefs extends LitElement {
        render() {
          const buttonRef = useRef<HTMLButtonElement | null>(null);
          return <FancyButton ref={buttonRef} .label={this.label}>{this.count}</FancyButton>;
        }
      }
    `;

    const code = run(source, { plugins: ["typescript"] });

    assert.match(code, /\.ref=\{buttonRef\}/);
    assert.doesNotMatch(code, /get _buttonRefElement\(\)/);
    assert.doesNotMatch(code, /data-ref="_buttonRefElement"/);
  });

  it("supports callback refs inside html templates", () => {
    const source = `
      import { LitElement, html } from 'lit';

      class CallbackRef extends LitElement {
        render() {
          return html\`<button ref="\${node => this.register(node)}">Click</button>\`;
        }

        register(node) {
          this._node = node;
        }
      }
    `;

    const code = run(source);

    assert.match(code, /import \{ useCallbackRef \} from "@litsx\/litsx";/);
    assert.match(code, /get _ref\(\)/);
    assert.match(code, /useCallbackRef\(this, \(\) => this\._ref, node => this\.register\(node\)\);/);
    assert.match(code, /html`<button data-ref="_ref">Click<\/button>`/);
  });

  it("supports bare html ref bindings and avoids duplicating an existing getter", () => {
    const source = `
      import { LitElement, html } from 'lit';

      class CallbackRef extends LitElement {
        get _ref() {
          return this.renderRoot?.querySelector('[data-ref="_ref"]');
        }

        render() {
          return html\`<button ref=\${node => this.register(node)}>Click</button>\`;
        }

        register(node) {
          this._node = node;
        }
      }
    `;

    const code = run(source);

    assert.strictEqual((code.match(/get _ref\(\)/g) || []).length, 1);
    assert.match(code, /html`<button data-ref="_ref">Click<\/button>`/);
  });

  it("injects host parameters for custom hooks that create refs", () => {
    const source = `
      import { useRef } from 'react';

      export function useLatest(value) {
        const ref = useRef();
        ref.current = value;
        return ref;
      }
    `;

    const code = run(source);

    assert.match(code, /export function useLatest\(_host, value\)/);
    assert.match(code, /const ref = useRef\(_host\);/);
    assert.doesNotMatch(code, /from 'react';|from "react";/);
  });

  it("preserves already host-aware mutable refs and adds a separate runtime import after litsx namespaces", () => {
    const source = `
      import { LitElement } from 'lit';
      import * as runtime from '@litsx/litsx';
      import { useRef } from 'react';

      class SearchInput extends LitElement {
        render() {
          const inputRef = useRef(this, null);
          return <input ref={inputRef} />;
        }
      }
    `;

    const code = run(source);

    assert.match(code, /import \* as runtime from '@litsx\/litsx';|import \* as runtime from "@litsx\/litsx";/);
    assert.strictEqual((code.match(/from ['"]@litsx\/litsx['"];/g) || []).length, 2);
    assert.strictEqual((code.match(/useRef\(this, null\)/g) || []).length, 1);
    assert.doesNotMatch(code, /useRef\(this, this, null\)/);
    assert.match(code, /import \{ useRef, useCallbackRef \} from ['"]@litsx\/litsx['"]|import \{ useCallbackRef, useRef \} from ['"]@litsx\/litsx['"]/);
    assert.doesNotMatch(code, /import \{ useRef \} from 'react';|import \{ useRef \} from "react";/);
  });

  it("errors on useRef calls outside render methods and custom hooks", () => {
    const source = `
      import { useRef } from 'react';

      function plainUtility() {
        return useRef(null);
      }
    `;

    assert.throws(
      () => run(source),
      /unsupported useRef\(\) usage outside a render method or custom hook/
    );
  });
});
