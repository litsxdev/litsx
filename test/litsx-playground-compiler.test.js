import assert from "assert";
import { beforeAll, describe, it, vi } from "vitest";
import {
  litDirectivesExampleSource,
  reactContextExampleSource,
  staticExposeExampleSource,
  useAsyncStateExampleSource,
  useEmitExampleSource,
  useOptimisticExampleSource,
} from "../website/docs/.vitepress/theme/components/playground-example-source.js";

let compileLitsxPlayground;

beforeAll(async () => {
  const mod = await import("../packages/litsx-playground/src/litsx-playground-compiler.js");
  const BabelStandaloneModule = await import("@babel/standalone");
  const typescriptModule = await import("typescript");
  mod.setLitsxPlaygroundCompilerRuntime({
    Babel: BabelStandaloneModule.default ?? BabelStandaloneModule,
    typescript: typescriptModule,
  });
  compileLitsxPlayground = mod.compileLitsxPlayground || mod.default;
});

async function importPlaygroundCompilerWithMockedRuntime({
  transformFromAst,
  transform,
} = {}) {
  vi.resetModules();

  const mod = await import("../packages/litsx-playground/src/litsx-playground-compiler.js");
  const BabelStandaloneModule = await import("@babel/standalone");
  const typescriptModule = await import("typescript");
  const actualBabel = BabelStandaloneModule.default ?? BabelStandaloneModule;
  const parserPluginCalls = [];

  const Babel = {
    packages: {
      ...actualBabel.packages,
      parser: {
        ...actualBabel.packages.parser,
        parse(code, options) {
          parserPluginCalls.push(options?.plugins || []);
          return actualBabel.packages.parser.parse(code, options);
        },
      },
    },
    registerPreset: vi.fn(),
    registerPlugin: vi.fn(),
    transformFromAst:
      transformFromAst ||
      vi.fn(() => ({
        ast: { type: "File" },
        code: "const playgroundOutput = 1;",
      })),
    transform:
      transform ||
      vi.fn((code) => ({
        code,
      })),
  };

  mod.setLitsxPlaygroundCompilerRuntime({
    Babel,
    typescript: typescriptModule,
  });

  return { mod, Babel, parserPluginCalls };
}

