import assert from "assert";
import babelCore from "@babel/core";
import fs from "fs";
import os from "os";
import path from "path";
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
      filename: options.filename,
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

  it("keeps onX component props distinct from React DOM events", () => {
    const source = `
      const Child = ({ onAction }) => <button onClick={onAction}>Run</button>;
      export const Parent = ({ onAction }) => <Child onAction={onAction} />;
    `;

    const code = run(source);

    assert.match(code, /html`<button @click=\$\{onAction\}>Run<\/button>`/);
    assert.match(code, /html`<child \.onAction=\$\{onAction\}><\/child>`/);
    assert.doesNotMatch(code, /<child[^>]*@action=/);
  });

  it("lowers JSX spreads with surrounding React props in source order", () => {
    const source = `
      export const Action = ({ props, active, onClick }) => (
        <button {...props} className="action" disabled={active} onClick={onClick} />
      );
    `;

    const code = run(source);

    assert.match(code, /import \{[^}]*jsxSpreadElement[^}]*\} from "@litsx\/core"/);
    assert.match(code, /jsxSpreadElement\("button", \[props, \{/);
    assert.match(code, /class: "action"/);
    assert.match(code, /"\?disabled": active/);
    assert.match(code, /"@click": onClick/);
  });

  it("lowers keyed React map expressions through Lit repeat", () => {
    const source = `
      const Row = ({ item }) => <li>{item.label}</li>;
      export const List = ({ items }) => (
        <ul>{items.map((item, index) => <Row key={item.id} item={item} index={index} />)}</ul>
      );
    `;

    const code = run(source);

    assert.match(code, /import \{ repeat \} from "lit\/directives\/repeat\.js"/);
    assert.match(code, /repeat\(items, \(item, index\) => item\.id, \(item, index\) => html`<row/);
    assert.doesNotMatch(code, /(?:\s|\.)key=/);

    const blockCode = run(`
      const Row = ({ item }) => <li>{item.label}</li>;
      export const List = ({ items }) => (
        <ul>{items.map(item => { return <Row key={item.id} item={item} />; })}</ul>
      );
    `);
    assert.match(blockCode, /repeat\(items, item => item\.id, item => \{\s*return html`<row/);

    const decoratedCode = run(`
      const Row = ({ item }) => <li>{item.label}</li>;
      export const List = ({ items }) => <ul>{items.map(item => {
        const key = item.id;
        return <Row key={key} item={item} />;
      })}</ul>;
    `);
    assert.match(
      decoratedCode,
      /repeat\(items\.map\(item => \{\s*const key = item\.id;\s*return \[key, html`<row/,
    );
    assert.match(decoratedCode, /entry => entry\[0\], entry => entry\[1\]\)/);
    assert.doesNotMatch(decoratedCode, /(?:\s|\.)key=/);

    const directReturnCode = run(`
      const Row = ({ item }) => <li>{item.label}</li>;
      export function List({ items }) {
        return items.map(item => <Row key={item.id} item={item} />);
      }
    `);
    assert.match(directReturnCode, /return repeat\(items, item => item\.id/);
  });

  it("lowers standalone React keys through Lit keyed and can disable key compatibility", () => {
    const source = `
      const Panel = ({ label }) => <section>{label}</section>;
      export const Screen = ({ selectedId, label }) => (
        <main><Panel key={selectedId} label={label} /></main>
      );
    `;

    const code = run(source);
    assert.match(code, /import \{ keyed \} from "lit\/directives\/keyed\.js"/);
    assert.match(code, /keyed\(selectedId, html`<panel label="\$\{label\}"><\/panel>`\)/);
    assert.doesNotMatch(code, /(?:\s|\.)key=/);

    const disabledCode = run(source, { preset: { reactKeys: false } });
    assert.doesNotMatch(disabledCode, /lit\/directives\/(?:repeat|keyed)\.js/);
    assert.match(disabledCode, /<panel[^>]*\.key=\$\{selectedId\}/);
  });

  it("expands typed object rest bindings into their remaining component props", () => {
    const source = `
      export function Action(
        { disabled, ...props }: { disabled: boolean; title?: string }
      ) {
        return <button {...props} disabled={disabled} />;
      }
    `;

    const code = run(source, { parser: { plugins: ["typescript"] } });

    assert.match(code, /static properties = \{[\s\S]*disabled: \{\s*type: Boolean/);
    assert.match(code, /title: \{\s*type: String/);
    assert.match(code, /jsxSpreadElement\("button", \[\{\s*title: this\.title\s*\}, \{/);
    assert.doesNotMatch(code, /jsxSpreadElement\("button", \[this\.props/);
  });

  it("preserves TypeScript type/value namespaces during component lowering", () => {
    const code = run(`
      import type { FilterItem } from "./types";
      export function FilterItem() {
        return <li>Item</li>;
      }
    `, { parser: { plugins: ["typescript"] } });

    assert.match(code, /export class FilterItem extends/);
    assert.doesNotMatch(code, /import type \{ FilterItem \}/);
  });

  it("rejects declaration-only hooks from external packages", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "litsx-external-hook-"));
    try {
      const packageDir = path.join(tempDir, "node_modules", "theme-lib");
      fs.mkdirSync(packageDir, { recursive: true });
      fs.writeFileSync(path.join(packageDir, "package.json"), JSON.stringify({
        name: "theme-lib",
        types: "index.d.ts",
      }));
      fs.writeFileSync(
        path.join(packageDir, "index.d.ts"),
        "export declare function useTheme(): { theme: string };",
      );
      fs.mkdirSync(path.join(tempDir, "src"), { recursive: true });
      const filename = path.join(tempDir, "src", "ThemeLabel.tsx");
      const source = `
        import { useTheme } from "theme-lib";
        export function ThemeLabel() {
          const { theme } = useTheme();
          return <span>{theme}</span>;
        }
      `;
      fs.writeFileSync(filename, source);

      assert.throws(
        () => run(source, {
          filename,
          parser: { plugins: ["typescript"] },
        }),
        /Cannot compile external hook "useTheme" from "theme-lib"[\s\S]*not marked as LitSX-compatible[\s\S]*React's hook runtime/,
      );
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("accepts external hooks carrying LitSX compilation metadata", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "litsx-compiled-hook-"));
    try {
      const packageDir = path.join(tempDir, "node_modules", "theme-lib");
      fs.mkdirSync(packageDir, { recursive: true });
      fs.writeFileSync(path.join(packageDir, "package.json"), JSON.stringify({
        name: "theme-lib",
        type: "module",
        exports: "./index.js",
      }));
      fs.writeFileSync(
        path.join(packageDir, "index.js"),
        [
          "export function useTheme(host) { return host.theme; }",
          'useTheme[Symbol.for("litsx.hook")] = true;',
        ].join("\n"),
      );
      fs.mkdirSync(path.join(tempDir, "src"), { recursive: true });
      const filename = path.join(tempDir, "src", "ThemeLabel.tsx");
      const source = `
        import { useTheme } from "theme-lib";
        export function ThemeLabel() {
          const theme = useTheme();
          return <span>{theme}</span>;
        }
      `;
      fs.writeFileSync(filename, source);

      const code = run(source, {
        filename,
        parser: { plugins: ["typescript"] },
      });

      assert.match(code, /useTheme\(this\)/);
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("rejects uncompiled external React hooks even when their source is available", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "litsx-react-hook-"));
    try {
      const packageDir = path.join(tempDir, "node_modules", "theme-lib");
      fs.mkdirSync(packageDir, { recursive: true });
      fs.writeFileSync(path.join(packageDir, "package.json"), JSON.stringify({
        name: "theme-lib",
        type: "module",
        exports: "./index.js",
      }));
      fs.writeFileSync(
        path.join(packageDir, "index.js"),
        [
          'import { useState } from "react";',
          "export function useTheme() { return useState(\"light\")[0]; }",
        ].join("\n"),
      );
      fs.mkdirSync(path.join(tempDir, "src"), { recursive: true });
      const filename = path.join(tempDir, "src", "ThemeLabel.tsx");
      const source = `
        import { useTheme } from "theme-lib";
        export function ThemeLabel() {
          const theme = useTheme();
          return <span>{theme}</span>;
        }
      `;
      fs.writeFileSync(filename, source);

      assert.throws(
        () => run(source, {
          filename,
          parser: { plugins: ["typescript"] },
        }),
        /Cannot compile external hook "useTheme" from "theme-lib"/,
      );
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("transforms allowlisted external custom hooks through their React hook graph", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "litsx-transform-hook-dep-"));
    try {
      const packageDir = path.join(tempDir, "node_modules", "resize-hooks");
      fs.mkdirSync(packageDir, { recursive: true });
      fs.writeFileSync(path.join(packageDir, "package.json"), JSON.stringify({
        name: "resize-hooks",
        type: "module",
        exports: "./index.js",
      }));
      const hookFilename = path.join(packageDir, "index.js");
      const hookSource = `
        import { useResizeEffect } from "./resize-effect.js";
        const a = (listener) => {
          useResizeEffect(listener);
        };
        export { a as useWindowResize };
      `;
      const innerHookFilename = path.join(packageDir, "resize-effect.js");
      const innerHookSource = `
        import { useEffect } from "react";
        export function useResizeEffect(listener) {
          useEffect(() => {
            window.addEventListener("resize", listener);
            return () => window.removeEventListener("resize", listener);
          }, [listener]);
        }
      `;
      fs.writeFileSync(hookFilename, hookSource);
      fs.writeFileSync(innerHookFilename, innerHookSource);
      fs.mkdirSync(path.join(tempDir, "src"), { recursive: true });
      const consumerFilename = path.join(tempDir, "src", "ResizePanel.tsx");
      const consumerSource = `
        import { useWindowResize } from "resize-hooks";
        export function ResizePanel() {
          useWindowResize(() => {});
          return <section>Ready</section>;
        }
      `;
      fs.writeFileSync(consumerFilename, consumerSource);
      const preset = { transformDependencies: ["resize-hooks"] };

      const hookCode = run(hookSource, { filename: hookFilename, preset });
      const innerHookCode = run(innerHookSource, { filename: innerHookFilename, preset });
      const consumerCode = run(consumerSource, {
        filename: consumerFilename,
        parser: { plugins: ["typescript"] },
        preset,
      });

      assert.match(hookCode, /(?:const|let) useWindowResize = \(.*host.*listener\) =>/);
      assert.match(hookCode, /useResizeEffect\(_host, listener\)/);
      assert.match(hookCode, /Symbol\.for\("litsx\.hook"\)/);
      assert.match(innerHookCode, /useAfterUpdate\(/);
      assert.match(innerHookCode, /Symbol\.for\("litsx\.hook"\)/);
      assert.match(consumerCode, /useWindowResize\(this, \(\) => \{\}\)/);
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("reports the unsupported React hook where dependency transformation stops", () => {
    const source = `
      import { useInsertionEffect } from "react";
      export function useCssRuntime() {
        useInsertionEffect(() => {}, []);
      }
    `;

    assert.throws(
      () => run(source, {
        filename: "/virtual/node_modules/css-hooks/index.js",
        preset: { transformDependencies: ["css-hooks"] },
      }),
      /Cannot transform React hook "useInsertionEffect"[\s\S]*no LitSX equivalent/,
    );
  });

  it("reports private React internals as dependency transformation boundaries", () => {
    const source = `
      import React from "react";
      export function useDispatcherOwner() {
        return React.__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE;
      }
    `;

    assert.throws(
      () => run(source, {
        filename: "/virtual/node_modules/internal-hooks/index.js",
        preset: { transformDependencies: ["internal-hooks"] },
      }),
      /Cannot transform access to React internal[\s\S]*private React runtime boundary/,
    );
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

  it("rejects forced light DOM output for react-compat migrations when scoped elements are required", () => {
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

    assert.throws(
      () => run(source, { preset: { domMode: "light" } }),
      /does not support scoped elements in light DOM/
    );
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
    assert.match(code, /import \{[^}]*ShadowDomMixin[^}]*\} from "@litsx\/core\/elements";/);
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

  it("preserves named-imported Context Provider and Consumer semantics before namespace element lowering", () => {
    const source = `
      import { ThemeContext } from "./theme-context.js";

      export function ContextPanel({ theme }) {
        return (
          <ThemeContext.Provider value={theme}>
            <ThemeContext.Consumer>{value => <span>{value}</span>}</ThemeContext.Consumer>
          </ThemeContext.Provider>
        );
      }
    `;

    const code = run(source);

    assert.match(code, /<litsx-context-provider \.context=\$\{ThemeContext\} \.value=\$\{this\.theme\}>/);
    assert.match(code, /renderContext\(this, ThemeContext, value => html`<span>\$\{value\}<\/span>`\)/);
    assert.doesNotMatch(code, /theme-context-(?:provider|consumer)/);
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
