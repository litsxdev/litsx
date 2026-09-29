import assert from "assert";
import * as babelCore from "@babel/core";
import fs from "fs";
import os from "os";
import path from "path";
import parser from "./helpers/litsx-parser.js";
import { beforeAll, describe, it } from "vitest";
import { interopDefault } from "./helpers/interop-default.js";

const { transformFromAstSync } = babelCore;
let reactCompatPreset;

describe("@litsx/babel-preset-react-compat", () => {
  it("lowers React createRef and namespace createRef to Lit-backed facades", () => {
    const source = `
      import React, { createRef as makeRef } from "react";
      const first = makeRef();
      const second = React.createRef();
      export function RefPair() {
        return <><input ref={first} /><button ref={second} /></>;
      }
    `;

    const code = run(source);

    assert.match(code, /createReactRef/);
    assert.strictEqual((code.match(/createReactRef\(\)/g) || []).length, 2);
    assert.match(code, /ref\(toLitRef\(first\)\)/);
    assert.match(code, /ref\(toLitRef\(second\)\)/);
    assert.doesNotMatch(code, /React\.createRef|makeRef\(\)|data-ref/);
  });

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

    assert.match(code, /class FancyForm extends LightDomMixin\(LitElement\)/);
    assert.match(code, /renderWithHooks\(this, \(\) => \{/);
    assert.match(code, /useAfterUpdate\(\(\) =>/);
    assert.doesNotMatch(code, /prepareEffects/);
    assert.match(code, /return html`<div>\$\{jsxSpreadElement\("fancy-button", \[\{[\s\S]*?"\.ref": buttonRef,[\s\S]*?"\.label": this\.label[\s\S]*?component: FancyButton[\s\S]*?\)\}<\/div>`;/);
    assert.match(code, /static elements = \{\s*\.\.\.\(super\.elements \?\? \{\}\),\s*"fancy-button": FancyButton\s*\}/);
    assert.match(code, /static properties = \{/);
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

  it("normalizes the React SVG attribute and event surface", () => {
    const source = `
      export const ReactIcon = ({ box, width, href, lang, onClick, props }) => (
        <svg
          className="icon"
          viewBox={box}
          strokeWidth={width}
          strokeLinecap="round"
          glyphOrientationHorizontal="90"
          tabIndex={0}
          spellCheck={false}
          xmlLang={lang}
          xmlnsXlink="http://www.w3.org/1999/xlink"
          onClick={onClick}
        >
          <use xlinkHref={href} {...props} />
          <path fillRule="evenodd" d="M0 0" />
        </svg>
      );
    `;

    const code = run(source);

    assert.match(code, /<svg class="icon" viewBox="\$\{box\}" stroke-width="\$\{width\}" stroke-linecap="round" glyph-orientation-horizontal="90" tabindex="\$\{0\}" spellcheck="\$\{false\}" xml:lang="\$\{lang\}" xmlns:xlink="http:\/\/www\.w3\.org\/1999\/xlink" @click=\$\{onClick\}>/);
    assert.match(code, /jsxSpreadElement\("use", \[\{\s*"xlink:href": href\s*\}, props\], \{[\s\S]*namespace: "svg",[\s\S]*reactCompatEvents: true/);
    assert.match(code, /<path fill-rule="evenodd" d="M0 0"><\/path>/);
    assert.doesNotMatch(code, /strokeWidth=|strokeLinecap=|xmlLang=|xmlnsXlink=|glyphOrientationHorizontal=/);
  });

  it("keeps onX component props distinct from React DOM events", () => {
    const source = `
      const TestChild = ({ onAction }) => <button onClick={onAction}>Run</button>;
      export const TestParent = ({ onAction }) => <TestChild onAction={onAction} />;
    `;

    const code = run(source);

    assert.match(code, /html`<button @click=\$\{onAction\}>Run<\/button>`/);
    assert.match(code, /html`<test-child \.onAction=\$\{onAction\}><\/test-child>`/);
    assert.doesNotMatch(code, /<test-child[^>]*@action=/);
  });

  it("lowers JSX spreads with surrounding React props in source order", () => {
    const source = `
      export const TestAction = ({ props, active, onClick }) => (
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
      const TestRow = ({ item }) => <li>{item.label}</li>;
      export const TestList = ({ items }) => (
        <ul>{items.map((item, index) => <TestRow key={item.id} item={item} index={index} />)}</ul>
      );
    `;

    const code = run(source);

    assert.match(code, /import \{ repeat \} from "lit\/directives\/repeat\.js"/);
    assert.match(code, /repeat\(items, \(item, index\) => item\.id, \(item, index\) => html`<test-row/);
    assert.doesNotMatch(code, /(?:\s|\.)key=/);

    const blockCode = run(`
      const TestRow = ({ item }) => <li>{item.label}</li>;
      export const TestList = ({ items }) => (
        <ul>{items.map(item => { return <TestRow key={item.id} item={item} />; })}</ul>
      );
    `);
    assert.match(blockCode, /repeat\(items, item => item\.id, item => \{\s*return html`<test-row/);

    const decoratedCode = run(`
      const TestRow = ({ item }) => <li>{item.label}</li>;
      export const TestList = ({ items }) => <ul>{items.map(item => {
        const key = item.id;
        return <TestRow key={key} item={item} />;
      })}</ul>;
    `);
    assert.match(
      decoratedCode,
      /repeat\(items\.map\(item => \{\s*const key = item\.id;\s*return \[key, html`<test-row/,
    );
    assert.match(decoratedCode, /entry => entry\[0\], entry => entry\[1\]\)/);
    assert.doesNotMatch(decoratedCode, /(?:\s|\.)key=/);

    const directReturnCode = run(`
      const TestRow = ({ item }) => <li>{item.label}</li>;
      export function TestList({ items }) {
        return items.map(item => <TestRow key={item.id} item={item} />);
      }
    `);
    assert.match(directReturnCode, /return repeat\(items, item => item\.id/);
  });

  it("lowers standalone React keys through Lit keyed and can disable key compatibility", () => {
    const source = `
      const TestPanel = ({ label }) => <section>{label}</section>;
      export const TestScreen = ({ selectedId, label }) => (
        <main><TestPanel key={selectedId} label={label} /></main>
      );
    `;

    const code = run(source);
    assert.match(code, /import \{ keyed \} from "lit\/directives\/keyed\.js"/);
    assert.match(code, /keyed\(selectedId, html`<test-panel label="\$\{label\}"><\/test-panel>`\)/);
    assert.doesNotMatch(code, /(?:\s|\.)key=/);

    const disabledCode = run(source, { preset: { reactKeys: false } });
    assert.doesNotMatch(disabledCode, /lit\/directives\/(?:repeat|keyed)\.js/);
    assert.match(disabledCode, /<test-panel[^>]*\.key=\$\{selectedId\}/);
  });

  it("keeps typed object rest bindings in a compact reactive bag", () => {
    const source = `
      export function TestAction(
        { disabled, ...props }: { disabled: boolean; title?: string }
      ) {
        return <button {...props} disabled={disabled} />;
      }
    `;

    const code = run(source, { parser: { plugins: ["typescript"] } });

    assert.match(code, /static properties = \{[\s\S]*disabled: \{\s*type: Boolean/);
    assert.match(code, /__litsxRestProps: \{\s*type: Object,\s*attribute: false/);
    assert.match(code, /static \[Symbol\.for\("litsx\.restProps"\)\] = \{\s*property: "__litsxRestProps"/);
    assert.doesNotMatch(code, /title: \{\s*type: String/);
    assert.match(code, /jsxSpreadElement\("button", \[this\.__litsxRestProps, \{/);
  });

  it("routes explicit callsite props into a local component rest bag", () => {
    const source = `
      function TestAction({ disabled, ...props }) {
        return <button {...props} disabled={disabled} />;
      }

      export function TestApp() {
        return <TestAction disabled aria-label="Save" data-track="primary" />;
      }
    `;

    const code = run(source);

    assert.match(code, /static \[Symbol\.for\("litsx\.restProps"\)\] = \{\s*property: "__litsxRestProps"/);
    assert.match(code, /jsxSpreadElement\("test-action", \[\{[\s\S]*?disabled: true,[\s\S]*?"aria-label": "Save",[\s\S]*?"data-track": "primary"/);
  });

  it("quotes hyphenated typed component properties", () => {
    const code = run(`
      export function AccessibleLabel(
        { "aria-label": ariaLabel }: { "aria-label"?: string }
      ) {
        return <span aria-label={ariaLabel}>Label</span>;
      }
    `, { parser: { plugins: ["typescript"] } });

    assert.match(code, /"aria-label": \{/);
    assert.match(code, /this\["aria-label"\]/);
    assert.doesNotMatch(code, /this\.aria-label/);
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
          'import { useHost } from "@litsx/core";',
          "export function useTheme() { return useHost().theme; }",
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

      assert.match(code, /useTheme\(\)/);
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

      assert.match(hookCode, /(?:const|let) useWindowResize = listener =>/);
      assert.match(hookCode, /useResizeEffect\(listener\)/);
      assert.match(hookCode, /Symbol\.for\("litsx\.hook"\)/);
      assert.match(innerHookCode, /useAfterUpdate\(/);
      assert.match(innerHookCode, /Symbol\.for\("litsx\.hook"\)/);
      assert.match(consumerCode, /useWindowResize\(\(\) => \{\}\)/);
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

  it("normalizes static React.createElement calls before component lowering", () => {
    const code = run(`
      import React from "react";
      const a = ({ label, disabled, rest }) => React.createElement(
        "button",
        { ...rest, className: "action", disabled, onClick: save },
        label,
      );
      export { a as ActionButton };
    `);

    assert.match(code, /export const ActionButton/);
    assert.match(code, /jsxSpreadElement\("button"/);
    assert.match(code, /class: "action"/);
    assert.match(code, /"\?disabled": disabled/);
    assert.match(code, /"@click": save/);
  });

  it("recovers component hosts for hooks inside createElement-authored components", () => {
    const code = run(`
      import React, { useState } from "react";
      const a = () => {
        const [count, setCount] = useState(0);
        return React.createElement(
          "button",
          { onClick: () => setCount(count + 1) },
          count,
        );
      };
      export { a as TestCounter };
    `);

    assert.match(code, /export class TestCounter extends LightDomMixin\(LitElement\)/);
    assert.match(code, /useState\(0\)/);
    assert.match(code, /return html`<button @click=/);
  });

  it("recovers namespace hooks in bundled internal createElement components", () => {
    const code = run(`
      import * as React from "react";
      var names = ["theme"], TestInternal = ({ children }) => {
        const [theme] = React.useState("light");
        (React.useEffect(() => document.body.dataset.theme = theme, [theme]),
          React.useEffect(() => document.body.dataset.ready = "true", []));
        return React.createElement("section", { className: theme }, children);
      };
      export const ThemeProvider = (props) => React.createElement(TestInternal, props);
    `);

    assert.match(code, /class TestInternal extends LightDomMixin\(LitElement\)/);
    assert.match(code, /useState\("light"\)/);
    assert.match(code, /useAfterUpdate\(\(\) =>/);
    assert.doesNotMatch(code, /prepareEffects/);
    assert.doesNotMatch(code, /React\.use(?:State|Effect)/);
  });

  it("recognizes effect-only components that render null", () => {
    const code = run(`
      import { useEffect } from "react";
      export function WelcomeToast() {
        useEffect(() => announce(), []);
        return null;
      }
    `);

    assert.match(code, /export class WelcomeToast extends LightDomMixin\(LitElement\)/);
    assert.match(code, /useAfterUpdate\(\(\) =>/);
    assert.match(code, /render\(\)[\s\S]*return null/);
  });

  it("recognizes internal components exported by a trailing specifier", () => {
    const code = run(`
      import * as React from "react";
      import { TestButton } from "./button.js";
      function CalendarDayButton({ active }) {
        const ref = React.useRef(null);
        React.useEffect(() => { if (active) ref.current?.focus(); }, [active]);
        return <TestButton ref={ref} active={active} />;
      }
      export { CalendarDayButton };
    `);

    assert.match(code, /class CalendarDayButton extends/);
    assert.match(code, /import \{[^}]*useReactRef as useRef[^}]*\} from "@litsx\/core\/react-compat"/);
    assert.match(code, /useRef\(null\)/);
    assert.match(code, /useAfterUpdate\(\(\) =>/);
    assert.doesNotMatch(code, /React\.use(?:Ref|Effect)/);
  });

  it("expands statically bounded polymorphic component aliases", () => {
    const code = run(`
      import { Slot } from "@radix-ui/react-slot";
      export function TestTrigger({ asChild, children, ...props }) {
        const Comp = asChild ? Slot : "button";
        return <Comp {...props}>{children}</Comp>;
      }
    `);

    assert.match(code, /this\.asChild\s*\?/);
    assert.match(code, /<slot/);
    assert.match(code, /<button/);
    assert.doesNotMatch(code, /<Comp/);
  });

  it("treats hooks from allowlisted ESM dependency exports as runtime hooks", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "litsx-transform-esm-dep-"));
    try {
      const packageDir = path.join(tempDir, "node_modules", "next-themes");
      const distDir = path.join(packageDir, "dist");
      fs.mkdirSync(distDir, { recursive: true });
      fs.writeFileSync(path.join(packageDir, "package.json"), JSON.stringify({
        name: "next-themes",
        exports: {
          ".": {
            types: "./dist/index.d.ts",
            import: "./dist/index.mjs",
            require: "./dist/index.js",
          },
        },
      }));
      fs.writeFileSync(path.join(distDir, "index.d.ts"), "export declare function useTheme(): string;");
      fs.writeFileSync(path.join(distDir, "index.js"), "exports.useTheme = () => 'light';");
      fs.writeFileSync(
        path.join(distDir, "index.mjs"),
        'import * as React from "react"; const a = () => React.useContext(ThemeContext); export { a as useTheme };',
      );
      const filename = path.join(tempDir, "src", "theme-label.tsx");
      fs.mkdirSync(path.dirname(filename), { recursive: true });
      const source = `
        import { useTheme } from "next-themes";
        export function ThemeLabel() {
          const theme = useTheme();
          return <span>{theme}</span>;
        }
      `;

      const code = run(source, {
        filename,
        parser: { plugins: ["typescript"] },
        preset: { transformDependencies: ["next-themes"] },
      });

      assert.match(code, /useTheme\(\)/);
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("normalizes jsx-runtime calls, fragments, keys, and nested children", () => {
    const code = run(`
      import * as r from "react/jsx-runtime";
      export function ItemList({ items }) {
        return r.jsxs(r.Fragment, {
          children: [
            r.jsx("h2", { children: "Items" }),
            r.jsx("ul", {
              children: items.map((item) => r.jsx("li", { children: item.label }, item.id)),
            }),
          ],
        });
      }
    `);

    assert.match(code, /html`<h2>Items<\/h2><ul>/);
    assert.match(code, /repeat\(this\.items/);
    assert.doesNotMatch(code, /react\/jsx-runtime/);
  });

  it("normalizes named jsxDEV calls with referenced props", () => {
    const code = run(`
      import { jsxDEV as renderDevElement } from "react/jsx-dev-runtime";
      export const Preview = (props) => renderDevElement(
        "article",
        props,
        "preview",
        false,
        { fileName: "preview.js", lineNumber: 2 },
        this,
      );
    `);

    assert.match(code, /jsxSpreadElement\("article", \[props\],/);
    assert.match(code, /keyed\("preview",/);
    assert.doesNotMatch(code, /react\/jsx-dev-runtime|renderDevElement/);
  });

  it("rejects dynamic createElement types, cloneElement, and portals", () => {
    assert.throws(
      () => run(`
        import React from "react";
        export function Dynamic({ kind }) {
          return React.createElement(kind ? "a" : "button", null);
        }
      `),
      /dynamic element type/,
    );

    assert.throws(
      () => run(`
        import { cloneElement } from "react";
        export function Clone({ child }) { return cloneElement(child, { active: true }); }
      `),
      /React\.cloneElement cannot be transformed safely/,
    );

    assert.throws(
      () => run(`
        import { createPortal } from "react-dom";
        export function Portal({ child, target }) { return createPortal(child, target); }
      `),
      /createPortal has no automatic LitSX template equivalent/,
    );

    assert.throws(
      () => run(`
        import * as ReactDOM from "react-dom";
        export function Portal({ child, target }) { return ReactDOM.createPortal(child, target); }
      `),
      /createPortal has no automatic LitSX template equivalent/,
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

    assert.match(code, /class FilterForm extends LightDomMixin\(LitElement\)/);
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

      export function TestToolbar() {
        const theme = useContext(ThemeContext);
        return <button className={theme}>{theme}</button>;
      }

      export function TestApp() {
        return (
          <ThemeContext.Provider value="dark">
            <TestToolbar />
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
    assert.match(code, /renderWithHooks\(this, \(\) => \{/);
    assert.match(code, /const theme = useContext\(ThemeContext\);/);
    assert.doesNotMatch(code, /prepareEffects/);
    assert.match(code, /return html`<button class="\$\{theme\}">\$\{theme\}<\/button>`;/);
    assert.match(
      code,
      /return html`<litsx-context-provider \.context=\$\{ThemeContext\} \.value=\$\{"dark"\}><test-toolbar><\/test-toolbar><\/litsx-context-provider>`;/
    );
    assert.match(
      code,
      /static elements = \{[\s\S]*"litsx-context-provider": LitsxContextProvider[\s\S]*"test-toolbar": TestToolbar[\s\S]*\}|static elements = \{[\s\S]*"test-toolbar": TestToolbar[\s\S]*"litsx-context-provider": LitsxContextProvider[\s\S]*\}/
    );
    assert.doesNotMatch(code, /from "react"|from 'react'/);
  });

  it("lowers Context.Consumer and preserves context helpers before final template lowering", () => {
    const source = `
      import { createContext } from "react";

      const ThemeContext = createContext("light");

      export function TestApp() {
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
      /return <litsx-context-provider \.context=\{ThemeContext\} \.value=\{"dark"\}>\s*\{renderContext\(ThemeContext, theme => <span class=\{theme\}>\{theme\}<\/span>\)\}\s*<\/litsx-context-provider>;/s
    );
  });

  it("preserves local custom hooks that call useContext", () => {
    const source = `
      import { createContext, useContext } from "react";

      const ThemeContext = createContext("light");

      function useThemeLabel(prefix) {
        const theme = useContext(ThemeContext);
        return prefix + ":" + theme;
      }

      export function TestToolbar() {
        const label = useThemeLabel("theme");
        return <span>{label}</span>;
      }
    `;

    const code = run(source, { preset: { jsxTemplate: false } });

    assert.match(code, /function useThemeLabel\(prefix\)/);
    assert.match(code, /const theme = useContext\(ThemeContext\);/);
    assert.match(code, /const label = useThemeLabel\("theme"\);/);
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

    assert.match(code, /class CardShell extends LightDomMixin\(LitElement\)/);
    assert.match(code, /from "@litsx\/core\/react-compat"/);
    assert.match(code, /toLitRef\(this\.ref\)/);
    assert.doesNotMatch(code, /\bmemo\(/);
    assert.doesNotMatch(code, /\bforwardRef\(/);
    assert.match(code, /return html`<label \$\{ref\(toLitRef\(this\.ref\)\)\}>\$\{this\.title\}<\/label>`;/);
    assert.doesNotMatch(code, /data-ref|querySelector/);
  });

  it("uses contextual scoped elements in default light DOM react-compat output", () => {
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

    const code = run(source);
    assert.match(code, /class LightForm extends LightDomMixin\(LitElement\)/);
    assert.match(code, /static elements = \{\s*\.\.\.\(super\.elements \?\? \{\}\),\s*"fancy-button": FancyButton\s*\}/);
    assert.doesNotMatch(code, /litsx\.lightDomStyleScope/);

    const forcedGlobalCode = run(source, {
      preset: { lightDomStyles: "scoped" },
    });
    assert.doesNotMatch(forcedGlobalCode, /litsx\.lightDomStyleScope/);

    const shadowCode = run(source, { preset: { domMode: "shadow" } });
    assert.match(shadowCode, /class LightForm extends ShadowDomMixin\(LitElement\)/);
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
    assert.match(code, /import \{[^}]*LightDomMixin[^}]*\} from "@litsx\/core\/elements";/);
    assert.match(code, /const ResultsPanel = \(\) => import\("\.\/ResultsPanel\.js"\);/);
    assert.match(code, /ensureLazyElement\(this, "results-panel", ResultsPanel\);/);
    assert.match(code, /html`<error-boundary \.fallback=\$\{\(\) => html`<p>Oops<\/p>`\} \.content=\$\{bindRendererContext\([\s\S]*?\(\) => html`<suspense-boundary \.fallback=\$\{\(\) => html`<p>Loading<\/p>`\} \.content=\$\{bindRendererContext\([\s\S]*?\(\) => html`<results-panel value="ready"><\/results-panel>`, \{\s*projected: true\s*\}\)\}><\/suspense-boundary>`, \{\s*projected: true\s*\}\)\}><\/error-boundary>`;/);
    assert.match(code, /static elements = \{[\s\S]*"error-boundary": ErrorBoundary[\s\S]*"suspense-boundary": SuspenseBoundary[\s\S]*\}|static elements = \{[\s\S]*"suspense-boundary": SuspenseBoundary[\s\S]*"error-boundary": ErrorBoundary[\s\S]*\}/);
    assert.doesNotMatch(code, /"results-panel": ResultsPanel/);
    assert.doesNotMatch(code, /<ErrorBoundary/);
    assert.doesNotMatch(code, /<Suspense/);
  });

  it("drops React imports when fully lowered but preserves them when still referenced", () => {
    const fullyLoweredSource = `
      import { useState } from "react";

      export function TestCounter() {
        const [count, setCount] = useState(0);
        return <button onClick={() => setCount(count + 1)}>{count}</button>;
      }
    `;

    const fullyLoweredCode = run(fullyLoweredSource);

    assert.doesNotMatch(fullyLoweredCode, /from "react"|from 'react'/);

    const preservedImportSource = `
      import React, { useState } from "react";

      export function TestCounter() {
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
    assert.match(code, /renderContext\(ThemeContext, value => html`<span>\$\{value\}<\/span>`\)/);
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
