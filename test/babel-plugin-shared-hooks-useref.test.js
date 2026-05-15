import assert from "assert";
import babelCore from "@babel/core";
import parser from "../packages/babel-parser-litsx/src/index.js";
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
  it("validates required options", () => {
    assert.throws(() => createUseRefTransform({}), /requires importSource/);
    assert.throws(
      () => createUseRefTransform({
        importSource: [],
        hookName: "useRef",
        pluginName: "x",
      }),
      /requires importSource/
    );
    assert.throws(
      () => createUseRefTransform({
        importSource: "react",
        pluginName: "x",
      }),
      /requires importSource, hookName, and pluginName/
    );
  });

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

    assert.match(code, /import \{ useRef, useCallbackRef \} from "@litsx\/core";|import \{ useCallbackRef, useRef \} from "@litsx\/core";/);
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

  it("treats namespaced component refs as .ref bindings too", () => {
    const source = `
      import { LitElement } from 'lit';
      import { useRef } from 'react';

      class TypedRefs extends LitElement {
        render() {
          const buttonRef = useRef(null);
          return <UI.Button ref={buttonRef} .label={this.label}>{this.count}</UI.Button>;
        }
      }
    `;

    const code = run(source);

    assert.match(code, /\.ref=\{buttonRef\}/);
    assert.doesNotMatch(code, /data-ref="_buttonRefElement"/);
    assert.doesNotMatch(code, /get _buttonRefElement\(\)/);
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

    assert.match(code, /import \{ useCallbackRef \} from "@litsx\/core";/);
    assert.match(code, /get _ref\(\)/);
    assert.match(code, /useCallbackRef\(this, \(\) => this\._ref, node => this\.register\(node\)\);/);
    assert.match(code, /html`<button data-ref="_ref">Click<\/button>`/);
  });

  it("aliases the runtime callback helper when useCallbackRef is already bound in module scope", () => {
    const source = `
      import { LitElement } from 'lit';

      const useCallbackRef = Symbol('local');

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

    assert.match(
      code,
      /import \{ useCallbackRef as _useCallbackRef \} from "@litsx\/core";/
    );
    assert.match(code, /_useCallbackRef\(this, \(\) => this\._ref, node => this\.register\(node\)\);/);
    assert.match(code, /const useCallbackRef = Symbol\(['"]local['"]\);/);
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
      import * as runtime from '@litsx/core';
      import { useRef } from 'react';

      class SearchInput extends LitElement {
        render() {
          const inputRef = useRef(this, null);
          return <input ref={inputRef} />;
        }
      }
    `;

    const code = run(source);

    assert.match(code, /import \* as runtime from '@litsx\/core';|import \* as runtime from "@litsx\/core";/);
    assert.strictEqual((code.match(/from ['"]@litsx\/core['"];/g) || []).length, 2);
    assert.strictEqual((code.match(/useRef\(this, null\)/g) || []).length, 1);
    assert.doesNotMatch(code, /useRef\(this, this, null\)/);
    assert.match(code, /import \{ useRef, useCallbackRef \} from ['"]@litsx\/core['"]|import \{ useCallbackRef, useRef \} from ['"]@litsx\/core['"]/);
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

  it("errors when a module mixes lowered and unresolved useRef calls from the same import", () => {
    const source = `
      import { LitElement } from 'lit';
      import { useRef } from 'react';

      function plainUtility() {
        return useRef(null);
      }

      class SearchInput extends LitElement {
        render() {
          const inputRef = useRef(null);
          return <input ref={inputRef} />;
        }
      }
    `;

    assert.throws(
      () => run(source),
      /unsupported useRef\(\) usage outside a render method or custom hook/
    );
  });

  it("removes unused useRef imports when no live references remain", () => {
    const source = `
      import { useRef } from 'react';

      const value = 1;
      export { value };
    `;

    const code = run(source);

    assert.doesNotMatch(code, /useRef/);
    assert.match(code, /const value = 1;/);
  });

  it("allows mixed lowered and unresolved runtime-native useRef calls without enforcement", () => {
    const runtimePlugin = createUseRefTransform({
      importSource: "@litsx/core",
      hookName: "useRef",
      pluginName: "test-shared-hooks-useref-runtime-native",
    });

    const source = `
      import { LitElement } from 'lit';
      import { useRef } from '@litsx/core';

      function plainUtility() {
        return useRef(null);
      }

      class SearchInput extends LitElement {
        render() {
          const inputRef = useRef(null);
          return <input ref={inputRef} />;
        }
      }
    `;

    const ast = parser.parse(source, { sourceType: "module" });
    const result = transformFromAstSync(ast, source, {
      configFile: false,
      babelrc: false,
      plugins: [runtimePlugin],
    });
    const code = result.code;

    assert.match(code, /function plainUtility\(\) \{\s*return useRef\(null\);/);
    assert.match(code, /const inputRef = useRef\(this, null\);/);
    assert.match(code, /data-ref="_inputRefElement"/);
  });

  it("allows unresolved runtime-native useRef references when none of them can be lowered", () => {
    const runtimePlugin = createUseRefTransform({
      importSource: "@litsx/core",
      hookName: "useRef",
      pluginName: "test-shared-hooks-useref-runtime-native-unresolved",
    });

    const source = `
      import { useRef } from '@litsx/core';

      function plainUtility() {
        return useRef;
      }
    `;

    const ast = parser.parse(source, { sourceType: "module" });
    const result = transformFromAstSync(ast, source, {
      configFile: false,
      babelrc: false,
      plugins: [runtimePlugin],
    });
    const code = result.code;

    assert.match(code, /import \{ useRef \} from ['"]@litsx\/core['"];/);
    assert.match(code, /return useRef;/);
  });

  it("supports alternate hook names and can skip mutable lowering when only managed DOM refs are enabled", () => {
    const managedOnlyPlugin = createUseRefTransform({
      importSource: "react",
      hookNames: ["useManagedRef"],
      pluginName: "test-shared-hooks-useref-managed-only",
      onlyManagedDomRefs: true,
    });

    const source = `
      import { LitElement } from 'lit';
      import { useManagedRef } from 'react';

      class SearchInput extends LitElement {
        render() {
          const inputRef = useManagedRef(null);
          return <input ref={inputRef} />;
        }
      }
    `;

    const ast = parser.parse(source, { sourceType: "module" });
    const result = transformFromAstSync(ast, source, {
      configFile: false,
      babelrc: false,
      plugins: [managedOnlyPlugin],
    });
    const code = result.code;

    assert.match(code, /data-ref="_inputRefElement"/);
    assert.match(code, /import \{ useRef as useManagedRef, useCallbackRef \} from "@litsx\/core";|import \{ useCallbackRef, useRef as useManagedRef \} from "@litsx\/core";/);
    assert.match(code, /useManagedRef\(this, null\);/);
    assert.match(code, /useCallbackRef\(this, \(\) => this\._inputRefElement, node => inputRef\.current = node\);/);
  });

  it("surfaces unresolved host errors after queueing pending mutable ref calls", () => {
    const runtimePlugin = createUseRefTransform({
      importSource: "@litsx/core",
      hookName: "useRef",
      pluginName: "test-shared-hooks-useref-runtime-native-pending-error",
    });

    const source = `
      import { useRef } from '@litsx/core';

      function plainUtility() {
        const valueRef = useRef(null);
        return valueRef.current;
      }
    `;

    const ast = parser.parse(source, { sourceType: "module" });

    assert.throws(
      () => transformFromAstSync(ast, source, {
        configFile: false,
        babelrc: false,
        plugins: [runtimePlugin],
      }),
      /unable to resolve host for useRef inside custom hook/,
    );
  });

  it("preserves unresolved template ref expressions that are not authored as ref attributes", () => {
    const source = `
      import { LitElement, html } from 'lit';
      import { useRef } from 'react';

      class SearchInput extends LitElement {
        render() {
          const inputRef = useRef(null);
          return html\`<button class="\${inputRef}">Click</button>\`;
        }
      }
    `;

    const code = run(source);

    assert.match(code, /html`<button class="\$\{inputRef\}">Click<\/button>`/);
    assert.doesNotMatch(code, /data-ref=/);
    assert.match(code, /const inputRef = useRef\(this, null\);/);
  });

  it("keeps callback refs on components as .ref bindings", () => {
    const source = `
      import { LitElement } from 'lit';

      class SearchInput extends LitElement {
        render() {
          return <FancyButton ref={node => this.register(node)} />;
        }

        register(node) {
          this._node = node;
        }
      }
    `;

    const code = run(source);

    assert.match(code, /\.ref=\{node => this\.register\(node\)\}/);
    assert.doesNotMatch(code, /data-ref=/);
    assert.doesNotMatch(code, /useCallbackRef/);
  });

  it("lowers callback refs on DOM JSX elements inside render methods", () => {
    const source = `
      import { LitElement } from 'lit';

      class SearchInput extends LitElement {
        render() {
          return <input ref={node => this.register(node)} />;
        }

        register(node) {
          this._node = node;
        }
      }
    `;

    const code = run(source);

    assert.match(code, /import \{ useCallbackRef \} from "@litsx\/core";/);
    assert.match(code, /get _ref\(\)/);
    assert.match(code, /data-ref="_ref"/);
    assert.match(code, /useCallbackRef\(this, \(\) => this\._ref, node => this\.register\(node\)\);/);
  });

  it("ignores template callbacks that are not attached to ref attributes", () => {
    const source = `
      import { LitElement, html } from 'lit';

      class SearchInput extends LitElement {
        render() {
          return html\`<button data-handler=\${node => this.register(node)}>Click</button>\`;
        }

        register(node) {
          this._node = node;
        }
      }
    `;

    const code = run(source);

    assert.match(code, /data-handler=\$\{node => this\.register\(node\)\}/);
    assert.doesNotMatch(code, /useCallbackRef/);
    assert.doesNotMatch(code, /data-ref=/);
  });

  it("leaves callback refs inside class expressions untouched when no class declaration host exists", () => {
    const source = `
      import { html } from 'lit';

      export const SearchInput = class extends BaseElement {
        render() {
          return html\`<button ref=\${node => this.register(node)}>Click</button>\`;
        }

        register(node) {
          this._node = node;
        }
      }
    `;

    const code = run(source);

    assert.match(code, /ref=\$\{node => this\.register\(node\)\}/);
    assert.doesNotMatch(code, /data-ref=/);
    assert.doesNotMatch(code, /useCallbackRef/);
  });
});