describe("@litsx/playground compiler", () => {
  it("reuses cached results for the same source and options object graph", async () => {
    const { mod, Babel } = await importPlaygroundCompilerWithMockedRuntime();
    const compile = mod.compileLitsxPlayground || mod.default;
    const outputPlugin = () => ({ visitor: {} });
    const options = {
      filename: "/playground/Cached.tsx",
      outputPlugins: [outputPlugin],
    };

    const first = await compile("export function Demo() { return <p>Hello</p>; }", options);
    const second = await compile("export function Demo() { return <p>Hello</p>; }", options);

    assert.strictEqual(first, second);
    expect(Babel.transformFromAst).toHaveBeenCalledTimes(3);
  });

  it("supports output plugins and disabling final jsx-template lowering", async () => {
    const transformFromAst = vi
      .fn()
      .mockReturnValueOnce({
        ast: { type: "File", phase: "first" },
        code: "const phaseOne = true;",
        metadata: { litsxWarnings: [] },
      })
      .mockReturnValueOnce({
        ast: { type: "File", phase: "second" },
        code: "const phaseTwo = true;",
      });
    const transform = vi.fn((code) => ({ code: `${code}\n// formatted` }));
    const { mod, Babel } = await importPlaygroundCompilerWithMockedRuntime({
      transformFromAst,
      transform,
    });
    const compile = mod.compileLitsxPlayground || mod.default;
    const outputPlugin = ["custom-output", { loose: true }];

    const result = await compile("export function Demo() { return <p>Hello</p>; }", {
      filename: "/playground/Output.tsx",
      jsxTemplate: false,
      outputPlugins: [outputPlugin],
    });

    expect(Babel.transformFromAst).toHaveBeenCalledTimes(2);
    expect(Babel.transformFromAst.mock.calls[1][2].plugins).toEqual([outputPlugin]);
    expect(transform).toHaveBeenCalledWith("const phaseTwo = true;", expect.objectContaining({
      filename: "/playground/Output.tsx",
    }));
    assert.match(result.code, /phaseTwo/);
  });

  it("preloads the active injected compiler runtime without touching the CDN path", async () => {
    const { mod } = await importPlaygroundCompilerWithMockedRuntime();

    const preloadPromise = mod.preloadLitsxPlaygroundCompiler();
    const runtime = await preloadPromise;

    assert.ok(preloadPromise && typeof preloadPromise.then === "function");
    assert.ok(runtime.Babel);
    assert.ok(runtime.parser);
  });

  it("compiles an in-memory Lit sx module to LitElement + html output", async () => {
    const source = `
      type CounterProps = {
        label: string;
        count: number;
      };

      export function Counter(props: CounterProps) {
        ^styles(\`
          :host { display: block; }
        \`);

        return <button>{props.label} {props.count}</button>;
      }
    `;

    const { code } = await compileLitsxPlayground(source);

    assert.match(code, /import \{ LitElement, css, html \} from "lit";/);
    assert.match(code, /import \{ LitsxStaticHoistsMixin \} from "@litsx\/litsx\/runtime-infrastructure";/);
    assert.match(code, /export class Counter extends LitsxStaticHoistsMixin\(LitElement\)/);
    assert.match(code, /label: \{\s*type: String\s*\}/);
    assert.match(code, /count: \{\s*type: Number\s*\}/);
    assert.match(code, /static get styles\(\)/);
    assert.match(code, /return html`<button>/);
    assert.doesNotMatch(code, /\btype CounterProps\b/);
    assert.doesNotMatch(code, /props:\s*CounterProps/);
  });

  it("degrades imported prop types instead of following project files", async () => {
    const source = `
      import type { CardProps } from "./types";

      export function Card({ title, active }: CardProps) {
        return <article>{title} {active ? "on" : "off"}</article>;
      }
    `;

    const { code } = await compileLitsxPlayground(source, {
      filename: "/playground/Card.tsx",
    });

    assert.match(code, /title: \{\s*type: String\s*\}/);
    assert.match(code, /active: \{\s*type: String\s*\}/);
    assert.match(code, /return html`<article>/);
  });

  it("surfaces fallback warnings for opaque props access in metadata", async () => {
    const source = `
      export function Card(props) {
        return <article>{props.title}</article>;
      }
    `;

    const result = await compileLitsxPlayground(source, {
      filename: "/playground/Card.tsx",
    });

    assert.ok(Array.isArray(result.metadata.litsxWarnings));
    assert.strictEqual(result.metadata.litsxWarnings.length, 1);
    assert.strictEqual(result.metadata.litsxWarnings[0].code, 91018);
    assert.strictEqual(result.metadata.litsxWarnings[0].propName, "title");
  });

  it("supports litsx authoring hooks in the playground compiler", async () => {
    const source = `
      import { useAfterUpdate, useStyle } from "@litsx\/litsx";

      type CounterProps = {
        accent: string;
      };

      export function Counter(props: CounterProps) {
        useAfterUpdate(() => {
          console.log(props.accent);
        }, [props.accent]);

        useStyle("--accent", props.accent);

        return <button>{props.accent}</button>;
      }
    `;

    const { code } = await compileLitsxPlayground(source);

    assert.match(
      code,
      /import \{[^}]*prepareEffects[^}]*useAfterUpdate[^}]*useStyle[^}]*\} from "@litsx\/litsx";|import \{[^}]*useAfterUpdate[^}]*useStyle[^}]*prepareEffects[^}]*\} from "@litsx\/litsx";|import \{[^}]*useStyle[^}]*prepareEffects[^}]*useAfterUpdate[^}]*\} from "@litsx\/litsx";/
    );
    assert.match(code, /prepareEffects\(this\);/);
    assert.match(
      code,
      /useAfterUpdate\(this, \(\) => \{\s*console\.log\(this\.accent\);\s*\}, \[this\.accent\]\);/s
    );
    assert.match(code, /useStyle\(this, "--accent", this\.accent\);/);
  });

  it("supports native useState and useRef authoring for DOM refs in the playground compiler", async () => {
    const source = `
      import { useRef, useState } from "@litsx\/litsx";

      export function Counter() {
        const buttonRef = useRef(null);
        const [count, setCount] = useState(0);

        return <button ref={buttonRef} @click={() => setCount(count + 1)}>{count}</button>;
      }
    `;

    const { code } = await compileLitsxPlayground(source);

    assert.match(code, /import \{[^}]*prepareEffects[^}]*useState[^}]*\} from "@litsx\/litsx";|import \{[^}]*useState[^}]*prepareEffects[^}]*\} from "@litsx\/litsx";/);
    assert.match(code, /get _buttonRefElement\(\)/);
    assert.match(code, /data-ref="_buttonRefElement"/);
    assert.match(code, /const buttonRef = useRef\(this, null\);/);
    assert.match(code, /useCallbackRef\(this, \(\) => this\._buttonRefElement, node => buttonRef\.current = node\);/);
    assert.match(code, /const \[count, setCount\] = useState\(this, 0\);/);
    assert.match(code, /prepareEffects\(this\);/);
  });

  it("compiles the useEmit reference demo in the playground compiler", async () => {
    const { code } = await compileLitsxPlayground(useEmitExampleSource, {
      filename: "/playground/UseEmitDemo.tsx",
    });

    assert.match(
      code,
      /import \{[^}]*useEmit[^}]*useState[^}]*prepareEffects[^}]*\} from "@litsx\/litsx";|import \{[^}]*useState[^}]*useEmit[^}]*prepareEffects[^}]*\} from "@litsx\/litsx";|import \{[^}]*prepareEffects[^}]*useEmit[^}]*useState[^}]*\} from "@litsx\/litsx";/
    );
    assert.match(code, /const emit = useEmit\(this\);/);
    assert.match(code, /emit\("change", current\);/);
    assert.match(code, /@change=\$\{event => {/);
  });

  it("compiles the useAsyncState reference demo in the playground compiler", async () => {
    const { code } = await compileLitsxPlayground(useAsyncStateExampleSource, {
      filename: "/playground/UseAsyncStateDemo.tsx",
    });

    assert.match(
      code,
      /import \{[^}]*useAsyncState[^}]*prepareEffects[^}]*\} from "@litsx\/litsx";|import \{[^}]*prepareEffects[^}]*useAsyncState[^}]*\} from "@litsx\/litsx";/
    );
    assert.match(code, /const \[count, saveCount, meta\] = useAsyncState\(this, 1, async \(_current, nextCount\) => {/);
    assert.match(code, /@click=\$\{\(\) => saveCount\(count \+ 1\)\}/);
  });

  it("compiles the useOptimistic reference demo in the playground compiler", async () => {
    const { code } = await compileLitsxPlayground(useOptimisticExampleSource, {
      filename: "/playground/UseOptimisticDemo.tsx",
    });

    assert.match(
      code,
      /import \{[^}]*useOptimistic[^}]*useState[^}]*prepareEffects[^}]*\} from "@litsx\/litsx";|import \{[^}]*prepareEffects[^}]*useOptimistic[^}]*useState[^}]*\} from "@litsx\/litsx";|import \{[^}]*useState[^}]*prepareEffects[^}]*useOptimistic[^}]*\} from "@litsx\/litsx";/
    );
    assert.match(code, /const \[optimisticTodos, addOptimisticTodo, resetOptimisticTodos\] = useOptimistic\(this, baseTodos, \(currentTodos, optimisticTodo\) => \[\.\.\.currentTodos, optimisticTodo\]\);/);
    assert.match(code, /@click=\$\{\(\) => addOptimisticTodo/);
  });

  it("compiles the Lit directives demo in the playground compiler", async () => {
    const { code } = await compileLitsxPlayground(litDirectivesExampleSource, {
      filename: "/playground/DirectiveInbox.tsx",
    });

    assert.match(code, /import \{ keyed \} from "lit\/directives\/keyed\.js";/);
    assert.match(code, /import \{ repeat \} from "lit\/directives\/repeat\.js";/);
    assert.match(code, /import \{ when \} from "lit\/directives\/when\.js";/);
    assert.match(code, /return html`<div>\$\{keyed\(cycle,\s*html`<section class="directive-card">/);
    assert.match(code, /repeat\(visibleMessages,/);
    assert.match(code, /when\(\s*visibleMessages\.length > 0,/);
  });

  it("supports native useRef and useCallbackRef authoring in the playground compiler", async () => {
    const source = `
      import { useCallbackRef, useRef } from "@litsx\/litsx";

      export function Counter() {
        const buttonRef = useRef(null);
        const latestNode = useRef(null);

        useCallbackRef(() => buttonRef.current, (node) => {
          latestNode.current = node;
        }, [buttonRef.current]);

        return <button ref={buttonRef}>Ready</button>;
      }
    `;

    const { code } = await compileLitsxPlayground(source);

    assert.match(
      code,
      /import \{[^}]*useCallbackRef[^}]*useRef[^}]*prepareEffects[^}]*\} from "@litsx\/litsx";|import \{[^}]*useRef[^}]*useCallbackRef[^}]*prepareEffects[^}]*\} from "@litsx\/litsx";|import \{[^}]*prepareEffects[^}]*useRef[^}]*useCallbackRef[^}]*\} from "@litsx\/litsx";/
    );
    assert.match(code, /const latestNode = useRef\(this, null\);/);
    assert.match(
      code,
      /(?:_useCallbackRef|useCallbackRef)\(this, \(\) => buttonRef\.current, (?:\(node\)|node) => {\s*latestNode\.current = node;\s*}, \[buttonRef\.current\]\);/s
    );
  });

  it("supports scoped elements and suspense primitives in the playground compiler", async () => {
    const source = `
      import { SuspenseBoundary } from "@litsx\/litsx";

      export function Counter() {
        return (
          <section>
            <SuspenseBoundary fallback={<span>Loading</span>}>
              <span>Ready</span>
            </SuspenseBoundary>
          </section>
        );
      }
    `;

    const { code } = await compileLitsxPlayground(source);

    assert.match(
      code,
      /import \{ ShadowDomElementsMixin \} from "@litsx\/litsx\/runtime-infrastructure";/
    );
    assert.match(code, /export class Counter extends ShadowDomElementsMixin\(LitElement\)/);
    assert.match(code, /static elements = \{\s*"suspense-boundary": SuspenseBoundary\s*\};/);
    assert.match(code, /<suspense-boundary/);
  });

  it("uses the light DOM elements mixin for light DOM component dependencies in the playground compiler", async () => {
    const source = `
      import { SuspenseBoundary } from "@litsx\/litsx";

      export function Counter() {
        ^lightDom();

        return (
          <section>
            <SuspenseBoundary fallback={<span>Loading</span>}>
              <span>Ready</span>
            </SuspenseBoundary>
          </section>
        );
      }
    `;

    const { code } = await compileLitsxPlayground(source);

    assert.match(
      code,
      /import \{ LightDomElementsMixin, LightDomMixin \} from "@litsx\/litsx\/runtime-infrastructure";|import \{ LightDomMixin, LightDomElementsMixin \} from "@litsx\/litsx\/runtime-infrastructure";/
    );
    assert.doesNotMatch(code, /ShadowDomElementsMixin/);
    assert.match(code, /export class Counter extends LightDomElementsMixin\(LightDomMixin\(LitElement\)\)/);
    assert.match(code, /static elements = \{\s*"suspense-boundary": SuspenseBoundary\s*\};/);
    assert.match(code, /<suspense-boundary/);
  });

  it("composes static hoists with scoped elements mixins in the emitted superclass", async () => {
    const source = `
      import { SuspenseBoundary } from "@litsx\/litsx";

      export function Counter() {
        ^styles(\`
          :host { display: block; }
        \`);

        return (
          <section>
            <SuspenseBoundary fallback={<span>Loading</span>}>
              <span>Ready</span>
            </SuspenseBoundary>
          </section>
        );
      }
    `;

    const { code } = await compileLitsxPlayground(source);

    assert.match(code, /import \{[^}]*LitsxStaticHoistsMixin[^}]*ShadowDomElementsMixin[^}]*\} from "@litsx\/litsx\/runtime-infrastructure";|import \{[^}]*ShadowDomElementsMixin[^}]*LitsxStaticHoistsMixin[^}]*\} from "@litsx\/litsx\/runtime-infrastructure";/);
    assert.match(code, /export class Counter extends ShadowDomElementsMixin\(LitsxStaticHoistsMixin\(LitElement\)\)/);
    assert.match(code, /static get styles\(\)/);
  });

  it("keeps scoped suspense primitives registered when nested inside keyed(...)", async () => {
    const source = `
      import { keyed } from "lit/directives/keyed.js";
      import { SuspenseBoundary } from "@litsx\/litsx";

      export function Counter({ cycle }) {
        return (
          <section>
            {keyed(cycle, (
              <SuspenseBoundary fallback={<span>Loading</span>}>
                <span>Ready</span>
              </SuspenseBoundary>
            ))}
          </section>
        );
      }
    `;

    const { code } = await compileLitsxPlayground(source);

    assert.match(
      code,
      /import \{ ShadowDomElementsMixin \} from "@litsx\/litsx\/runtime-infrastructure";/
    );
    assert.match(code, /export class Counter extends ShadowDomElementsMixin\(LitElement\)/);
    assert.match(code, /static elements = \{\s*"suspense-boundary": SuspenseBoundary\s*\};/);
    assert.match(code, /keyed\(this\.cycle,\s*html`<suspense-boundary/s);
  });

  it("compiles error boundaries whose render props contain nested lit-flavoured JSX bindings", async () => {
    const source = `
      import { keyed } from "lit/directives/keyed.js";
      import { ErrorBoundary, useState } from "@litsx\/litsx";

      export function BoundaryDemo() {
        const [cycle, setCycle] = useState(0);
        const [shouldCrash, setShouldCrash] = useState(false);

        return keyed(cycle, (
          <ErrorBoundary
            .fallbackRenderer={() => (
              <button
                class="retry"
                @click={() => {
                  setShouldCrash(false);
                  setCycle((value) => value + 1);
                }}
              >
                Retry
              </button>
            )}
            .contentRenderer={() => {
              if (shouldCrash) {
                throw new Error("boom");
              }

              return <button @click={() => setShouldCrash(true)}>Trip</button>;
            }}
          />
        ));
      }
    `;

    const { code } = await compileLitsxPlayground(source, {
      filename: "/playground/BoundaryDemo.tsx",
    });

    assert.match(code, /<error-boundary/);
    assert.match(code, /\.fallbackRenderer=\$\{\(\) => html`<button class="retry" @click=\$\{/);
    assert.match(code, /\.contentRenderer=\$\{\(\) => \{/);
    assert.match(code, /html`<button @click=\$\{\(\) => setShouldCrash\(true\)\}>Trip<\/button>`/);
  });

  it("supports ^properties and ^styles in authored playground source", async () => {
    const source = `
      type CardProps = {
        title: string;
        active: boolean;
      };

      export function Card(props: CardProps) {
        ^properties({
          active: { reflect: true },
        });

        ^styles(\`
          :host {
            display: block;
          }
        \`);

        return <article>{props.title}</article>;
      }
    `;

    const { code } = await compileLitsxPlayground(source, {
      filename: "/playground/Card.tsx",
    });

    assert.match(code, /const _litsx_static_properties = Symbol\("litsx\.static\.properties"\);/);
    assert.match(code, /const _litsx_static_styles = Symbol\("litsx\.static\.styles"\);/);
    assert.match(code, /import \{ LitsxStaticHoistsMixin \} from "@litsx\/litsx\/runtime-infrastructure";/);
    assert.match(code, /extends LitsxStaticHoistsMixin\(LitElement\)/);
    assert.match(code, /static get properties\(\)/);
    assert.match(code, /static get styles\(\)/);
    assert.match(code, /reflect: true/);
    assert.match(code, /display: block;/);
  });

  it("compiles the static ^expose demo source used in docs", async () => {
    const { code } = await compileLitsxPlayground(staticExposeExampleSource, {
      filename: "/playground/StaticExposeDemo.tsx",
    });

    assert.match(
      code,
      /import \{[^}]*ShadowDomElementsMixin[^}]*\} from "@litsx\/litsx\/runtime-infrastructure";/
    );
    assert.match(code, /export class ProfileChip extends LitsxStaticHoistsMixin\(LitElement\)/);
    assert.match(code, /static nextTone\(current\)/);
    assert.match(code, /static createPreset\(seed\)/);
    assert.match(code, /static createNote\(name, tone\)/);
    assert.match(code, /ProfileChip\.createPreset\(0\)/);
    assert.match(code, /ProfileChip\.nextTone\(current\.tone\)/);
    assert.match(code, /export class StaticExposeDemo extends ShadowDomElementsMixin\(LitsxStaticHoistsMixin\(LitElement\)\)/);
    assert.match(code, /static elements = \{\s*"profile-chip": ProfileChip\s*\}/);
    assert.match(code, /<profile-chip \.name=/);
    assert.doesNotMatch(code, /_litsx_static_styles2/);
    assert.match(code, /return html`<section class="stack">/);
  });

  it("supports a react-compat mode with a separate Babel pipeline", async () => {
    const source = `
      import React, { useState } from "react";

      export function FilterForm() {
        const [query, setQuery] = useState("ready");

        return (
          <label htmlFor="search" className="shell">
            Search
            <input
              id="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </label>
        );
      }
    `;

    const { code } = await compileLitsxPlayground(source, {
      filename: "/playground/FilterForm.tsx",
      mode: "react-compat",
    });

    assert.match(code, /return html`<label for="search" class="shell">/);
    assert.match(code, /\.value=\$\{query\}/);
    assert.match(code, /@input=\$\{event => setQuery\(event\.target\.value\)\}/);
    assert.doesNotMatch(code, /htmlFor=/);
    assert.doesNotMatch(code, /className=/);

    const result = await compileLitsxPlayground(source, {
      filename: "/playground/FilterForm.tsx",
      mode: "react-compat",
    });

    assert.deepStrictEqual(result.metadata.litsxWarnings || [], []);
  });

  it("surfaces a JSX parser error when formatting intermediate native output without the template pass", async () => {
    const source = `
      export function Counter({ label }) {
        return <button>{label}</button>;
      }
    `;

    await assert.rejects(
      () =>
        compileLitsxPlayground(source, {
          filename: "/playground/Counter.tsx",
          jsxTemplate: false,
        }),
      /experimental syntax 'jsx'/i
    );
  });

  it("surfaces a JSX parser error when formatting intermediate react-compat output without the template pass", async () => {
    const source = `
      import React, { useState } from "react";

      export function FilterForm() {
        const [query, setQuery] = useState("ready");
        return <input value={query} onChange={(event) => setQuery(event.target.value)} />;
      }
    `;

    await assert.rejects(
      () =>
        compileLitsxPlayground(source, {
          filename: "/playground/FilterForm.tsx",
          mode: "react-compat",
          jsxTemplate: false,
        }),
      /experimental syntax 'jsx'/i
    );
  });

  it("lowers wrappers, lazy, suspense, and error boundaries in react-compat mode", async () => {
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

    const { code, metadata } = await compileLitsxPlayground(source, {
      filename: "/playground/Demo.tsx",
      mode: "react-compat",
    });

    assert.match(code, /import \{[^}]*useCallbackRef[^}]*ensureLazyElement[^}]*SuspenseBoundary[^}]*ErrorBoundary[^}]*\} from "@litsx\/litsx";|import \{[^}]*useCallbackRef[^}]*ensureLazyElement[^}]*ErrorBoundary[^}]*SuspenseBoundary[^}]*\} from "@litsx\/litsx";|import \{[^}]*ensureLazyElement[^}]*useCallbackRef[^}]*SuspenseBoundary[^}]*ErrorBoundary[^}]*\} from "@litsx\/litsx";/);
    assert.match(code, /const ResultsPanel = \(\) => import\("\.\/ResultsPanel\.js"\);/);
    assert.match(code, /export class Demo extends ShadowDomElementsMixin\(LitElement\)/);
    assert.match(code, /<error-boundary \.fallbackRenderer=/);
    assert.match(code, /<suspense-boundary \.fallbackRenderer=/);
    assert.match(code, /ensureLazyElement\(this, "results-panel", ResultsPanel\)/);
    assert.match(code, /useCallbackRef\(this, \(\) => this\.renderRoot\?\.querySelector\("\[data-ref=\\"_refElement\\"\]"\)/);
    assert.match(code, /<section class="shell" data-ref="_refElement">/);
    assert.doesNotMatch(code, /<Suspense/);
    assert.doesNotMatch(code, /<ErrorBoundary/);
    assert.doesNotMatch(code, /\blazy\(/);
    assert.deepStrictEqual(metadata.litsxWarnings || [], [
      {
        code: 91016,
        line: 7,
        column: 26,
        message:
          "`memo(...)` is removed during LitSX lowering. LitSX does not use React-style parent re-render bailout semantics, so `memo` is treated as a migration wrapper only.",
      },
    ]);
  });

  it("routes refs through .ref for local ref-as-prop components in react-compat mode", async () => {
    const source = `
      import { useRef, useState } from "react";

      function SearchField({ label = "Forwarded input", ref }) {
        return (
          <label>
            <span>{label}</span>
            <input ref={ref} />
          </label>
        );
      }

      export function ReactForwardRefDemo() {
        const inputRef = useRef(null);
        const [status, setStatus] = useState("Idle");

        return (
          <div>
            <SearchField ref={inputRef} />
            <button
              onClick={() => {
                inputRef.current?.focus();
                setStatus(inputRef.current ? "ok" : "missing");
              }}
            >
              Focus input
            </button>
            <p>{status}</p>
          </div>
        );
      }
    `;

    const { code } = await compileLitsxPlayground(source, {
      filename: "/playground/ReactForwardRefDemo.tsx",
      mode: "react-compat",
    });

    assert.match(code, /<search-field \.ref=\$\{inputRef\}><\/search-field>/);
    assert.match(code, /useCallbackRef\(this, \(\) => this\.renderRoot\?\.querySelector\("\[data-ref=\\"_refElement\\"\]"\)/);
    assert.match(code, /<input data-ref="_refElement">/);
  });

  it("compiles the react context example source in react-compat mode", async () => {
    const { code } = await compileLitsxPlayground(reactContextExampleSource, {
      filename: "/playground/ReactContextDemo.tsx",
      mode: "react-compat",
    });

    assert.match(
      code,
      /import \{ createContext, useContext, renderContext, LitsxContextProviderElement as LitsxContextProvider \} from "@litsx\/litsx\/context";|import \{ createContext, renderContext, useContext, LitsxContextProviderElement as LitsxContextProvider \} from "@litsx\/litsx\/context";|import \{ createContext, useContext, LitsxContextProviderElement as LitsxContextProvider, renderContext \} from "@litsx\/litsx\/context";/
    );
    assert.match(code, /const ThemeContext = createContext\("light"\);/);
    assert.match(code, /const theme = useContext\(this, ThemeContext\);/);
    assert.match(code, /renderContext\(this, ThemeContext, theme =>/);
    assert.match(code, /<litsx-context-provider \.context=\$\{ThemeContext\} \.value=\$\{theme\}>/);
    assert.match(code, /"litsx-context-provider": LitsxContextProvider/);
  });

  it("memoizes preload, falls back unknown modes to native, and avoids duplicating the jsx parser plugin", async () => {
    const { mod, Babel, parserPluginCalls } = await importPlaygroundCompilerWithMockedRuntime();
    const preloadA = mod.preloadLitsxPlaygroundCompiler();
    const preloadB = mod.preloadLitsxPlaygroundCompiler();

    assert.strictEqual(await preloadA, await preloadB);

    const source = `
      export function Counter() {
        return <button>Ready</button>;
      }
    `;

    const firstResult = await mod.compileLitsxPlayground(source, {
      filename: "/playground/Counter.tsx",
      mode: "unexpected-mode",
      parserPlugins: ["typescript", "jsx"],
      jsxTemplate: false,
    });
    const secondResult = await mod.compileLitsxPlayground(source, {
      filename: "/playground/Counter.tsx",
      mode: "unexpected-mode",
      parserPlugins: ["typescript", "jsx"],
      jsxTemplate: false,
    });

    assert.strictEqual(firstResult.code, "const playgroundOutput = 1;");
    assert.strictEqual(secondResult.code, "const playgroundOutput = 1;");
    assert.strictEqual(Babel.transformFromAst.mock.calls.length, 1);
    assert.deepStrictEqual(parserPluginCalls[0], ["typescript", "jsx"]);
    assert.strictEqual(Babel.registerPreset.mock.calls.length, 2);
    assert.strictEqual(Babel.registerPlugin.mock.calls.length, 1);
    assert.strictEqual(Babel.transformFromAst.mock.calls[0][2].presets[0][0], "litsx-native");
  });

  it("falls back to the emitted code and empty metadata when the formatter returns no code", async () => {
    const transformFromAst = vi.fn(() => ({
      ast: { type: "File" },
      code: "const emittedModule = 1;",
    }));
    const transform = vi.fn(() => ({}));
    const { mod, Babel } = await importPlaygroundCompilerWithMockedRuntime({
      transformFromAst,
      transform,
    });

    const result = await mod.compileLitsxPlayground(
      `
        export function Counter() {
          return <button>Ready</button>;
        }
      `,
      {
        filename: "/playground/Counter.tsx",
        jsxTemplate: false,
      }
    );

    assert.strictEqual(result.code, "const emittedModule = 1;");
    assert.deepStrictEqual(result.metadata, {});
    assert.strictEqual(Babel.transform.mock.calls.length, 1);
  });

  it("returns an empty emitted module when the template pass produces no code", async () => {
    const transformFromAst = vi
      .fn()
      .mockImplementationOnce(() => ({
        ast: { type: "File" },
        code: undefined,
        metadata: undefined,
      }))
      .mockImplementationOnce(() => undefined);
    const transform = vi.fn(() => {
      throw new Error("formatEmittedModule should not run for empty output");
    });
    const { mod, Babel } = await importPlaygroundCompilerWithMockedRuntime({
      transformFromAst,
      transform,
    });

    const result = await mod.compileLitsxPlayground(
      `
        export function Counter() {
          return <button>Ready</button>;
        }
      `,
      {
        filename: "/playground/Counter.tsx",
      }
    );

    assert.strictEqual(result.code, "");
    assert.deepStrictEqual(result.metadata, {});
    assert.strictEqual(Babel.transform.mock.calls.length, 0);
    assert.strictEqual(Babel.transformFromAst.mock.calls[1][1], "");
    assert.strictEqual(Babel.transformFromAst.mock.calls[1][2].plugins[0][0], "litsx-jsx-html-template");
  });

});
