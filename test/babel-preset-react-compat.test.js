import assert from "assert";
import babelCore from "@babel/core";
import parser from "./helpers/litsx-parser.js";
import { beforeAll, describe, it } from "vitest";
import { interopDefault } from "./helpers/interop-default.js";

const { transformFromAstSync } = babelCore;
let reactCompatPreset;

describe("@litsx/babel-preset-react-compat", () => {
  beforeAll(async () => {
    const mod = await import("../packages/babel-preset-react-compat/src/index.js");
    reactCompatPreset = interopDefault(mod);
  });

  function run(code, options = {}) {
    const ast = parser.parse(code, {
      sourceType: "module",
      ...(options.parser || {}),
    });
    const result = transformFromAstSync(ast, code, {
      configFile: false,
      babelrc: false,
      presets: [[reactCompatPreset, options.preset || {}]],
      generatorOpts: { decoratorsBeforeExport: true },
    });
    return result.code;
  }

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
    `;

    const code = run(source);

    assert.match(code, /class FancyForm extends ShadowDomMixin\(LitsxStaticHoistsMixin\(LitElement\)\)/);
    assert.match(code, /prepareEffects\(this\);/);
    assert.match(code, /useAfterUpdate\(this,/);
    assert.match(code, /return html`<div><fancy-button \.ref=\$\{buttonRef\} \.label=\$\{this\.label\}><\/fancy-button><\/div>`;/);
    assert.match(code, /static elements = \{\s*"fancy-button": FancyButton\s*\}/);
    assert.match(code, /static get properties\(\)/);
    assert.doesNotMatch(code, /PropTypes|\.propTypes\s*=/);
  });

  it("normalizes React DOM and form semantics", () => {
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

    const code = run(source);

    assert.match(code, /return html`<label for="search">/);
    assert.match(code, /<input id="search" \.value=\$\{this\.query\} @input=\$\{this\.onQueryChange\}>/);
    assert.match(code, /<input type="checkbox" \?checked=\$\{this\.enabled\} @change=\$\{this\.onEnabledChange\}>/);
  });

  it("preserves React event alias behavior for focus, blur, and double click", () => {
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

    const code = run(source);

    assert.match(
      code,
      /@focusin=\$\{\{\s*handleEvent: this\.onFocus,\s*capture: true\s*\}\}/
    );
    assert.match(
      code,
      /@focusout=\$\{\{\s*handleEvent: this\.onBlur,\s*capture: true\s*\}\}/
    );
    assert.match(code, /@dblclick=\$\{this\.onDoubleClick\}/);
  });

  it("can stop before final template lowering when jsxTemplate is disabled", () => {
    const source = `
      export const FilterForm = ({ query, onQueryChange }) => {
        return <input value={query} onChange={onQueryChange} />;
      };
    `;

    const code = run(source, { preset: { jsxTemplate: false } });

    assert.match(code, /class FilterForm extends LitElement/);
    assert.match(code, /return <input \.value=\{this\.query\} @input=\{this\.onQueryChange\} \/>;/);
    assert.doesNotMatch(code, /html`/);
  });

  it("applies event aliases before final template lowering is skipped", () => {
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

    const code = run(source, { preset: { jsxTemplate: false } });

    assert.match(
      code,
      /return <section>\s*<input @focusin=\{\{\s*handleEvent: this\.onFocus,\s*capture: true\s*\}\} @focusout=\{\{\s*handleEvent: this\.onBlur,\s*capture: true\s*\}\} \/>\s*<button @dblclick=\{this\.onDoubleClick\}>Open<\/button>\s*<\/section>;/s
    );
  });

  it("lowers createContext, Provider, and useContext through the compat preset", () => {
    const source = `
      import React, { createContext, useContext } from "react";

      const ThemeContext = createContext("light");

      export function Toolbar() {
        const theme = useContext(ThemeContext);
        return <button className={theme}>{theme}</button>;
      }

      export function App() {
        return (
          <ThemeContext.Provider value="dark">
            <Toolbar />
          </ThemeContext.Provider>
        );
      }
    `;

    const code = run(source);

    assert.match(
      code,
      /import \{ createContext, useContext, LitsxContextProviderElement as LitsxContextProvider \} from "@litsx\/core\/context";/
    );
    assert.match(code, /const ThemeContext = createContext\("light"\);/);
    assert.match(code, /prepareEffects\(this\);/);
    assert.match(code, /const theme = useContext\(this, ThemeContext\);/);
    assert.match(code, /return html`<button class="\$\{theme\}">\$\{theme\}<\/button>`;/);
    assert.match(
      code,
      /return html`<litsx-context-provider \.context=\$\{ThemeContext\} \.value=\$\{"dark"\}><toolbar><\/toolbar><\/litsx-context-provider>`;/
    );
    assert.match(
      code,
      /static elements = \{[\s\S]*"litsx-context-provider": LitsxContextProvider[\s\S]*"toolbar": Toolbar[\s\S]*\}|static elements = \{[\s\S]*"toolbar": Toolbar[\s\S]*"litsx-context-provider": LitsxContextProvider[\s\S]*\}/
    );
    assert.doesNotMatch(code, /from "react"|from 'react'/);
  });

  it("lowers Context.Consumer and preserves context helpers before final template lowering", () => {
    const source = `
      import { createContext } from "react";

      const ThemeContext = createContext("light");

      export function App() {
        return (
          <ThemeContext.Provider value="dark">
            <ThemeContext.Consumer>
              {(theme) => <span className={theme}>{theme}</span>}
            </ThemeContext.Consumer>
          </ThemeContext.Provider>
        );
      }
    `;

    const code = run(source, { preset: { jsxTemplate: false } });

    assert.match(
      code,
      /import \{ createContext, renderContext, LitsxContextProviderElement as LitsxContextProvider \} from "@litsx\/core\/context";/
    );
    assert.match(code, /const ThemeContext = createContext\("light"\);/);
    assert.match(
      code,
      /return <litsx-context-provider \.context=\{ThemeContext\} \.value=\{"dark"\}>\s*\{renderContext\(this, ThemeContext, theme => <span class=\{theme\}>\{theme\}<\/span>\)\}\s*<\/litsx-context-provider>;/s
    );
  });

  it("rewrites local custom hooks that call useContext with the active host", () => {
    const source = `
      import { createContext, useContext } from "react";

      const ThemeContext = createContext("light");

      function useThemeLabel(prefix) {
        const theme = useContext(ThemeContext);
        return prefix + ":" + theme;
      }

      export function Toolbar() {
        const label = useThemeLabel("theme");
        return <span>{label}</span>;
      }
    `;

    const code = run(source, { preset: { jsxTemplate: false } });

    assert.match(code, /function useThemeLabel\(_host, prefix\)/);
    assert.match(code, /const theme = useContext\(_host, ThemeContext\);/);
    assert.match(code, /const label = useThemeLabel\(this, "theme"\);/);
  });

  it("lowers memo and forwardRef together through the preset", () => {
    const source = `
      import React, { forwardRef, memo } from "react";

      export const CardShell = memo(
        forwardRef(function CardShell({ title }, ref) {
          return <label ref={ref}>{title}</label>;
        })
      );
    `;

    const code = run(source);

    assert.match(code, /class CardShell extends LitElement/);
    assert.match(code, /useCallbackRef\(this, \(\) => this\.renderRoot\?\./);
    assert.doesNotMatch(code, /\bmemo\(/);
    assert.doesNotMatch(code, /\bforwardRef\(/);
    assert.match(code, /return html`<label data-ref="_refElement">\$\{this\.title\}<\/label>`;/);
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

    const code = run(source, { preset: { domMode: "light" } });

    assert.match(code, /export class LightForm extends LightDomMixin\(LitElement\)/);
    assert.doesNotMatch(code, /ShadowDomMixin/);
    assert.match(code, /return html`<section><fancy-button \.label=\$\{this\.label\}><\/fancy-button><\/section>`;/);
  });

  it("rewrites ErrorBoundary and Suspense together to final Lit output", () => {
    const source = `
      import { ErrorBoundary } from "react-error-boundary";
      import { Suspense, lazy } from "react";

      const ResultsPanel = lazy(() => import("./ResultsPanel.js"));

      export function SearchCard() {
        return (
          <ErrorBoundary fallback={<p>Oops</p>}>
            <Suspense fallback={<p>Loading</p>}>
              <ResultsPanel value="ready" />
            </Suspense>
          </ErrorBoundary>
        );
      }
    `;

    const code = run(source);

    assert.match(code, /import \{ LitElement, html \} from "lit";/);
    assert.match(code, /import \{[^}]*ensureLazyElement[^}]*ErrorBoundary[^}]*SuspenseBoundary[^}]*\} from "@litsx\/core"|import \{[^}]*ensureLazyElement[^}]*SuspenseBoundary[^}]*ErrorBoundary[^}]*\} from "@litsx\/core"|import \{[^}]*ErrorBoundary[^}]*ensureLazyElement[^}]*SuspenseBoundary[^}]*\} from "@litsx\/core"|import \{[^}]*SuspenseBoundary[^}]*ErrorBoundary[^}]*ensureLazyElement[^}]*\} from "@litsx\/core"/);
    assert.match(code, /import \{ ShadowDomMixin \} from "@litsx\/core\/elements";/);
    assert.match(code, /const ResultsPanel = \(\) => import\("\.\/ResultsPanel\.js"\);/);
    assert.match(code, /ensureLazyElement\(this, "results-panel", ResultsPanel\);/);
    assert.match(code, /html`<error-boundary \.fallback=\$\{\(\) => html`<p>Oops<\/p>`\} \.content=\$\{bindRendererContext\([\s\S]*?\(\) => html`<suspense-boundary \.fallback=\$\{\(\) => html`<p>Loading<\/p>`\} \.content=\$\{bindRendererContext\([\s\S]*?\(\) => html`<results-panel value="ready"><\/results-panel>`, \{\s*projected: true\s*\}\)\}><\/suspense-boundary>`, \{\s*projected: true\s*\}\)\}><\/error-boundary>`;/);
    assert.match(code, /static elements = \{[\s\S]*"error-boundary": ErrorBoundary[\s\S]*"suspense-boundary": SuspenseBoundary[\s\S]*\}|static elements = \{[\s\S]*"suspense-boundary": SuspenseBoundary[\s\S]*"error-boundary": ErrorBoundary[\s\S]*\}/);
    assert.doesNotMatch(code, /<ErrorBoundary/);
    assert.doesNotMatch(code, /<Suspense/);
  });

  it("drops React imports when fully lowered but preserves them when still referenced", () => {
    const fullyLoweredSource = `
      import { useState } from "react";

      export function Counter() {
        const [count, setCount] = useState(0);
        return <button onClick={() => setCount(count + 1)}>{count}</button>;
      }
    `;

    const fullyLoweredCode = run(fullyLoweredSource);

    assert.doesNotMatch(fullyLoweredCode, /from "react"|from 'react'/);

    const preservedImportSource = `
      import React, { useState } from "react";

      export function Counter() {
        const [count, setCount] = useState(0);
        return <button title={React.version} onClick={() => setCount(count + 1)}>{count}</button>;
      }
    `;

    const preservedCode = run(preservedImportSource);

    assert.match(preservedCode, /import React from "react";|import React from 'react';/);
    assert.doesNotMatch(preservedCode, /useState[^}]*from "react"|useState[^}]*from 'react'/);
  });

  it("errors on unsupported class contextType", () => {
    const source = `
      import React, { createContext } from "react";

      const ThemeContext = createContext("light");

      export class LegacyPanel extends React.Component {
        static contextType = ThemeContext;

        render() {
          return <div>{this.context}</div>;
        }
      }
    `;

    assert.throws(
      () => run(source),
      /contextType is not supported/
    );
  });

  it("errors when Context.Consumer does not receive exactly one function child", () => {
    const source = `
      import { createContext } from "react";

      const ThemeContext = createContext("light");

      export function BrokenConsumer() {
        return (
          <ThemeContext.Consumer>
            <span>broken</span>
          </ThemeContext.Consumer>
        );
      }
    `;

    assert.throws(
      () => run(source),
      /Consumer requires a function child/
    );
  });

  it("errors on truly undeclared PascalCase JSX", () => {
    const source = `
      export function BrokenPanel() {
        return <MissingThing />;
      }
    `;

    assert.throws(
      () => run(source, { preset: { jsxTemplate: false } }),
      /Unknown LitSX component "MissingThing"/
    );
  });
});
