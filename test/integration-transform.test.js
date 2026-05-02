import assert from "assert";
import * as babelCore from "@babel/core";
import parser from "../packages/babel-parser-litsx/src/index.mjs";
import { beforeAll } from 'vitest';
import { interopDefault } from "./helpers/interop-default.js";

const { transformFromAstSync } = babelCore;
let REACT_COMPAT_PRESET;

describe("integration: parser + all plugins", () => {
  beforeAll(async () => {
    const mod = await import("../packages/babel-preset-react-compat/src/index.js");
    REACT_COMPAT_PRESET = interopDefault(mod);
  });

  it("transforms a component using propTypes, useRef, and JSX", () => {
    const source = `
      import { useRef, useEffect } from 'react';
      import PropTypes from 'prop-types';
      import FancyButton from './FancyButton.js';

      const FancyForm = (props) => {
        const buttonRef = useRef(null);

        useEffect(() => {
          buttonRef.current.focus();
        }, []);

        return (
          <div>
            <FancyButton ref={buttonRef} .label={props.label} />
          </div>
        );
      };

      FancyForm.propTypes = {
        label: PropTypes.string,
      };

      export const Alert = (message) => {
        const lower = message.toLowerCase();
        return <p>{lower}</p>;
      };
    `;

    const ast = parser.parse(source, { sourceType: "module" });
    const { code } = transformFromAstSync(ast, source, {
      configFile: false,
      babelrc: false,
      presets: [[REACT_COMPAT_PRESET, { jsxTemplate: false }]],
      generatorOpts: { decoratorsBeforeExport: true },
    });

    assert.match(code, /import \{[^}]*prepareEffects[^}]*useAfterUpdate[^}]*\} from "litsx";/);
    assert.match(code, /class FancyForm extends ShadowDomElementsMixin\(LitsxStaticHoistsMixin\(LitElement\)\)/);
    assert.match(code, /static elements = {/);
    assert.match(code, /<fancy-button \.ref=\{buttonRef\} \.label=\{this\.label\} \/>/);
    assert.doesNotMatch(code, /data-ref="_buttonRefElement"/);
    assert.doesNotMatch(code, /get _buttonRefElement\(\)/);
    assert.match(code, /prepareEffects\(this\);/);
    assert.match(code, /useAfterUpdate\(this, \(\) => {\s*buttonRef\.current\.focus\(\);/s);
    assert.match(code, /static get properties\(\)/);
    assert.match(code, /class Alert extends LitElement/);
    assert.doesNotMatch(code, /PropTypes|\.propTypes\s*=/);
  });

  it("transforms a TypeScript component with lit-friendly JSX", () => {
    const source = `
      import { useRef } from 'react';
      import FancyButton from './FancyButton.js';

      type ButtonMode = 'primary' | 'secondary';

      const TypedForm = ({ label, count }: { label: string; count: number }) => {
        const buttonRef = useRef<HTMLButtonElement | null>(null);

        return (
          <div>
            <FancyButton ref={buttonRef} .label={label} mode={"primary" as ButtonMode}>
              {count}
            </FancyButton>
          </div>
        );
      };
    `;

    const ast = parser.parse(source, {
      sourceType: "module",
      plugins: ["typescript"],
    });
    const { code } = transformFromAstSync(ast, source, {
      configFile: false,
      babelrc: false,
      presets: [[REACT_COMPAT_PRESET, { jsxTemplate: false }]],
      generatorOpts: { decoratorsBeforeExport: true },
    });

    assert.match(code, /class TypedForm extends ShadowDomElementsMixin\(LitElement\)/);
    assert.match(code, /static properties = {\s*label: {\s*type: String\s*},\s*count: {\s*type: Number\s*}\s*};/s);
    assert.match(code, /<fancy-button \.ref=\{buttonRef\} \.label=\{this\.label\} mode=\{"primary" as ButtonMode\}>/);
    assert.doesNotMatch(code, /data-ref="_buttonRefElement"/);
    assert.doesNotMatch(code, /get _buttonRefElement\(\)/);
    assert.match(code, /static elements = {\s*"fancy-button": FancyButton\s*};/);
  });

  it("rewrites React useState calls inside existing Lit classes", () => {
    const source = [
      "import { LitElement, html } from 'lit';",
      "import { useState } from 'react';",
      "",
      "class WithExistingProps extends LitElement {",
      "  static properties = {",
      "    foo: { type: String },",
      "    items: { attribute: false }",
      "  };",
      "",
      "  render() {",
      "    const [count, setCount] = useState(() => 1);",
      "    setCount(prev => prev + this.items.length);",
      "    return html`<p data-foo=\"${this.foo}\">${count}</p>`;",
      "  }",
      "}",
    ].join("\n");

    const ast = parser.parse(source, { sourceType: "module" });
    const { code } = transformFromAstSync(ast, source, {
      configFile: false,
      babelrc: false,
      presets: [[REACT_COMPAT_PRESET, { jsxTemplate: false }]],
      generatorOpts: { decoratorsBeforeExport: true },
    });

    assert.match(code, /static properties = {\s*foo:/s);
    assert.match(code, /items: {\s*attribute: false\s*}/s);
    assert.match(code, /prepareEffects\(this\);/);
    assert.match(code, /const \[count, setCount\] = useState\(this, \(\) => 1\);/);
    assert.match(code, /setCount\(prev => prev \+ this\.items\.length\);/);
  });

  it("normalizes React DOM/form semantics through the preset", () => {
    const source = `
      export const FilterForm = ({ query, enabled, onQueryChange, onEnabledChange }) => {
        return (
          <label htmlFor="search">
            Search
            <input id="search" value={query} onChange={onQueryChange} />
            <input type="checkbox" checked={enabled} onChange={onEnabledChange} />
          </label>
        );
      };
    `;

    const ast = parser.parse(source, { sourceType: "module" });
    const { code } = transformFromAstSync(ast, source, {
      configFile: false,
      babelrc: false,
      presets: [[REACT_COMPAT_PRESET, { jsxTemplate: false }]],
      generatorOpts: { decoratorsBeforeExport: true },
    });

    assert.match(code, /<label for="search">/);
    assert.match(code, /<input id="search" \.value=\{this\.query\} @input=\{this\.onQueryChange\} \/>/);
    assert.match(code, /<input type="checkbox" \?checked=\{this\.enabled\} @change=\{this\.onEnabledChange\} \/>/);
  });

  it("keeps React event alias semantics through the full preset pipeline", () => {
    const source = `
      export const AliasedEvents = ({ onFocus, onBlur, onDoubleClick }) => {
        return (
          <section>
            <input onFocus={onFocus} onBlur={onBlur} />
            <button onDoubleClick={onDoubleClick}>Open</button>
          </section>
        );
      };
    `;

    const ast = parser.parse(source, { sourceType: "module" });
    const { code } = transformFromAstSync(ast, source, {
      configFile: false,
      babelrc: false,
      presets: [[REACT_COMPAT_PRESET, { jsxTemplate: false }]],
      generatorOpts: { decoratorsBeforeExport: true },
    });

    assert.match(
      code,
      /@focusin=\{\{\s*handleEvent: this\.onFocus,\s*capture: true\s*\}\}/
    );
    assert.match(
      code,
      /@focusout=\{\{\s*handleEvent: this\.onBlur,\s*capture: true\s*\}\}/
    );
    assert.match(code, /@dblclick=\{this\.onDoubleClick\}/);
  });

  it("treats memo and forwardRef as part of the explicit React-compat pipeline", () => {
    const source = `
      import React, { forwardRef } from "react";

      export default React.memo(
        forwardRef(function CardShell({ title }, ref) {
          return <label ref={ref}>{title}</label>;
        })
      );
    `;

    const ast = parser.parse(source, { sourceType: "module" });
    const { code } = transformFromAstSync(ast, source, {
      configFile: false,
      babelrc: false,
      presets: [[REACT_COMPAT_PRESET, { jsxTemplate: false }]],
      generatorOpts: { decoratorsBeforeExport: true },
    });

    assert.match(code, /class CardShell extends LitElement/);
    assert.match(code, /\bref\b/);
    assert.doesNotMatch(code, /React\.memo|memo\(/);
    assert.doesNotMatch(code, /React\.forwardRef|forwardRef\(/);
  });

  it("rewrites lazy and suspense through the canonical React-compat pipeline", () => {
    const source = `
      import { lazy, Suspense } from "react";

      const LazyCard = lazy(() => import("./LazyCard.js"));

      export const Screen = () => {
        return (
          <Suspense fallback={<span>Loading</span>}>
            <LazyCard />
          </Suspense>
        );
      };
    `;

    const ast = parser.parse(source, { sourceType: "module" });
    const { code } = transformFromAstSync(ast, source, {
      configFile: false,
      babelrc: false,
      presets: [[REACT_COMPAT_PRESET, { jsxTemplate: false }]],
      generatorOpts: { decoratorsBeforeExport: true },
    });

    assert.match(code, /ensureLazyElement/);
    assert.match(code, /SuspenseBoundary/);
    assert.match(code, /const LazyCard = \(\) => import\("\.\/LazyCard\.js"\);/);
    assert.doesNotMatch(code, /\blazy\(/);
    assert.doesNotMatch(code, /<Suspense/);
  });

  it("rewrites wrappers, lazy, suspense, and error boundaries together through the preset", () => {
    const source = `
      import React, { forwardRef, lazy, memo, Suspense } from "react";
      import { ErrorBoundary } from "react-error-boundary";

      const ResultsPanel = lazy(() => import("./ResultsPanel.js"));

      export const Demo = memo(
        forwardRef(function Demo({ value }, ref) {
          return (
            <ErrorBoundary fallback={<p>Oops</p>}>
              <Suspense fallback={<p>Loading</p>}>
                <section className="shell" ref={ref}>
                  <ResultsPanel value={value} />
                </section>
              </Suspense>
            </ErrorBoundary>
          );
        })
      );
    `;

    const ast = parser.parse(source, { sourceType: "module" });
    const { code } = transformFromAstSync(ast, source, {
      configFile: false,
      babelrc: false,
      presets: [[REACT_COMPAT_PRESET, { jsxTemplate: false }]],
      generatorOpts: { decoratorsBeforeExport: true },
    });

    assert.match(code, /export class Demo extends ShadowDomElementsMixin\(LitElement\)/);
    assert.match(code, /const ResultsPanel = \(\) => import\("\.\/ResultsPanel\.js"\);/);
    assert.match(code, /ensureLazyElement/);
    assert.match(code, /SuspenseBoundary/);
    assert.match(code, /ErrorBoundary/);
    assert.doesNotMatch(code, /\bmemo\(/);
    assert.doesNotMatch(code, /\bforwardRef\(/);
    assert.doesNotMatch(code, /<Suspense/);
    assert.doesNotMatch(code, /<ErrorBoundary/);
  });

  it("can force light DOM output for react-compat migrations", () => {
    const source = `
      import FancyButton from './FancyButton.js';

      export const LightForm = ({ label }) => {
        return (
          <section>
            <FancyButton .label={label} />
          </section>
        );
      };
    `;

    const ast = parser.parse(source, { sourceType: "module" });
    const { code } = transformFromAstSync(ast, source, {
      configFile: false,
      babelrc: false,
      presets: [[REACT_COMPAT_PRESET, { domMode: "light", jsxTemplate: false }]],
      generatorOpts: { decoratorsBeforeExport: true },
    });

    assert.match(
      code,
      /import \{ LightDomElementsMixin, LightDomMixin \} from "litsx\/runtime-infrastructure";|import \{ LightDomMixin, LightDomElementsMixin \} from "litsx\/runtime-infrastructure";/
    );
    assert.match(code, /export class LightForm extends LightDomElementsMixin\(LightDomMixin\(LitElement\)\)/);
    assert.doesNotMatch(code, /ShadowDomElementsMixin/);
  });

  it("rejects forcing light DOM when a component also hoists shadowRootOptions", () => {
    const source = `
      export const ConflictingPanel = () => {
        ^shadowRootOptions({ delegatesFocus: true });
        return <div>ready</div>;
      };
    `;

    const ast = parser.parse(source, { sourceType: "module" });

    assert.throws(() => {
      transformFromAstSync(ast, source, {
        configFile: false,
        babelrc: false,
        presets: [[REACT_COMPAT_PRESET, { domMode: "light", jsxTemplate: false }]],
        generatorOpts: { decoratorsBeforeExport: true },
      });
    }, /\^lightDom\(\) cannot be combined with \^shadowRootOptions\(\.\.\.\)\./);
  });

  it("keeps hook-heavy React-authored components aligned with the LitSX runtime", () => {
    const source = `
      import { useDeferredValue, useImperativeHandle, useMemo, useRef, useTransition } from "react";

      export const SearchPanel = ({ query, expose }) => {
        const apiRef = useRef(null);
        const deferredQuery = useDeferredValue(query, { timeout: 200 });
        const summary = useMemo(() => deferredQuery.trim(), [deferredQuery]);
        const [isPending, startTransition] = useTransition();

        useImperativeHandle(expose, () => ({
          focus() {
            apiRef.current?.focus();
          }
        }), []);

        startTransition(() => expose?.(summary));

        return <input ref={apiRef} value={summary} data-pending={isPending} />;
      };
    `;

    const ast = parser.parse(source, { sourceType: "module" });
    const { code } = transformFromAstSync(ast, source, {
      configFile: false,
      babelrc: false,
      presets: [[REACT_COMPAT_PRESET, { jsxTemplate: false }]],
      generatorOpts: { decoratorsBeforeExport: true },
    });

    assert.match(code, /useDeferredValue\(this, this\.query, \{\s*timeout: 200\s*\}\)/);
    assert.match(code, /useMemoValue\(this, \(\) => deferredQuery\.trim\(\), \[deferredQuery\]\)/);
    assert.match(code, /useExpose\(this, this\.expose/);
    assert.match(code, /useTransition\(this\)/);
    assert.match(code, /data-ref="_apiRefElement"/);
    assert.match(code, /<input data-ref="_apiRefElement" \.value=\{summary\} data-pending=\{isPending\} \/>/);
  });
});
