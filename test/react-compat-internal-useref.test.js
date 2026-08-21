import assert from "assert";
import babelCore from "@babel/core";
import parser from "./helpers/litsx-parser.js";
import { describe, it } from "vitest";
import { reactUseRef as plugin } from "../packages/babel-preset-react-compat/src/internal/react-shared-hooks.js";

const { transformFromAstSync } = babelCore;

describe("react compat internal useRef", () => {
  it("creates Lit-backed React refs and preserves JSX refs for final lowering", () => {
    const source = `
      import { LitElement, html } from 'lit';
      import { useRef, useEffect } from 'react';

      class SearchInput extends LitElement {
        render() {
          const inputRef = useRef(null);

          useEffect(() => {
            inputRef.current.focus();
          }, []);

          return (
            <div>
              <label htmlFor="search">Buscar:</label>
              <input id="search" type="text" ref={inputRef} placeholder="Escribe aquí..." />
            </div>
          );
        }
      }
    `;

    const ast = parser.parse(source, { sourceType: "module" });
    const { code } = transformFromAstSync(ast, source, {
      configFile: false,
      babelrc: false,
      plugins: [plugin],
    });

    assert.match(code, /import \{ useReactRef as useRef \} from "@litsx\/core\/react-compat";/);
    assert.match(code, /const inputRef = useRef\(this, null\);/);
    assert.doesNotMatch(code, /const inputRef\s*=\s*this\.inputRef/);
    assert.match(code, /ref=\{inputRef\}/);
    assert.doesNotMatch(code, /data-ref|querySelector|useCallbackRef/);
  });

  it("removes the useRef import once transformed", () => {
    const source = `
      import { LitElement, html } from 'lit';
      import { useRef, useEffect } from 'react';

      class InlineForm extends LitElement {
        render() {
          const formRef = useRef(null);
          useEffect(() => {
            formRef.current.requestSubmit();
          }, []);

          return (
            <form ref={formRef}>
              <slot></slot>
            </form>
          );
        }
      }
    `;

    const ast = parser.parse(source, { sourceType: "module" });
    const { code } = transformFromAstSync(ast, source, {
      configFile: false,
      babelrc: false,
      plugins: [plugin],
    });

    assert.doesNotMatch(
      code,
      /import\s+\{[^}]*\buseRef\b[^}]*\}\s+from ['"]react['"]/,
      "useRef should be removed from the React import"
    );
    assert.match(code, /useReactRef as useRef/);
    assert.match(code, /useEffect/, "other React imports should remain");
  });

  it("handles multiple useRef declarations", () => {
    const source = `
      import { LitElement, html } from 'lit';
      import { useRef } from 'react';

      class DualRefs extends LitElement {
        render() {
          const firstRef = useRef(null);
          const secondRef = useRef(null);

          return (
            <div>
              <input ref={firstRef} />
              <button ref={secondRef}>Submit</button>
            </div>
          );
        }
      }
    `;

    const ast = parser.parse(source, { sourceType: "module" });
    const { code } = transformFromAstSync(ast, source, {
      configFile: false,
      babelrc: false,
      plugins: [plugin],
    });

    assert.match(code, /ref=\{firstRef\}/);
    assert.match(code, /ref=\{secondRef\}/);
    assert.doesNotMatch(code, /data-ref|querySelector|useCallbackRef/);
  });

  it("supports TypeScript generic arguments in useRef", () => {
    const source = `
      import { LitElement, html } from 'lit';
      import { useRef } from 'react';

      class TypedRefs extends LitElement {
        render() {
          const buttonRef = useRef<HTMLButtonElement | null>(null);

          return (
            <div>
              <FancyButton ref={buttonRef} .label={this.label}>{this.count}</FancyButton>
            </div>
          );
        }
      }
    `;

    const ast = parser.parse(source, {
      sourceType: "module",
      plugins: ["typescript"],
    });
    const { code } = transformFromAstSync(ast, source, {
      configFile: false,
      babelrc: false,
      plugins: [plugin],
    });

    assert.doesNotMatch(code, /get _buttonRefElement\(\)/, "component refs should not create element getters");
    assert.match(code, /\.ref=\{buttonRef\}/, "expected component refs to lower to a ref property");
    assert.doesNotMatch(code, /data-ref="_buttonRefElement"/, "component refs should not become data-ref lookups");
    assert.doesNotMatch(code, /(^|[^.])ref=\{buttonRef\}/, "raw JSX ref attribute should be removed");
    assert.doesNotMatch(
      code,
      /useRef<[^>]+>\([^)]*\)/,
      "generic useRef call should be removed from render body"
    );
  });

  it("rewrites value-holding refs to useRef", () => {
    const source = [
      "import { LitElement } from 'lit';",
      "import { useRef } from 'react';",
      "",
      "class ValueRef extends LitElement {",
      "  render() {",
      "    const latest = useRef(0);",
      "    latest.current = this.count;",
      "    return latest.current;",
      "  }",
      "}",
    ].join("\n");

    const ast = parser.parse(source, { sourceType: "module" });
    const { code } = transformFromAstSync(ast, source, {
      configFile: false,
      babelrc: false,
      plugins: [plugin],
    });

    assert.match(code, /useReactRef as useRef/);
    assert.match(code, /const latest = useRef\(this, 0\);/);
    assert.doesNotMatch(code, /import \{ useRef \} from 'react';|import \{ useRef \} from "react";/);
  });

  it("supports custom hooks that return refs", () => {
    const source = [
      "import { useRef } from 'react';",
      "",
      "export function useLatest(value) {",
      "  const ref = useRef();",
      "  ref.current = value;",
      "  return ref;",
      "}",
    ].join("\n");

    const ast = parser.parse(source, { sourceType: "module" });
    const { code } = transformFromAstSync(ast, source, {
      configFile: false,
      babelrc: false,
      plugins: [plugin],
    });

    assert.match(code, /useReactRef as useRef/);
    assert.match(code, /export function useLatest\(_[A-Za-z0-9]+, value\)/);
    assert.match(code, /const ref = useRef\(_[A-Za-z0-9]+\);/);
    assert.match(code, /ref\.current = value;/);
    assert.doesNotMatch(code, /import \{ useRef \} from 'react';|import \{ useRef \} from "react";/);
  });

  it("leaves raw Lit templates to Lit's native ref directive authoring", () => {
    const source = [
      "import { LitElement, html } from 'lit';",
      "class CallbackRef extends LitElement {",
      "  render() {",
      "    return html`<button ref=\"${node => this.register(node)}\">Click</button>`;",
      "  }",
      "  register(node) {",
      "    this._node = node;",
      "  }",
      "}",
    ].join("\n");

    const ast = parser.parse(source, { sourceType: "module", plugins: ["jsx"] });
    const { code } = transformFromAstSync(ast, source, {
      configFile: false,
      babelrc: false,
      plugins: [plugin],
      generatorOpts: { decoratorsBeforeExport: true },
    });

    assert.match(code, /html`<button ref="\$\{node => this\.register\(node\)\}">/);
    assert.doesNotMatch(code, /data-ref|querySelector|useCallbackRef/);
  });

  it("handles optional chaining on ref usage", () => {
    const source = [
      "import { LitElement, html } from 'lit';",
      "import { useRef } from 'react';",
      "class OptionalRef extends LitElement {",
      "  render() {",
      "    const buttonRef = useRef(null);",
      "    buttonRef?.current?.focus?.();",
      "    return html`<button ref=\"${buttonRef}\">Click</button>`;",
      "  }",
      "}",
    ].join("\n");

    const ast = parser.parse(source, { sourceType: "module", plugins: ["jsx"] });
    const { code } = transformFromAstSync(ast, source, {
      configFile: false,
      babelrc: false,
      plugins: [plugin],
    });

    assert.match(code, /buttonRef\?\.current\?\.focus\?\.\(\)/);
    assert.match(code, /ref="\$\{buttonRef\}"/);
  });

  it("does not reinterpret raw Lit template attributes", () => {
    const source = [
      "import { LitElement, html } from 'lit';",
      "import { useRef } from 'react';",
      "class TemplateRefs extends LitElement {",
      "  render() {",
      "    const listRef = useRef(null);",
      "    return html`<ul ref=\"${listRef}\" />`;",
      "  }",
      "}",
    ].join("\n");

    const ast = parser.parse(source, { sourceType: "module" });
    const { code } = transformFromAstSync(ast, source, {
      configFile: false,
      babelrc: false,
      plugins: [plugin],
    });

    assert.match(code, /ref="\$\{listRef\}"/);
    assert.doesNotMatch(code, /data-ref|querySelector/);
  });

  it("keeps a mutable ref object when a JSX ref is also used opaquely", () => {
    const source = [
      "import { LitElement, html } from 'lit';",
      "import { useRef } from 'react';",
      "class ManagedRef extends LitElement {",
      "  render() {",
      "    const inputRef = useRef(null);",
      "    this.track(inputRef);",
      "    return <input ref={inputRef} />;",
      "  }",
      "}",
    ].join("\n");

    const ast = parser.parse(source, { sourceType: "module" });
    const { code } = transformFromAstSync(ast, source, {
      configFile: false,
      babelrc: false,
      plugins: [plugin],
    });

    assert.match(code, /useReactRef as useRef/);
    assert.match(code, /const inputRef = useRef\(this, null\);/);
    assert.match(code, /ref=\{inputRef\}/);
    assert.match(code, /this\.track\(inputRef\);/);
    assert.doesNotMatch(code, /data-ref|querySelector|useCallbackRef/);
  });

  it("keeps a mutable ref object when a JSX ref also writes to current", () => {
    const source = [
      "import { LitElement, html } from 'lit';",
      "import { useRef } from 'react';",
      "class AssignedRef extends LitElement {",
      "  render() {",
      "    const inputRef = useRef(null);",
      "    inputRef.current = this.fallbackNode;",
      "    return html`<input ref=\"${inputRef}\" />`;",
      "  }",
      "}",
    ].join("\n");

    const ast = parser.parse(source, { sourceType: "module" });
    const { code } = transformFromAstSync(ast, source, {
      configFile: false,
      babelrc: false,
      plugins: [plugin],
    });

    assert.match(code, /const inputRef = useRef\(this, null\);/);
    assert.match(code, /inputRef\.current = this\.fallbackNode;/);
    assert.match(code, /ref="\$\{inputRef\}"/);
    assert.doesNotMatch(code, /data-ref|querySelector|useCallbackRef/);
    assert.doesNotMatch(code, /this\.inputRef/);
  });

  it("does not duplicate getters when already present", () => {
    const source = [
      "import { LitElement, html } from 'lit';",
      "import { useRef } from 'react';",
      "class CustomGetter extends LitElement {",
      "  get buttonRef() {",
      "    return this.renderRoot.querySelector('[data-ref=\"buttonRef\"]');",
      "  }",
      "  render() {",
      "    const buttonRef = useRef(null);",
      "    return html`<button ref=\"${buttonRef}\">Click</button>`;",
      "  }",
      "}",
    ].join("\n");

    const ast = parser.parse(source, { sourceType: "module" });
    const { code } = transformFromAstSync(ast, source, {
      configFile: false,
      babelrc: false,
      plugins: [plugin],
    });

    const getterCount = (code.match(/get buttonRef\(\)/g) || []).length;
    assert.strictEqual(getterCount, 1);
  });

  it("removes the entire React import when useRef is unused afterwards", () => {
    const source = `
      import { LitElement, html } from 'lit';
      import { useRef } from 'react';

      class OnlyRef extends LitElement {
        render() {
          const divRef = useRef(null);
          return <div ref={divRef}></div>;
        }
      }
    `;

    const ast = parser.parse(source, { sourceType: "module" });
    const { code } = transformFromAstSync(ast, source, {
      configFile: false,
      babelrc: false,
      plugins: [plugin],
    });

    assert.doesNotMatch(code, /from 'react'/);
  });
});
