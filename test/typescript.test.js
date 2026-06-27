import assert from "assert";
import * as babelParser from "@babel/parser";
import fs from "fs";
import os from "os";
import path from "path";
import ts from "typescript";
import { describe, it, vi } from "vitest";
import * as virtualSourceModule from "../packages/typescript/src/virtualization.js";
import {
  collectLitsxAuthoredIssues,
  inferLitsxStaticHoistInfoAtPosition,
  inferLitsxComponentEventNames,
  inferLitsxComponentPropNames,
} from "../packages/typescript/src/authored-semantics.js";

import plugin, {
  collectLitsxAuthoredDiagnostics,
  createToolingVirtualLitsxSource,
  createVirtualLitsxJsxSource,
  decodeVirtualAttributeName,
  getLitsxAttributeCompletionNames,
  inferLitsxAttributeInfoAtPosition,
  inferLitsxAttributeCompletionContext,
  inferLitsxMarkupCompletionContext,
  looksLikeLitsxJsx,
  mapOriginalPositionToVirtual,
  mapOriginalPositionToToolingVirtual,
  remapVirtualText,
  remapTextSpanToOriginal,
  remapToolingTextSpanToOriginal,
  runLitsxTypecheck,
} from "../packages/typescript/src/index.js";

const TEMP_JSX_GLOBALS_DTS = `
declare namespace JSX {
  interface IntrinsicElements {
    [elemName: string]: any;
  }
}
`;

async function withMockedTypeScript(mockFactory, callback) {
  const actualTs = await vi.importActual("typescript");

  vi.resetModules();
  vi.doMock("typescript", () => {
    const mockedTs = mockFactory(actualTs.default, actualTs);
    return {
      ...mockedTs,
      default: mockedTs,
    };
  });

  try {
    const typecheckModule = await import("../packages/typescript/src/typecheck.js");
    return await callback(typecheckModule, actualTs.default, actualTs);
  } finally {
    vi.doUnmock("typescript");
    vi.resetModules();
  }
}

describe("@litsx/typescript", () => {
  it("typechecks the published core JSX declarations without skipLibCheck", () => {
    const repoRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
    const program = ts.createProgram({
      rootNames: [
        path.join(repoRoot, "packages/core/src/index.d.ts"),
        path.join(repoRoot, "packages/core/src/jsx-runtime.d.ts"),
        path.join(repoRoot, "packages/core/src/jsx-dev-runtime.d.ts"),
      ],
      options: {
        noEmit: true,
        strict: true,
        skipLibCheck: false,
        module: ts.ModuleKind.ESNext,
        moduleResolution: ts.ModuleResolutionKind.Bundler,
        target: ts.ScriptTarget.ESNext,
        lib: ["lib.esnext.d.ts", "lib.dom.d.ts"],
      },
    });

    const diagnostics = ts.getPreEmitDiagnostics(program);
    assert.deepStrictEqual(
      diagnostics.map((diagnostic) =>
        ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n")
      ),
      [],
    );
  });

  it("allows arbitrary attributes only on custom element intrinsic tags", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "litsx-intrinsic-custom-attrs-"));
    const filePath = path.join(tempDir, "index.tsx");
    const globalsPath = path.join(tempDir, "global.d.ts");
    const repoRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
    const jsxRuntimePath = path.join(repoRoot, "packages/core/src/jsx-runtime.d.ts").replaceAll("\\", "/");

    try {
      fs.writeFileSync(
        globalsPath,
        [
          `import type { JSX as LitsxJSX } from "${jsxRuntimePath}";`,
          "declare global {",
          "  namespace JSX {",
          "    interface Element extends LitsxJSX.Element {}",
          "    interface IntrinsicElements extends LitsxJSX.IntrinsicElements {}",
          "  }",
          "}",
          "export {};",
          "",
        ].join("\n"),
      );
      fs.writeFileSync(
        filePath,
        `
          const custom = <vds-icon size="sm" data-test="icon" />;
          const boundary = <error-boundary fallback="oops" />;
          const suspense = <suspense-boundary fallback="loading" />;
          const list = <suspense-list revealOrder="forwards" tail="collapsed" />;
          const native = <div foo="bar" />;
        `,
      );

      const program = ts.createProgram({
        rootNames: [filePath, globalsPath],
        options: {
          jsx: ts.JsxEmit.Preserve,
          module: ts.ModuleKind.ESNext,
          moduleResolution: ts.ModuleResolutionKind.Bundler,
          target: ts.ScriptTarget.ESNext,
          noEmit: true,
          strict: true,
          skipLibCheck: true,
        },
      });

      const diagnostics = ts.getPreEmitDiagnostics(program).filter(
        (diagnostic) => diagnostic.file?.fileName === filePath,
      );

      assert.strictEqual(diagnostics.length, 1);
      assert.match(
        ts.flattenDiagnosticMessageText(diagnostics[0].messageText, "\n"),
        /Property 'foo' does not exist/,
      );
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("accepts LitSX virtualized authored bindings on PascalCase component JSX without allowing arbitrary props", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "litsx-component-authored-bindings-"));
    const filePath = path.join(tempDir, "index.tsx");

    try {
      fs.symlinkSync(path.resolve("node_modules"), path.join(tempDir, "node_modules"), "dir");
      fs.writeFileSync(
        filePath,
        `
          import type { LitsxRenderable } from "@litsx/core";

          type Product = { id: string };

          const product: Product = { id: "sku-1" };
          const checked = true;
          const ref = (value: unknown) => {};

          const VdsProductCard = (props: {
            product?: Product;
            checked?: boolean;
            children?: LitsxRenderable;
          }) => null;

          const valid = (
            <VdsProductCard
              __litsx_prop_product={product}
              __litsx_event_click={(event) => event?.preventDefault()}
              __litsx_bool_checked={checked}
              slot="content"
              ref={ref}
              class="card"
              style={{ color: "red" }}
              part="surface"
              data-kind="product"
              aria-label="Product"
            >
              Buy
            </VdsProductCard>
          );

          const invalid = <VdsProductCard foo="bar" />;
        `,
      );

      const program = ts.createProgram({
        rootNames: [filePath],
        options: {
          jsx: ts.JsxEmit.ReactJSX,
          jsxImportSource: "@litsx/core",
          module: ts.ModuleKind.ESNext,
          moduleResolution: ts.ModuleResolutionKind.Bundler,
          target: ts.ScriptTarget.ESNext,
          noEmit: true,
          strict: true,
          skipLibCheck: true,
        },
      });

      const diagnostics = ts.getPreEmitDiagnostics(program).filter(
        (diagnostic) => diagnostic.file?.fileName === filePath,
      );

      assert.strictEqual(
        diagnostics.length,
        1,
        diagnostics.map((diagnostic) =>
          ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n")
        ).join("\n"),
      );
      assert.match(
        ts.flattenDiagnosticMessageText(diagnostics[0].messageText, "\n"),
        /Property 'foo' does not exist/,
      );
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("infers defineHook argument and result types from structural definitions", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "litsx-define-hook-types-"));
    const filePath = path.join(tempDir, "index.ts");
    const repoRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
    const coreRuntimePath = path.join(repoRoot, "packages/core/src/index.js").replaceAll("\\", "/");

    try {
      fs.writeFileSync(
        filePath,
        [
          `import { defineHook } from "${coreRuntimePath}";`,
          "",
          "const useLocale = defineHook<[locale: string], string, undefined, { initial: string }>({",
          "  setup(locale) {",
          "    return { initial: locale };",
          "  },",
          "  use(locale, state) {",
          "    return `${state.instance.initial}:${locale}`;",
          "  },",
          "});",
          "",
          "const value: string = useLocale('en');",
          "// @ts-expect-error wrong structural hook argument",
          "useLocale(123);",
          "// @ts-expect-error structural hook result is string",
          "const numberValue: number = useLocale('en');",
          "",
          "const useMixed = defineHook<[key: string], string, { prefix: string }, { count: number }>({",
          "  static(key) {",
          "    return { prefix: key.toUpperCase() };",
          "  },",
          "  setup(key, staticState) {",
          "    const prefix: string = staticState.prefix;",
          "    return { count: prefix.length + key.length };",
          "  },",
          "  middlewares: {",
          "    connectedCallback(next, state, meta) {",
          "      const prefix: string = state.static.prefix;",
          "      const count: number = state.instance.count;",
          "      const path: string[] = meta.callsitePath;",
          "      return next();",
          "    },",
          "  },",
          "  use(key, state) {",
          "    return `${state.static.prefix}:${state.instance.count}:${key}`;",
          "  },",
          "});",
          "const mixedValue: string = useMixed('catalog');",
          "// @ts-expect-error mixed hook requires string key",
          "useMixed(false);",
          "",
        ].join("\n"),
      );

      const program = ts.createProgram({
        rootNames: [filePath],
        options: {
          noEmit: true,
          strict: true,
          skipLibCheck: true,
          module: ts.ModuleKind.ESNext,
          moduleResolution: ts.ModuleResolutionKind.Bundler,
          target: ts.ScriptTarget.ESNext,
          lib: ["lib.esnext.d.ts", "lib.dom.d.ts"],
        },
      });
      const diagnostics = ts.getPreEmitDiagnostics(program);
      assert.deepStrictEqual(
        diagnostics.map((diagnostic) =>
          ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n")
        ),
        [],
      );
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("reports authored diagnostics for invalid lit bindings", () => {
    const source = `
      const view = (
        <button
          @click="handleClick"
          .value="label"
          ?disabled="yes"
        />
      );
    `;
    const diagnostics = collectLitsxAuthoredDiagnostics(source, {
      DiagnosticCategory: {
        Error: 1,
      },
    }, {
      plugins: ["typescript"],
    });

    assert.strictEqual(diagnostics.length, 3);
    assert.match(diagnostics[0].messageText, /must use an expression/);
    assert.match(diagnostics[1].messageText, /must use an expression/);
    assert.match(diagnostics[2].messageText, /must be bare or use an expression/);
  });

  it("surfaces authored parse errors and filters eslint-only issues by channel", () => {
    const parseIssues = collectLitsxAuthoredIssues("<button @click={}></button>");
    assert.strictEqual(parseIssues.length, 1);
    assert.strictEqual(parseIssues[0].code, 91000);

    const source = `
      import React, { memo } from "react";

      const Card = memo(function Card(props) {
        const value = props.title;
        const ready = true;
        static styles = \`:host { display: block; }\`;
        return (
          <label htmlFor="field">
            <input defaultValue="a" defaultChecked dangerouslySetInnerHTML={{ __html: value }} />
          </label>
        );
      }, () => true);
    `;

    const tsIssues = collectLitsxAuthoredIssues(source);
    const eslintIssues = collectLitsxAuthoredIssues(source, { channel: "eslint" });
    const allIssues = collectLitsxAuthoredIssues(source, { channel: "all" });

    assert.ok(tsIssues.some((issue) => issue.code === 91010));
    assert.ok(tsIssues.some((issue) => issue.code === 91014));
    assert.ok(tsIssues.some((issue) => issue.code === 91018));
    assert.ok(!tsIssues.some((issue) => issue.code === 91015));
    assert.ok(!tsIssues.some((issue) => issue.code === 91016));
    assert.ok(!tsIssues.some((issue) => issue.code === 91017));

    assert.ok(eslintIssues.some((issue) => issue.code === 91015));
    assert.ok(eslintIssues.some((issue) => issue.code === 91016));
    assert.ok(eslintIssues.some((issue) => issue.code === 91017));
    assert.ok(allIssues.some((issue) => issue.code === 91016));
    assert.ok(allIssues.some((issue) => issue.code === 91017));
  });


  it("infers static hoist and attribute completion metadata from authored source", () => {
    const source = `
      function Card() {
        static styles = \`:host { display: block; }\`;
        return <input @fo .va ?di />;
      }
    `;

    const hoistPosition = source.indexOf("static styles") + 4;
    const hoistInfo = inferLitsxStaticHoistInfoAtPosition(source, hoistPosition);
    assert.deepStrictEqual(
      {
        name: hoistInfo?.name,
        start: hoistInfo?.start,
        length: hoistInfo?.length,
      },
      {
        name: "static styles",
        start: source.indexOf("static styles"),
        length: "static styles".length,
      },
    );
    assert.match(hoistInfo?.documentation ?? "", /static style hoist/i);
    assert.strictEqual(inferLitsxStaticHoistInfoAtPosition("const value = count ^ other;", 10), null);
    assert.strictEqual(inferLitsxStaticHoistInfoAtPosition(null, 0), null);

    const eventPosition = source.indexOf("@fo") + 3;
    const propPosition = source.indexOf(".va") + 3;
    const boolPosition = source.indexOf("?di") + 3;
    const outsidePosition = source.indexOf("return") - 1;

    assert.deepStrictEqual(
      inferLitsxAttributeCompletionContext(source, eventPosition),
      {
        tagName: "input",
        prefix: "@",
        partialName: "fo",
        start: source.indexOf("@fo"),
        length: 3,
      },
    );
    assert.deepStrictEqual(
      inferLitsxAttributeInfoAtPosition(source, propPosition),
      {
        tagName: "input",
        prefix: ".",
        localName: "va",
        name: ".va",
        start: source.indexOf(".va"),
        length: 3,
      },
    );
    assert.strictEqual(inferLitsxAttributeCompletionContext(source, outsidePosition), null);
    assert.strictEqual(inferLitsxAttributeInfoAtPosition(source, outsidePosition), null);

    assert.deepStrictEqual(getLitsxAttributeCompletionNames(null), []);
    assert.deepStrictEqual(getLitsxAttributeCompletionNames({
      tagName: "input",
      prefix: "@",
      partialName: "fo",
    }), ["@focus"]);
    assert.deepStrictEqual(getLitsxAttributeCompletionNames({
      tagName: "unknown-tag",
      prefix: ".",
      partialName: "va",
    }), [".value"]);
    assert.deepStrictEqual(getLitsxAttributeCompletionNames({
      tagName: "input",
      prefix: "!",
      partialName: "",
    }), []);
    assert.deepStrictEqual(getLitsxAttributeCompletionNames({
      tagName: "input",
      prefix: "?",
      partialName: "di",
    }), ["?disabled"]);
    assert.strictEqual(inferLitsxAttributeInfoAtPosition(source, boolPosition)?.name, "?di");

    const unknownHoistSource = `
      function Card() {
        static customThing = { mode: "open" };
      }
    `;
    const unknownHoist = inferLitsxStaticHoistInfoAtPosition(
      unknownHoistSource,
      unknownHoistSource.indexOf("static customThing") + 8,
    );
    assert.match(unknownHoist?.documentation ?? "", /static hoist static customThing/i);
  });

  it("rejects malformed static hoist probes before a valid hoist match", () => {
    const source = `
      const invalid = staticstyles;
      const broken = static styles value;
      const unfinished = static styles;
      function Card() {
        static styles = \`:host { display: block; }\`;
      }
    `;

    const validStart = source.lastIndexOf("static styles");
    assert.strictEqual(
      inferLitsxStaticHoistInfoAtPosition(source, source.indexOf("staticstyles") + 2),
      null,
    );
    assert.strictEqual(
      inferLitsxStaticHoistInfoAtPosition(source, source.indexOf("static styles value") + 8),
      null,
    );
    assert.strictEqual(
      inferLitsxStaticHoistInfoAtPosition(source, source.indexOf("static styles;") + 8),
      null,
    );
    assert.deepStrictEqual(
      inferLitsxStaticHoistInfoAtPosition(source, validStart + 2),
      {
        name: "static styles",
        start: validStart,
        length: "static styles".length,
        documentation: "LitSX static style hoist. Declare component-scoped styles before render-time statements.",
      },
    );
  });

  it("limits native className warnings to intrinsic elements", () => {
    const issues = collectLitsxAuthoredIssues(`
      const view = (
        <>
          <button className="cta" />
          <FancyButton className="cta" />
        </>
      );
    `);

    const classNameIssues = issues.filter((issue) => issue.code === 91008);
    assert.strictEqual(classNameIssues.length, 1);
  });

  it("reports duplicate static hoists and avoids duplicate opaque prop warnings for the same prop", () => {
    const issues = collectLitsxAuthoredIssues(`
      const Card = (props) => {
        static styles = \`:host { display: block; }\`;
        static styles = \`:host { color: red; }\`;
        return <div>{props.title}{props.title}</div>;
      };
    `, { channel: "all" });

    assert.ok(issues.some((issue) => issue.code === 91009));
    assert.strictEqual(
      issues.filter((issue) => issue.code === 91018).length,
      1,
    );
    assert.strictEqual(
      issues.filter((issue) => issue.code === 91014).length,
      1,
    );
  });

  it("reports react compat surface warnings for every supported intrinsic attribute alias", () => {
    const issues = collectLitsxAuthoredIssues(`
      const view = (
        <label htmlFor="search">
          <input defaultValue="a" defaultChecked dangerouslySetInnerHTML={{ __html: html }} />
        </label>
      );
    `, { channel: "all" });

    assert.ok(issues.some((issue) => issue.code === 91010));
    assert.ok(issues.some((issue) => issue.code === 91011));
    assert.ok(issues.some((issue) => issue.code === 91012));
    assert.ok(issues.some((issue) => issue.code === 91013));
  });

  it("detects namespaced React.memo and assignment-style component hoists", () => {
    const issues = collectLitsxAuthoredIssues(`
      import * as React from "react";

      Card = React.memo((props) => {
        const message = props.title;
        const ready = true;
        static lightDom = true;
        return <div>{message}{ready ? props.title : null}</div>;
      }, () => true);
    `, { channel: "all" });

    assert.ok(issues.some((issue) => issue.code === 91016));
    assert.ok(issues.some((issue) => issue.code === 91017));
  });

  it("detects component-like function expressions, assignment expressions, and hoists-first ordering", () => {
    const issues = collectLitsxAuthoredIssues(`
      let AssignedCard;
      AssignedCard = function AssignedCard(props) {
        const label = props.title;
        static lightDom = true;
        return <div>{label}</div>;
      };

      const ArrowCard = (props) => {
        const theme = props.theme;
        static shadowRootOptions = { mode: "open" };
        return <div>{theme}</div>;
      };
    `, { channel: "all" });

    assert.ok(issues.some((issue) => issue.code === 91014));
    assert.ok(issues.some((issue) => issue.code === 91018));
    assert.ok(issues.some((issue) => issue.code === 91015));
  });

  it("warns that static shadowRootOptions is ignored when static lightDom is present", () => {
    const issues = collectLitsxAuthoredIssues(`
      function Card() {
        static lightDom = true;
        static shadowRootOptions = { mode: "open" };
        return <div>ready</div>;
      }
    `, { channel: "all" });

    assert.ok(issues.some((issue) => issue.code === 91019));
    assert.ok(issues.some((issue) => issue.code === 91019 && /ignored when static lightDom = true/.test(issue.message)));
  });

  it("documents static styles hoists in authored diagnostics", () => {
    const issues = collectLitsxAuthoredIssues(`
      function Card() {
        static styles = \`:host { display: block; }\`;
        return <div>ready</div>;
      }
    `, { channel: "all" });

    assert.ok(!issues.some((issue) => issue.code === 91020));
    assert.ok(!issues.some((issue) => /deprecated/.test(issue.message)));
  });

  it("ignores opaque prop access checks for non-component functions and non-identifier params", () => {
    const issues = collectLitsxAuthoredIssues(`
      function helper(props) {
        return props.title;
      }

      const lower = (props) => props.title;

      export function Card({ title }) {
        return <div>{title}</div>;
      }
    `, { channel: "all" });

    assert.ok(!issues.some((issue) => issue.code === 91014));
    assert.ok(!issues.some((issue) => issue.code === 91018));
  });

  it("warns when destructured component props have no explicit metadata", () => {
    const issues = collectLitsxAuthoredIssues(`
      export function Card({ title, count = 0 }) {
        return <button>{title}:{count}</button>;
      }
    `, { channel: "all" });

    assert.ok(issues.some((issue) => issue.code === 91020));
    assert.ok(issues.some((issue) => issue.code === 91020 && /"title"/.test(issue.message)));
    assert.ok(!issues.some((issue) => issue.code === 91020 && /"count"/.test(issue.message)));
  });

  it("does not warn for destructured component props inferable from default values", () => {
    const issues = collectLitsxAuthoredIssues(`
      export function Card({ title = "Hello", count = 0, active = false }) {
        return <button>{title}:{count}:{String(active)}</button>;
      }
    `, { channel: "all" });

    assert.ok(!issues.some((issue) => issue.code === 91020));
  });

  it("does not warn for destructured component props with TypeScript annotations", () => {
    const issues = collectLitsxAuthoredIssues(`
      type Props = { title: string; count?: number };

      export function Card({ title, count = 0 }: Props) {
        return <button>{title}:{count}</button>;
      }
    `, { channel: "all", plugins: ["typescript"] });

    assert.ok(!issues.some((issue) => issue.code === 91020));
  });

  it("does not warn for destructured component props covered by static properties", () => {
    const issues = collectLitsxAuthoredIssues(`
      export function Card({ title, count = 0 }) {
        static properties = {
          title: String,
          count: Number,
        };

        return <button>{title}:{count}</button>;
      }
    `, { channel: "all" });

    assert.ok(!issues.some((issue) => issue.code === 91020));
  });

  it("treats PascalCase function declarations as components and ignores member assignments", () => {
    const issues = collectLitsxAuthoredIssues(`
      function Card(props) {
        return <div>{props.title}</div>;
      }

      controls.Card = (props) => props.title;
    `, { channel: "all" });

    assert.strictEqual(issues.filter((issue) => issue.code === 91014).length, 1);
    assert.ok(issues.some((issue) => issue.code === 91018));
  });

  it("skips react-compat warnings on non-intrinsic JSX tags and omits distant binding suggestions", () => {
    const issues = collectLitsxAuthoredIssues(`
      const view = (
        <>
          <Widget htmlFor="field" defaultValue="x" />
          <button @somethingwild={handler} />
        </>
      );
    `);

    assert.ok(!issues.some((issue) => issue.code === 91010));
    const listenerIssue = issues.find((issue) => issue.code === 91006);
    assert.ok(listenerIssue);
    assert.doesNotMatch(listenerIssue.message, /Did you mean/);
  });

  it("skips native className warnings for mocked member-expression component tags", () => {
    const parseSpy = vi.spyOn(babelParser, "parse").mockReturnValue({
      type: "File",
      program: {
        type: "Program",
        body: [
          {
            type: "ExpressionStatement",
            expression: {
              type: "JSXElement",
              openingElement: {
                type: "JSXOpeningElement",
                name: {
                  type: "JSXMemberExpression",
                  object: {
                    type: "JSXIdentifier",
                    name: "UI",
                  },
                  property: {
                    type: "JSXIdentifier",
                    name: "Button",
                  },
                },
                attributes: [
                  null,
                  {
                    type: "JSXAttribute",
                    start: 4,
                    end: 13,
                    name: {
                      type: "JSXIdentifier",
                      name: "className",
                    },
                    value: {
                      type: "StringLiteral",
                      value: "cta",
                    },
                  },
                ],
              },
            },
          },
        ],
      },
    });

    try {
      assert.deepStrictEqual(
        collectLitsxAuthoredDiagnostics("<UI.Button className=\"cta\" />", {
          DiagnosticCategory: {
            Warning: 0,
            Error: 1,
          },
        }, {
          plugins: ["typescript"],
        }),
        [],
      );
    } finally {
      parseSpy.mockRestore();
    }
  });

  it("warns when native className is authored on intrinsic elements", () => {
    const source = `
      const view = <button className="cta">Save</button>;
    `;
    const diagnostics = collectLitsxAuthoredDiagnostics(source, {
      DiagnosticCategory: {
        Warning: 0,
        Error: 1,
      },
    });

    assert.strictEqual(diagnostics.length, 1);
    assert.strictEqual(diagnostics[0].category, 0);
    assert.strictEqual(diagnostics[0].code, 91008);
    assert.match(diagnostics[0].messageText, /not native LitSX syntax/);
  });

  it("reports authored diagnostics for non-top-level static hoists", () => {
    const source = `
      function Card({ ready }) {
        if (ready) {
          static styles = \`:host { display: block; }\`;
        }

        return <div>ready</div>;
      }
    `;

    const diagnostics = collectLitsxAuthoredDiagnostics(source, {
      DiagnosticCategory: {
        Error: 1,
      },
    }, {
      plugins: ["typescript"],
    });

    assert.ok(diagnostics.some((diagnostic) => diagnostic.code === 91007));
    assert.ok(
      diagnostics.some((diagnostic) => (
        diagnostic.code === 91007
        && /must appear as a top-level statement in the component body/.test(diagnostic.messageText)
      )),
    );
  });

  it("does not report authored diagnostics for top-level static hoists", () => {
    const source = `
      function Card() {
        static styles = \`:host { display: block; }\`;
        static shadowRootOptions = { mode: "open" };
        return <div>ready</div>;
      }
    `;

    const diagnostics = collectLitsxAuthoredDiagnostics(source, {
      DiagnosticCategory: {
        Error: 1,
      },
    }, {
      plugins: ["typescript"],
    });

    assert.deepStrictEqual(diagnostics, []);
  });

  it("does not remap removed mixin sentinels", () => {
    const text = "const Selectable = __litsx_mixin(function Selectable(){ return __litsx_super_render(); });";
    assert.strictEqual(remapVirtualText(text), text);
  });

  it("declares static lightDom in tooling virtual source", () => {
    const source = `
      function Card() {
        static lightDom = true;
        return <div />;
      }
    `;

    const result = createToolingVirtualLitsxSource(source, {
      plugins: ["typescript"],
    });

    assert.match(result.toolingPreamble, /declare function __litsx_static_lightDom\(value\?: unknown\): void;/);
  });

  it("uses JS-safe tooling stubs for static hoists in jsx files", () => {
    const source = `
      function Card() {
        static styles = \`:host { display: block; }\`;
        static lightDom = true;
        return <div />;
      }
    `;

    const result = createToolingVirtualLitsxSource(source);

    assert.match(result.toolingPreamble, /function __litsx_static_lightDom\(value\) \{\}/);
    assert.match(result.toolingPreamble, /function __litsx_static_styles\(value\) \{ return value; \}/);
    assert.doesNotMatch(result.toolingPreamble, /declare function/);
  });

  it("leaves tooling virtual source untouched when no static hoists are present", () => {
    const source = `const view = <button @click={handleClick}>{label}</button>;`;
    const result = createToolingVirtualLitsxSource(source, {
      plugins: ["typescript"],
    });

    assert.equal(result.toolingPreamble, "");
    assert.equal(result.toolingPreambleLength, 0);
    assert.match(result.code, /__litsx_event_click/);
  });

  it("warns when a property binding is unknown for a known tag", () => {
    const diagnostics = collectLitsxAuthoredDiagnostics(
      '<input .unknownProp={value} .value={value} />',
      {
        DiagnosticCategory: {
          Warning: 0,
          Error: 1,
        },
      },
      {
        plugins: ["typescript"],
      },
    );

    assert.strictEqual(diagnostics.length, 1);
    assert.strictEqual(diagnostics[0].category, 0);
    assert.strictEqual(diagnostics[0].code, 91004);
    assert.match(diagnostics[0].messageText, /known LitSX property set for <input>/);
  });

  it("suggests the closest known property binding when the authored name is near a valid one", () => {
    const diagnostics = collectLitsxAuthoredDiagnostics(
      '<input .valeu={value} />',
      {
        DiagnosticCategory: {
          Warning: 0,
          Error: 1,
        },
      },
      {
        plugins: ["typescript"],
      },
    );

    assert.strictEqual(diagnostics.length, 1);
    assert.strictEqual(diagnostics[0].code, 91004);
    assert.match(diagnostics[0].messageText, /Did you mean "\.value"\?/);
  });

  it("warns when a boolean binding is unknown for a known tag", () => {
    const diagnostics = collectLitsxAuthoredDiagnostics(
      '<input ?hidden={flag} ?disabled={busy} />',
      {
        DiagnosticCategory: {
          Warning: 0,
          Error: 1,
        },
      },
      {
        plugins: ["typescript"],
      },
    );

    assert.strictEqual(diagnostics.length, 1);
    assert.strictEqual(diagnostics[0].category, 0);
    assert.strictEqual(diagnostics[0].code, 91005);
    assert.match(diagnostics[0].messageText, /known LitSX boolean attribute set for <input>/);
  });

  it("suggests the closest known boolean binding when the authored name is near a valid one", () => {
    const diagnostics = collectLitsxAuthoredDiagnostics(
      '<input ?disbled={flag} />',
      {
        DiagnosticCategory: {
          Warning: 0,
          Error: 1,
        },
      },
      {
        plugins: ["typescript"],
      },
    );

    assert.strictEqual(diagnostics.length, 1);
    assert.strictEqual(diagnostics[0].code, 91005);
    assert.match(diagnostics[0].messageText, /Did you mean "\?disabled"\?/);
  });

  it("warns when a listener binding is unknown for a known tag", () => {
    const diagnostics = collectLitsxAuthoredDiagnostics(
      '<button @submit={handleSubmit} @click={handleClick} />',
      {
        DiagnosticCategory: {
          Warning: 0,
          Error: 1,
        },
      },
      {
        plugins: ["typescript"],
      },
    );

    assert.strictEqual(diagnostics.length, 1);
    assert.strictEqual(diagnostics[0].category, 0);
    assert.strictEqual(diagnostics[0].code, 91006);
    assert.match(diagnostics[0].messageText, /known LitSX event set for <button>/);
  });

  it("does not treat nested state updater callbacks as component props access", () => {
    const diagnostics = collectLitsxAuthoredDiagnostics(
      `
        const DxSmokeApp = ({ title }) => {
          const [items, setItems] = useState(["alpha"]);

          return (
            <button
              @click={() => {
                setItems((current) => current.map((entry) => entry.toUpperCase()));
              }}
            >
              {title}
            </button>
          );
        };
      `,
      {
        DiagnosticCategory: {
          Warning: 0,
          Error: 1,
        },
      },
      {
        plugins: ["typescript"],
      },
    );

    assert.ok(!diagnostics.some((diagnostic) => diagnostic.code === 91014));
    assert.ok(!diagnostics.some((diagnostic) => diagnostic.code === 91018));
  });

  it("suggests the closest known listener binding when the authored name is near a valid one", () => {
    const diagnostics = collectLitsxAuthoredDiagnostics(
      '<button @clcik={handleClick} />',
      {
        DiagnosticCategory: {
          Warning: 0,
          Error: 1,
        },
      },
      {
        plugins: ["typescript"],
      },
    );

    assert.strictEqual(diagnostics.length, 1);
    assert.strictEqual(diagnostics[0].code, 91006);
    assert.match(diagnostics[0].messageText, /Did you mean "@click"\?/);
  });

  it("can detect and decode virtualized attribute names", () => {
    assert.equal(looksLikeLitsxJsx('<button @click={fn} />'), true);
    assert.equal(looksLikeLitsxJsx("<button onClick={fn} />"), false);
    assert.strictEqual(decodeVirtualAttributeName("__litsx_event_click"), "@click");
    assert.strictEqual(decodeVirtualAttributeName("__litsx_prop_value"), ".value");
    assert.strictEqual(decodeVirtualAttributeName("__litsx_bool_disabled"), "?disabled");
    assert.strictEqual(decodeVirtualAttributeName("title"), null);
  });

  it("infers completion context for lit-flavoured prefixes", () => {
    const eventContext = inferLitsxAttributeCompletionContext("<button @cli", "<button @cli".length);
    const propContext = inferLitsxAttributeCompletionContext("<input .va", "<input .va".length);
    const boolContext = inferLitsxAttributeCompletionContext(
      "<suspense-list ?hi",
      "<suspense-list ?hi".length,
    );

    assert.deepStrictEqual(eventContext, {
      tagName: "button",
      prefix: "@",
      partialName: "cli",
      start: "<button ".length,
      length: "@cli".length,
    });
    assert.deepStrictEqual(propContext, {
      tagName: "input",
      prefix: ".",
      partialName: "va",
      start: "<input ".length,
      length: ".va".length,
    });
    assert.deepStrictEqual(boolContext, {
      tagName: "suspense-list",
      prefix: "?",
      partialName: "hi",
      start: "<suspense-list ".length,
      length: "?hi".length,
    });
    assert.deepStrictEqual(getLitsxAttributeCompletionNames(eventContext), ["@click"]);
    assert.deepStrictEqual(getLitsxAttributeCompletionNames(propContext), [".value", ".valueAsNumber"]);
    assert.deepStrictEqual(getLitsxAttributeCompletionNames(boolContext), ["?hidden"]);
  });

  it("keeps LitSX completion context after event handlers containing arrow functions", () => {
    const source = [
      "const count = 1;",
      "",
      "function Demo() {",
      "  return <input .value={count} @click={() => count.toFixed()} ?disabled />;",
      "}",
      "",
    ].join("\n");

    assert.deepStrictEqual(
      inferLitsxAttributeCompletionContext(source, source.indexOf("?disabled") + 1),
      {
        tagName: "input",
        prefix: "?",
        partialName: "",
        start: source.indexOf("?disabled"),
        length: 1,
      },
    );
    assert.deepStrictEqual(
      inferLitsxMarkupCompletionContext(source, source.indexOf("?disabled")),
      {
        tagName: "input",
        partialName: "",
        start: source.indexOf("?disabled"),
        length: 0,
      },
    );
  });

  it("infers authored attribute info for hover positions inside LitSX attribute names", () => {
    const source = "<button @click={fn} .value={value} ?disabled={busy} />";

    assert.deepStrictEqual(
      inferLitsxAttributeInfoAtPosition(source, source.indexOf("@click") + 2),
      {
        tagName: "button",
        prefix: "@",
        localName: "click",
        name: "@click",
        start: source.indexOf("@click"),
        length: "@click".length,
      },
    );
    assert.deepStrictEqual(
      inferLitsxAttributeInfoAtPosition(source, source.indexOf(".value") + 2),
      {
        tagName: "button",
        prefix: ".",
        localName: "value",
        name: ".value",
        start: source.indexOf(".value"),
        length: ".value".length,
      },
    );
    assert.deepStrictEqual(
      inferLitsxAttributeInfoAtPosition(source, source.indexOf("?disabled") + 2),
      {
        tagName: "button",
        prefix: "?",
        localName: "disabled",
        name: "?disabled",
        start: source.indexOf("?disabled"),
        length: "?disabled".length,
      },
    );
  });

  it("falls back to generic completions for unknown tags and ignores unsupported cursor positions", () => {
    assert.deepStrictEqual(
      inferLitsxAttributeCompletionContext("const value = 1;", 5),
      null,
    );
    assert.deepStrictEqual(
      getLitsxAttributeCompletionNames({
        tagName: "demo-card",
        prefix: ".",
        partialName: "va",
        start: 0,
        length: 3,
      }),
      [".value"],
    );
    assert.deepStrictEqual(
      getLitsxAttributeCompletionNames({
        tagName: "demo-card",
        prefix: "#",
        partialName: "x",
        start: 0,
        length: 2,
      }),
      [],
    );
    assert.deepStrictEqual(
      inferLitsxAttributeCompletionContext("< @cli", "< @cli".length),
      null,
    );
    assert.deepStrictEqual(
      inferLitsxAttributeInfoAtPosition("< @cli", "< @cli".length),
      null,
    );
    assert.deepStrictEqual(getLitsxAttributeCompletionNames(null), []);
    assert.deepStrictEqual(
      getLitsxAttributeCompletionNames({
        tagName: "demo-card",
        prefix: "@",
        partialName: "po",
      }),
      ["@pointerdown", "@pointerup"],
    );
    assert.ok(getLitsxAttributeCompletionNames({
      tagName: "input",
      prefix: "@",
      partialName: "",
    }).includes("@input"));
    assert.ok(getLitsxAttributeCompletionNames({
      tagName: "button",
      prefix: "?",
      partialName: "",
    }).includes("?disabled"));
    assert.ok(getLitsxAttributeCompletionNames({
      tagName: "video",
      prefix: ".",
      partialName: "",
    }).includes(".currentTime"));
    assert.deepStrictEqual(
      getLitsxAttributeCompletionNames({
        tagName: "input",
        prefix: ".",
        partialName: "value",
      }).slice(0, 1),
      [".value"],
    );
    assert.deepStrictEqual(
      getLitsxAttributeCompletionNames({
        tagName: "input",
        prefix: ".",
        partialName: "number",
      }),
      [".valueAsNumber"],
    );
    assert.deepStrictEqual(
      getLitsxAttributeCompletionNames({
        tagName: "input",
        prefix: ".",
        partialName: "num",
      }),
      [".valueAsNumber"],
    );
    assert.deepStrictEqual(
      getLitsxAttributeCompletionNames({
        tagName: "input",
        prefix: ".",
        partialName: "lue",
      }),
      [".value", ".valueAsNumber"],
    );
    assert.deepStrictEqual(
      inferLitsxAttributeCompletionContext(
        '<button title={"<not-a-tag>"} data-copy={`> still inside`} @cli',
        '<button title={"<not-a-tag>"} data-copy={`> still inside`} @cli'.length,
      ),
      {
        tagName: "button",
        prefix: "@",
        partialName: "cli",
        start: '<button title={"<not-a-tag>"} data-copy={`> still inside`} '.length,
        length: "@cli".length,
      },
    );
    assert.deepStrictEqual(
      inferLitsxMarkupCompletionContext("<input aria", "<input aria".length),
      {
        tagName: "input",
        partialName: "aria",
        start: "<input ".length,
        length: "aria".length,
      },
    );
    assert.deepStrictEqual(
      inferLitsxMarkupCompletionContext("<input value=", "<input value=".length),
      null,
    );
    assert.deepStrictEqual(
      inferLitsxMarkupCompletionContext("<input {...props}", "<input {...props}".length),
      null,
    );
  });

  it("infers emitted component events across declaration forms", () => {
    const source = [
      "function NamedCard() {",
      "  const emit = useEmit();",
      "  emit('named-ready');",
      "  return <button />;",
      "}",
      "const ArrowCard = () => {",
      "  const send = useEmit();",
      "  send('arrow-ready');",
      "  send(dynamicName);",
      "  return <button />;",
      "};",
      "const FunctionCard = function LocalCard() {",
      "  const publish = useEmit();",
      "  publish('function-ready');",
      "  return <button />;",
      "};",
      "let AssignedCard;",
      "AssignedCard = () => {",
      "  const dispatch = useEmit();",
      "  dispatch('assigned-ready');",
      "  return <button />;",
      "};",
      "const PlainCard = () => <button />;",
      "",
    ].join("\n");

    assert.deepStrictEqual(
      inferLitsxComponentEventNames(source),
      {
        AssignedCard: ["assigned-ready"],
        ArrowCard: ["arrow-ready"],
        LocalCard: ["function-ready"],
        NamedCard: ["named-ready"],
      },
    );
    assert.deepStrictEqual(inferLitsxComponentEventNames("<button"), {});
  });

  it("infers static component props across authored and virtual hoist forms", () => {
    const source = [
      "function NamedCard() {",
      "  __litsx_static_properties({ foo: {}, 'bar-baz': {}, [dynamicName]: {} });",
      "  return <button />;",
      "}",
      "const ArrowCard = () => {",
      "  __litsx_static_properties({ alpha: {}, 'beta-gamma': {} });",
      "  return <button />;",
      "};",
      "let AssignedCard;",
      "AssignedCard = () => {",
      "  __litsx_static_properties({ assigned: {} });",
      "  return <button />;",
      "};",
      "const PlainCard = () => <button />;",
      "",
    ].join("\n");

    assert.deepStrictEqual(
      inferLitsxComponentPropNames(source),
      {
        AssignedCard: ["assigned"],
        ArrowCard: ["alpha", "beta-gamma"],
        NamedCard: ["bar-baz", "dynamicName", "foo"],
      },
    );
    assert.deepStrictEqual(inferLitsxComponentPropNames("<button"), {});
  });

  it("maps spans between authored and virtualized sources", () => {
    const source = '<button @click={fn} .value={value} ?disabled={busy} />';
    const result = createVirtualLitsxJsxSource(source);
    const eventStart = source.indexOf("@click");
    const boolStart = source.indexOf("?disabled");

    const virtualEventStart = mapOriginalPositionToVirtual(eventStart, result.replacements);
    const remappedBoolSpan = remapTextSpanToOriginal(
      {
        start: result.code.indexOf("__litsx_bool_disabled"),
        length: "__litsx_bool_disabled".length,
      },
      result.replacements,
    );

    assert.strictEqual(
      virtualEventStart,
      result.code.indexOf("__litsx_event_click"),
    );
    assert.strictEqual(remappedBoolSpan.start, boolStart);
    assert.strictEqual(remappedBoolSpan.length, "?disabled".length);
  });

  it("maps authored positions through tooling preambles and remaps tooling spans back", () => {
    const source = `
      function Card() {
        static styles = \`:host { display: block; }\`;
        return <button @click={handleClick}>{label}</button>;
      }
    `;
    const result = createToolingVirtualLitsxSource(source, {
      plugins: ["typescript"],
    });
    const eventStart = source.indexOf("@click");
    const toolingEventStart = mapOriginalPositionToToolingVirtual(eventStart, result);

    assert.ok(result.toolingPreambleLength > 0);
    assert.ok(toolingEventStart > eventStart);
    assert.deepStrictEqual(
      remapToolingTextSpanToOriginal(
        { start: toolingEventStart, length: "__litsx_event_click".length },
        result,
      ),
      { start: eventStart, length: "@click".length },
    );
    assert.equal(remapToolingTextSpanToOriginal(null, result), null);
  });

  it("maps authored positions through tooling virtual sources without a preamble length", () => {
    const source = '<button @click={handleClick}>{label}</button>';
    const virtualization = createVirtualLitsxJsxSource(source);
    const eventStart = source.indexOf("@click");

    assert.strictEqual(
      mapOriginalPositionToToolingVirtual(eventStart, virtualization),
      mapOriginalPositionToVirtual(eventStart, virtualization.replacements),
    );
  });

  it("remaps tooling spans when start and length are omitted", () => {
    const source = `
      function Card() {
        static styles = \`:host { display: block; }\`;
        return <button @click={handleClick}>{label}</button>;
      }
    `;
    const result = createToolingVirtualLitsxSource(source, {
      plugins: ["typescript"],
    });

    assert.deepStrictEqual(
      remapToolingTextSpanToOriginal({}, result),
      { start: 0, length: 0 },
    );
  });

  it("remaps tooling spans without a preamble length", () => {
    const virtualization = createVirtualLitsxJsxSource('<button @click={handleClick} />');

    assert.deepStrictEqual(
      remapToolingTextSpanToOriginal({}, virtualization),
      { start: 0, length: 0 },
    );
  });

  it("reports authored syntax diagnostics for parse failures", () => {
    const parseFailureDiagnostics = collectLitsxAuthoredDiagnostics(
      "<button @click={></button>",
      {
        DiagnosticCategory: {
          Error: 1,
        },
      },
      {
        plugins: ["typescript"],
      },
    );

    assert.strictEqual(parseFailureDiagnostics.length, 1);
    assert.strictEqual(parseFailureDiagnostics[0].code, 91000);
    assert.match(parseFailureDiagnostics[0].messageText, /LitSX syntax could not be parsed/);
  });

  it("falls back when parser errors omit position and message text", () => {
    const parseSpy = vi.spyOn(babelParser, "parse").mockImplementation(() => {
      throw {};
    });

    try {
      const issues = collectLitsxAuthoredIssues("const value = true;");
      assert.strictEqual(issues.length, 1);
      assert.strictEqual(issues[0].code, 91000);
      assert.strictEqual(issues[0].start, 0);
      assert.match(issues[0].message, /Unexpected syntax/);
    } finally {
      parseSpy.mockRestore();
    }
  });

  it("handles parser ASTs rooted at the program node and hoists with callee fallback spans", () => {
    const parseSpy = vi.spyOn(babelParser, "parse").mockReturnValue({
      type: "Program",
      body: [
        {
          type: "FunctionDeclaration",
          body: {
            type: "BlockStatement",
            body: [
              {
                type: "IfStatement",
                consequent: {
                  type: "BlockStatement",
                  body: [
                    {
                      type: "ExpressionStatement",
                      expression: {
                        type: "CallExpression",
                        start: 3,
                        end: 15,
                        callee: {
                          type: "Identifier",
                          name: "__litsx_static_styles",
                        },
                      },
                    },
                  ],
                },
              },
            ],
          },
        },
      ],
    });

    try {
      const diagnostics = collectLitsxAuthoredDiagnostics("function Card() {}", {
        DiagnosticCategory: {
          Error: 1,
        },
      }, {
        plugins: ["typescript"],
      });

      assert.strictEqual(diagnostics.length, 1);
      assert.strictEqual(diagnostics[0].code, 91007);
    } finally {
      parseSpy.mockRestore();
    }
  });

  it("falls back to zero when hoist call spans omit both callee and node positions", () => {
    const parseSpy = vi.spyOn(babelParser, "parse").mockReturnValue({
      type: "Program",
      body: [
        {
          type: "FunctionDeclaration",
          body: {
            type: "BlockStatement",
            body: [
              {
                type: "IfStatement",
                consequent: {
                  type: "BlockStatement",
                  body: [
                    {
                      type: "ExpressionStatement",
                      expression: {
                        type: "CallExpression",
                        callee: {
                          type: "Identifier",
                          name: "__litsx_static_styles",
                        },
                      },
                    },
                  ],
                },
              },
            ],
          },
        },
      ],
    });

    try {
      const diagnostics = collectLitsxAuthoredDiagnostics("function Card() {}", {
        DiagnosticCategory: {
          Error: 1,
        },
      }, {
        plugins: ["typescript"],
      });

      assert.strictEqual(diagnostics.length, 1);
      assert.strictEqual(diagnostics[0].code, 91007);
      assert.strictEqual(diagnostics[0].start, 0);
    } finally {
      parseSpy.mockRestore();
    }
  });

  it("does not warn about className on non-native component tags", () => {
    const diagnostics = collectLitsxAuthoredDiagnostics(
      "<FancyButton className=\"cta\" />",
      {
        DiagnosticCategory: {
          Warning: 0,
          Error: 1,
        },
      },
      {
        plugins: ["typescript"],
      },
    );

    assert.deepStrictEqual(diagnostics, []);
  });

  it("does not warn about className on member-expression component tags", () => {
    const memberDiagnostics = collectLitsxAuthoredDiagnostics(
      "<UI.Button className=\"cta\" />",
      {
        DiagnosticCategory: {
          Warning: 0,
          Error: 1,
        },
      },
      {
        plugins: ["typescript"],
      },
    );
    assert.deepStrictEqual(memberDiagnostics, []);
  });

  it("warns about className on namespaced intrinsic tags", () => {
    const diagnostics = collectLitsxAuthoredDiagnostics(
      "<svg:path className=\"cta\" />",
      {
        DiagnosticCategory: {
          Warning: 0,
          Error: 1,
        },
      },
      {
        plugins: ["typescript"],
      },
    );

    assert.strictEqual(diagnostics.length, 1);
    assert.strictEqual(diagnostics[0].code, 91008);
  });

  it("falls back to attribute spans when JSX attribute names omit start and end positions", () => {
    const parseSpy = vi.spyOn(babelParser, "parse").mockReturnValue({
      type: "File",
      program: {
        type: "Program",
        body: [
          {
            type: "ExpressionStatement",
            expression: {
              type: "JSXElement",
              openingElement: {
                type: "JSXOpeningElement",
                name: {
                  type: "JSXIdentifier",
                  name: "button",
                },
                attributes: [
                  {
                    type: "JSXAttribute",
                    start: 8,
                    end: 17,
                    name: {
                      type: "JSXIdentifier",
                      name: "className",
                    },
                    value: {
                      type: "StringLiteral",
                      value: "cta",
                    },
                  },
                ],
              },
            },
          },
        ],
      },
    });

    try {
      const diagnostics = collectLitsxAuthoredDiagnostics("<button className=\"cta\" />", {
        DiagnosticCategory: {
          Warning: 0,
          Error: 1,
        },
      }, {
        plugins: ["typescript"],
      });

      assert.strictEqual(diagnostics.length, 1);
      assert.strictEqual(diagnostics[0].code, 91008);
      assert.strictEqual(typeof diagnostics[0].start, "number");
      assert.strictEqual(typeof diagnostics[0].length, "number");
    } finally {
      parseSpy.mockRestore();
    }
  });

  it("falls back to zero when JSX attributes omit all authored span positions", () => {
    const parseSpy = vi.spyOn(babelParser, "parse").mockReturnValue({
      type: "File",
      program: {
        type: "Program",
        body: [
          {
            type: "ExpressionStatement",
            expression: {
              type: "JSXElement",
              openingElement: {
                type: "JSXOpeningElement",
                name: {
                  type: "JSXIdentifier",
                  name: "button",
                },
                attributes: [
                  {
                    type: "JSXAttribute",
                    name: {
                      type: "JSXIdentifier",
                      name: "className",
                    },
                    value: {
                      type: "StringLiteral",
                      value: "cta",
                    },
                  },
                ],
              },
            },
          },
        ],
      },
    });

    try {
      const diagnostics = collectLitsxAuthoredDiagnostics("<button className=\"cta\" />", {
        DiagnosticCategory: {
          Warning: 0,
          Error: 1,
        },
      }, {
        plugins: ["typescript"],
      });

      assert.strictEqual(diagnostics.length, 1);
      assert.strictEqual(diagnostics[0].code, 91008);
      assert.strictEqual(diagnostics[0].start, 0);
      assert.strictEqual(diagnostics[0].length, 0);
    } finally {
      parseSpy.mockRestore();
    }
  });

  it("tolerates member-expression JSX tags without a property name", () => {
    const parseSpy = vi.spyOn(babelParser, "parse").mockReturnValue({
      type: "File",
      program: {
        type: "Program",
        body: [
          {
            type: "ExpressionStatement",
            expression: {
              type: "JSXElement",
              openingElement: {
                type: "JSXOpeningElement",
                name: {
                  type: "JSXMemberExpression",
                  object: {
                    type: "JSXIdentifier",
                    name: "UI",
                  },
                  property: null,
                },
                attributes: [
                  {
                    type: "JSXAttribute",
                    start: 4,
                    end: 13,
                    name: {
                      type: "JSXIdentifier",
                      name: "className",
                    },
                    value: {
                      type: "StringLiteral",
                      value: "cta",
                    },
                  },
                ],
              },
            },
          },
        ],
      },
    });

    try {
      const diagnostics = collectLitsxAuthoredDiagnostics("<UI.Button className=\"cta\" />", {
        DiagnosticCategory: {
          Warning: 0,
          Error: 1,
        },
      }, {
        plugins: ["typescript"],
      });

      assert.deepStrictEqual(diagnostics, []);
    } finally {
      parseSpy.mockRestore();
    }
  });

  it("reports authored diagnostics for mocked empty JSX expressions", () => {
    const parseSpy = vi.spyOn(babelParser, "parse").mockReturnValue({
      type: "File",
      program: {
        type: "Program",
        body: [
          {
            type: "ExpressionStatement",
            expression: {
              type: "JSXElement",
              openingElement: {
                type: "JSXOpeningElement",
                name: {
                  type: "JSXIdentifier",
                  name: "button",
                },
                attributes: [
                  {
                    type: "JSXAttribute",
                    start: 8,
                    end: 14,
                    name: {
                      type: "JSXIdentifier",
                      name: "__litsx_event_click",
                    },
                    value: {
                      type: "JSXExpressionContainer",
                      expression: {
                        type: "JSXEmptyExpression",
                      },
                    },
                  },
                ],
              },
            },
          },
        ],
      },
    });

    try {
      const diagnostics = collectLitsxAuthoredDiagnostics("<button @click={} />", {
        DiagnosticCategory: {
          Warning: 0,
          Error: 1,
        },
      }, {
        plugins: ["typescript"],
      });

      assert.strictEqual(diagnostics.length, 1);
      assert.strictEqual(diagnostics[0].code, 91003);
    } finally {
      parseSpy.mockRestore();
    }
  });

  it("handles mocked AST branches for function expressions, namespaced tags, and duplicate singleton hoists", () => {
    const parseSpy = vi.spyOn(babelParser, "parse").mockReturnValue({
      type: "File",
      program: {
        type: "Program",
        body: [
          {
            type: "ExpressionStatement",
            expression: {
              type: "AssignmentExpression",
              left: {
                type: "Identifier",
                name: "AssignedCard",
              },
              right: {
                type: "FunctionExpression",
                id: {
                  type: "Identifier",
                  name: "AssignedCard",
                },
                params: [
                  {
                    type: "Identifier",
                    name: "props",
                    start: 10,
                    end: 15,
                  },
                ],
                body: {
                  type: "BlockStatement",
                  body: [
                    {
                      type: "ExpressionStatement",
                      expression: {
                        type: "Identifier",
                        name: "runtime",
                      },
                    },
                    {
                      type: "ExpressionStatement",
                      expression: {
                        type: "CallExpression",
                        start: 20,
                        end: 35,
                        callee: {
                          type: "Identifier",
                          name: "__litsx_static_lightDom",
                        },
                      },
                    },
                    {
                      type: "ExpressionStatement",
                      expression: {
                        type: "MemberExpression",
                        object: {
                          type: "Identifier",
                          name: "props",
                        },
                        property: {
                          type: "Identifier",
                          name: "title",
                        },
                        computed: false,
                        start: 40,
                        end: 51,
                      },
                    },
                    {
                      type: "ExpressionStatement",
                      expression: {
                        type: "CallExpression",
                        start: 60,
                        end: 75,
                        callee: {
                          type: "Identifier",
                          name: "__litsx_static_styles",
                        },
                      },
                    },
                    {
                      type: "ExpressionStatement",
                      expression: {
                        type: "CallExpression",
                        start: 80,
                        end: 95,
                        callee: {
                          type: "Identifier",
                          name: "__litsx_static_styles",
                        },
                      },
                    },
                    {
                      type: "ExpressionStatement",
                      expression: {
                        type: "JSXElement",
                        openingElement: {
                          type: "JSXOpeningElement",
                          name: {
                            type: "JSXNamespacedName",
                            namespace: {
                              type: "JSXIdentifier",
                              name: "svg",
                            },
                            name: {
                              type: "JSXIdentifier",
                              name: "path",
                            },
                          },
                          attributes: [
                            {
                              type: "JSXAttribute",
                              start: 100,
                              end: 108,
                              name: {
                                type: "JSXIdentifier",
                                name: "className",
                              },
                              value: {
                                type: "StringLiteral",
                                value: "cta",
                              },
                            },
                          ],
                        },
                      },
                    },
                  ],
                },
              },
            },
          },
        ],
      },
    });

    try {
      const issues = collectLitsxAuthoredIssues("const mock = true;", {
        channel: "all",
        plugins: ["typescript"],
      });

      assert.ok(issues.some((issue) => issue.code === 91008));
      assert.ok(issues.some((issue) => issue.code === 91009));
      assert.ok(issues.some((issue) => issue.code === 91014));
      assert.ok(issues.some((issue) => issue.code === 91015));
      assert.ok(issues.some((issue) => issue.code === 91018));
    } finally {
      parseSpy.mockRestore();
    }
  });

  it("covers unknown static hoists and binding warnings without suggestions in mocked ASTs", () => {
    const parseSpy = vi.spyOn(babelParser, "parse").mockReturnValue({
      type: "File",
      program: {
        type: "Program",
        body: [
          {
            type: "FunctionDeclaration",
            id: {
              type: "Identifier",
              name: "Card",
            },
            params: [
              {
                type: "Identifier",
                name: "props",
                start: 5,
                end: 10,
              },
            ],
            body: {
              type: "BlockStatement",
              body: [
                {
                  type: "ExpressionStatement",
                  expression: {
                    type: "Identifier",
                    name: "runtime",
                  },
                },
                {
                  type: "ExpressionStatement",
                  expression: {
                    type: "CallExpression",
                    start: 12,
                    end: 24,
                    callee: {
                      type: "Identifier",
                      name: "__litsx_static_customThing",
                    },
                  },
                },
                {
                  type: "ExpressionStatement",
                  expression: {
                    type: "CallExpression",
                    start: 26,
                    end: 38,
                    callee: {
                      type: "Identifier",
                      name: "__litsx_static_customThing",
                    },
                  },
                },
                {
                  type: "ExpressionStatement",
                  expression: {
                    type: "MemberExpression",
                    object: {
                      type: "Identifier",
                      name: "props",
                    },
                    property: {
                      type: "Identifier",
                      name: "title",
                    },
                    computed: false,
                    start: 40,
                    end: 51,
                  },
                },
                {
                  type: "ExpressionStatement",
                  expression: {
                    type: "JSXElement",
                    openingElement: {
                      type: "JSXOpeningElement",
                      name: {
                        type: "JSXIdentifier",
                        name: "input",
                      },
                      attributes: [
                        [],
                        {
                          type: "JSXAttribute",
                          start: 60,
                          end: 79,
                          name: {
                            type: "JSXIdentifier",
                            name: "__litsx_event_somethingwild",
                          },
                          value: {
                            type: "JSXExpressionContainer",
                            expression: {
                              type: "Identifier",
                              name: "handler",
                            },
                          },
                        },
                        {
                          type: "JSXAttribute",
                          start: 80,
                          end: 106,
                          name: {
                            type: "JSXIdentifier",
                            name: "__litsx_prop_superunknownprop",
                          },
                          value: {
                            type: "JSXExpressionContainer",
                            expression: {
                              type: "Identifier",
                              name: "value",
                            },
                          },
                        },
                        {
                          type: "JSXAttribute",
                          start: 107,
                          end: 123,
                          name: {
                            type: "JSXIdentifier",
                            name: "__litsx_bool_totallyoff",
                          },
                        },
                      ],
                    },
                  },
                },
              ],
            },
          },
        ],
      },
    });

    try {
      const issues = collectLitsxAuthoredIssues("const mock = true;", {
        channel: "all",
        plugins: ["typescript"],
      });

      assert.ok(issues.some((issue) => issue.code === 91014));
      assert.ok(issues.some((issue) => issue.code === 91015 && /static customThing/.test(issue.message)));
      assert.ok(issues.some((issue) => issue.code === 91018));
      assert.ok(issues.some((issue) => issue.code === 91006 && !/Did you mean/.test(issue.message)));
      assert.ok(issues.some((issue) => issue.code === 91004 && !/Did you mean/.test(issue.message)));
      assert.ok(issues.some((issue) => issue.code === 91005 && !/Did you mean/.test(issue.message)));
      assert.ok(!issues.some((issue) => issue.code === 91009));
    } finally {
      parseSpy.mockRestore();
    }
  });

  it("handles mocked AST branches for PascalCase declarations, empty authored binding names, and imported memo aliases", () => {
    const parseSpy = vi.spyOn(babelParser, "parse").mockReturnValue({
      type: "File",
      program: {
        type: "Program",
        body: [
          {
            type: "ImportDeclaration",
            source: { value: "react" },
            specifiers: [
              {
                type: "ImportSpecifier",
                imported: { type: "Identifier", name: "memo" },
                local: { type: "Identifier", name: "memoAlias" },
              },
            ],
          },
          {
            type: "FunctionDeclaration",
            id: { type: "Identifier", name: "Card" },
            params: [{ type: "Identifier", name: "props", start: 1, end: 6 }],
            body: {
              type: "BlockStatement",
              body: [
                {
                  type: "ExpressionStatement",
                  expression: {
                    type: "MemberExpression",
                    object: { type: "Identifier", name: "props" },
                    property: { type: "Identifier", name: "title" },
                    computed: false,
                    start: 10,
                    end: 21,
                  },
                },
                {
                  type: "ExpressionStatement",
                  expression: {
                    type: "CallExpression",
                    start: 24,
                    end: 36,
                    callee: { type: "Identifier", name: "__litsx_static_customThing" },
                  },
                },
                {
                  type: "ExpressionStatement",
                  expression: {
                    type: "JSXElement",
                    openingElement: {
                      type: "JSXOpeningElement",
                      name: { type: "JSXIdentifier", name: "input" },
                      attributes: [
                        {
                          type: "JSXAttribute",
                          start: 40,
                          end: 64,
                          name: { type: "JSXIdentifier", name: "__litsx_event_somethingwild" },
                          value: {
                            type: "JSXExpressionContainer",
                            expression: { type: "Identifier", name: "handler" },
                          },
                        },
                        {
                          type: "JSXAttribute",
                          start: 65,
                          end: 92,
                          name: { type: "JSXIdentifier", name: "__litsx_prop_superunknownprop" },
                          value: {
                            type: "JSXExpressionContainer",
                            expression: { type: "Identifier", name: "value" },
                          },
                        },
                        {
                          type: "JSXAttribute",
                          start: 93,
                          end: 117,
                          name: { type: "JSXIdentifier", name: "__litsx_bool_totallyoff" },
                        },
                      ],
                    },
                  },
                },
              ],
            },
          },
          {
            type: "ExpressionStatement",
            expression: {
              type: "CallExpression",
              start: 90,
              end: 104,
              callee: { type: "Identifier", name: "memoAlias" },
              arguments: [{ type: "Identifier", name: "Card" }],
            },
          },
          {
            type: "ExpressionStatement",
            expression: {
              type: "AssignmentExpression",
              left: {
                type: "MemberExpression",
                object: { type: "Identifier", name: "controls" },
                property: { type: "Identifier", name: "Card" },
              },
              right: {
                type: "ArrowFunctionExpression",
                params: [{ type: "Identifier", name: "props" }],
                body: {
                  type: "MemberExpression",
                  object: { type: "Identifier", name: "props" },
                  property: { type: "Identifier", name: "label" },
                  computed: false,
                },
              },
            },
          },
        ],
      },
    });

    try {
      const issues = collectLitsxAuthoredIssues("const mock = true;", {
        channel: "all",
        plugins: ["typescript"],
      });

      assert.strictEqual(issues.filter((issue) => issue.code === 91014).length, 1);
      assert.strictEqual(issues.filter((issue) => issue.code === 91018).length, 1);
      assert.ok(issues.some((issue) => issue.code === 91015 && /static customThing/.test(issue.message)));
      assert.ok(issues.some((issue) => issue.code === 91016));
      assert.ok(issues.some((issue) => issue.code === 91006 && !/Did you mean/.test(issue.message)));
      assert.ok(issues.some((issue) => issue.code === 91004 && !/Did you mean/.test(issue.message)));
      assert.ok(issues.some((issue) => issue.code === 91005 && !/Did you mean/.test(issue.message)));
    } finally {
      parseSpy.mockRestore();
    }
  });

  it("skips react-compat warnings for uppercase JSX identifiers in mocked ASTs", () => {
    const parseSpy = vi.spyOn(babelParser, "parse").mockReturnValue({
      type: "File",
      program: {
        type: "Program",
        body: [
          {
            type: "ExpressionStatement",
            expression: {
              type: "JSXElement",
              openingElement: {
                type: "JSXOpeningElement",
                name: {
                  type: "JSXIdentifier",
                  name: "Button",
                },
                attributes: [
                  {
                    type: "JSXAttribute",
                    start: 8,
                    end: 24,
                    name: {
                      type: "JSXIdentifier",
                      name: "defaultValue",
                    },
                    value: {
                      type: "StringLiteral",
                      value: "cta",
                    },
                  },
                ],
              },
            },
          },
        ],
      },
    });

    try {
      assert.deepStrictEqual(
        collectLitsxAuthoredDiagnostics("<Button defaultValue=\"cta\" />", {
          DiagnosticCategory: {
            Warning: 0,
            Error: 1,
          },
        }, {
          plugins: ["typescript"],
        }),
        [],
      );
    } finally {
      parseSpy.mockRestore();
    }
  });

  it("exports a standard tsserver plugin factory", () => {
    const pluginModule = plugin({
      typescript: {
        ScriptSnapshot: {
          fromString(value) {
            return {
              getLength() {
                return value.length;
              },
              getText(start, end) {
                return value.slice(start, end);
              },
            };
          },
        },
      },
    });

    assert.equal(typeof pluginModule.create, "function");
    assert.equal(typeof pluginModule.getExternalFiles, "function");
  });

  it("returns the original language service when the host cannot provide snapshots", () => {
    const pluginModule = plugin({
      typescript: {
        ScriptSnapshot: {
          fromString(value) {
            return value;
          },
        },
      },
    });
    const languageService = { marker: "original" };

    assert.strictEqual(
      pluginModule.create({
        languageServiceHost: {},
        languageService,
      }),
      languageService,
    );
  });

  it("typechecks a LitSX-authored JSX project end-to-end", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "litsx-typecheck-valid-"));
    const tsconfigPath = path.join(tempDir, "tsconfig.json");
    const filePath = path.join(tempDir, "index.jsx");
    const globalsPath = path.join(tempDir, "global.d.ts");
    const originalCwd = process.cwd();
    const originalWrite = process.stderr.write;
    const repoRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
    const coreRuntimePath = path.join(repoRoot, "packages/core/src/index.js").replaceAll("\\", "/");

    fs.writeFileSync(
      tsconfigPath,
      JSON.stringify({
        compilerOptions: {
          jsx: "preserve",
          allowJs: true,
          checkJs: true,
          noEmit: true,
        },
        include: ["index.jsx", "global.d.ts"],
      }),
    );
    fs.writeFileSync(globalsPath, TEMP_JSX_GLOBALS_DTS);
    fs.writeFileSync(
      filePath,
      `
        const handleClick = () => {};
        const value = 1;
        const busy = false;
        const view = <button @click={handleClick} .value={value} ?disabled={busy}>Save</button>;
      `,
    );

    process.stderr.write = () => true;

    try {
      process.chdir(tempDir);
      assert.equal(runLitsxTypecheck([]), 0);
    } finally {
      process.chdir(originalCwd);
      process.stderr.write = originalWrite;
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  }, 20_000);

  it("typechecks a LitSX-authored .litsx project end-to-end", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "litsx-typecheck-valid-litsx-"));
    const tsconfigPath = path.join(tempDir, "tsconfig.json");
    const filePath = path.join(tempDir, "index.litsx");
    const globalsPath = path.join(tempDir, "global.d.ts");
    const originalCwd = process.cwd();
    const originalWrite = process.stderr.write;

    fs.writeFileSync(
      tsconfigPath,
      JSON.stringify({
        compilerOptions: {
          jsx: "preserve",
          allowJs: true,
          allowArbitraryExtensions: true,
          checkJs: true,
          noEmit: true,
        },
        include: ["index.litsx", "global.d.ts"],
      }),
    );
    fs.writeFileSync(globalsPath, TEMP_JSX_GLOBALS_DTS);
    fs.writeFileSync(
      filePath,
      `
        const handleClick = () => {};
        const value = 1;
        const busy = false;
        export const view = ({ label }: { label: string }) => <button @click={handleClick} .value={value} ?disabled={busy}>{label}</button>;
      `,
    );

    process.stderr.write = () => true;

    try {
      process.chdir(tempDir);
      assert.equal(runLitsxTypecheck([]), 0);
    } finally {
      process.chdir(originalCwd);
      process.stderr.write = originalWrite;
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  }, 20_000);

  it("typechecks authored LitSX bindings on PascalCase components", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "litsx-typecheck-component-bindings-"));
    const tsconfigPath = path.join(tempDir, "tsconfig.json");
    const filePath = path.join(tempDir, "index.litsx");
    const originalCwd = process.cwd();
    const originalWrite = process.stderr.write;

    fs.symlinkSync(path.resolve("node_modules"), path.join(tempDir, "node_modules"), "dir");
    fs.writeFileSync(
      tsconfigPath,
      JSON.stringify({
        compilerOptions: {
          jsx: "react-jsx",
          jsxImportSource: "@litsx/core",
          allowArbitraryExtensions: true,
          noEmit: true,
          strict: true,
          module: "ESNext",
          moduleResolution: "Bundler",
          target: "ESNext",
          skipLibCheck: true,
        },
        include: ["index.litsx"],
      }),
    );
    fs.writeFileSync(
      filePath,
      `
        import type { LitsxRenderable } from "@litsx/core";

        type Product = { id: string };

        const product: Product = { id: "sku-1" };
        const checked = true;
        const cardRef = (value: unknown) => {};

        const VdsProductCard = ({
          children,
        }: {
          product?: Product;
          checked?: boolean;
          children?: LitsxRenderable;
        }) => <article>{children}</article>;

        export const view = (
          <VdsProductCard
            .product={product}
            @click={(event) => event?.preventDefault()}
            ?checked={checked}
            slot="content"
            ref={cardRef}
            class="card"
            style={{ color: "red" }}
            part="surface"
            data-kind="product"
            aria-label="Product"
          >
            Buy
          </VdsProductCard>
        );
      `,
    );

    process.stderr.write = () => true;

    try {
      process.chdir(tempDir);
      assert.equal(runLitsxTypecheck([]), 0);
    } finally {
      process.chdir(originalCwd);
      process.stderr.write = originalWrite;
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  }, 20_000);

  it("resolves named exports from .litsx modules without manual ambient module declarations", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "litsx-typecheck-module-resolution-"));
    const srcDir = path.join(tempDir, "src");
    const tsconfigPath = path.join(tempDir, "jsconfig.json");
    const globalsPath = path.join(tempDir, "global.d.ts");
    const buttonPath = path.join(srcDir, "vds-button.litsx");
    const panelPath = path.join(srcDir, "vds-product-purchase-panel.litsx");
    const storyPath = path.join(srcDir, "vds-product-purchase-panel.stories.tsx");
    const originalCwd = process.cwd();
    const originalWrite = process.stderr.write;

    fs.mkdirSync(srcDir, { recursive: true });
    fs.writeFileSync(
      tsconfigPath,
      JSON.stringify({
        compilerOptions: {
          jsx: "preserve",
          allowJs: true,
          allowArbitraryExtensions: true,
          checkJs: true,
          noEmit: true,
        },
        include: ["src/**/*", "global.d.ts"],
      }),
    );
    fs.writeFileSync(globalsPath, TEMP_JSX_GLOBALS_DTS);
    fs.writeFileSync(
      buttonPath,
      [
        "export type VdsButtonProps = { label: string };",
        "export const VdsButton = ({ label }: VdsButtonProps) => <button>{label}</button>;",
        "",
      ].join("\n"),
    );
    fs.writeFileSync(
      panelPath,
      [
        'import { VdsButton } from "./vds-button.litsx";',
        "export type VdsProductPurchasePanelProps = { ctaLabel: string };",
        "export const VdsProductPurchasePanel = ({ ctaLabel }: VdsProductPurchasePanelProps) => (",
        "  <section>",
        "    <VdsButton label={ctaLabel} />",
        "  </section>",
        ");",
        "",
      ].join("\n"),
    );
    fs.writeFileSync(
      storyPath,
      [
        'import { VdsButton } from "./vds-button.litsx";',
        'import { VdsProductPurchasePanel } from "./vds-product-purchase-panel.litsx";',
        "",
        "const button = <VdsButton label=\"Buy\" />;",
        "const panel = <VdsProductPurchasePanel ctaLabel=\"Add to cart\" />;",
        "// @ts-expect-error .litsx named exports must not resolve as any",
        "const typedAsNumber: number = VdsButton;",
        "",
      ].join("\n"),
    );

    process.stderr.write = () => true;

    try {
      process.chdir(tempDir);
      assert.equal(runLitsxTypecheck(["-p", "jsconfig.json", "--noEmit"]), 0);
    } finally {
      process.chdir(originalCwd);
      process.stderr.write = originalWrite;
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  }, 20_000);

  it("typechecks structural hooks imported between .litsx modules without ambient declarations", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "litsx-typecheck-structural-hooks-"));
    const srcDir = path.join(tempDir, "src");
    const tsconfigPath = path.join(tempDir, "jsconfig.json");
    const globalsPath = path.join(tempDir, "global.d.ts");
    const hooksPath = path.join(srcDir, "hooks.litsx");
    const componentPath = path.join(srcDir, "card.litsx");
    const corePackageDir = path.join(tempDir, "node_modules", "@litsx", "core");
    const originalCwd = process.cwd();
    const originalWrite = process.stderr.write;
    const repoRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
    const coreTypesPath = path.join(repoRoot, "packages/core/src/index.d.ts").replaceAll("\\", "/");
    let stderrOutput = "";

    fs.mkdirSync(srcDir, { recursive: true });
    fs.mkdirSync(corePackageDir, { recursive: true });
    fs.writeFileSync(
      path.join(corePackageDir, "package.json"),
      JSON.stringify({
        name: "@litsx/core",
        type: "module",
        types: coreTypesPath,
      }),
    );
    fs.writeFileSync(
      tsconfigPath,
      JSON.stringify({
        compilerOptions: {
          jsx: "preserve",
          moduleResolution: "bundler",
          allowJs: true,
          allowArbitraryExtensions: true,
          checkJs: true,
          noEmit: true,
          baseUrl: ".",
          ignoreDeprecations: "6.0",
          paths: {
            "@/*": ["src/*"],
          },
        },
        include: ["src/**/*", "global.d.ts"],
      }),
    );
    fs.writeFileSync(globalsPath, TEMP_JSX_GLOBALS_DTS);
    fs.writeFileSync(
      hooksPath,
      [
        'import { defineHook } from "@litsx/core";',
        "",
        "export const useLocale = defineHook<[locale: string], string, undefined, { initial: string }>({",
        "  setup(locale) {",
        "    return { initial: locale };",
        "  },",
        "  use(locale, state) {",
        "    return `${state.instance.initial}:${locale}`;",
        "  },",
        "});",
        "",
        "export function useMessage(name: string) {",
        "  return useLocale(name);",
        "}",
        "",
      ].join("\n"),
    );
    fs.writeFileSync(
      componentPath,
      [
        'import { useLocale, useMessage } from "./hooks.litsx";',
        "",
        "export function Card({ locale }: { locale: string }) {",
        "  const direct = useLocale(locale);",
        "  const nested = useMessage(locale);",
        "  const directText: string = direct;",
        "  const nestedText: string = nested;",
        "  return <section>{directText}{nestedText}</section>;",
        "}",
        "",
      ].join("\n"),
    );

    process.stderr.write = (chunk) => {
      stderrOutput += String(chunk);
      return true;
    };

    try {
      process.chdir(tempDir);
      assert.equal(runLitsxTypecheck(["-p", "jsconfig.json", "--noEmit"]), 0, stderrOutput);
    } finally {
      process.chdir(originalCwd);
      process.stderr.write = originalWrite;
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  }, 20_000);

  it("typechecks authored local story hosts rendered with natural JSX props", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "litsx-typecheck-story-host-"));
    const srcDir = path.join(tempDir, "src");
    const tsconfigPath = path.join(tempDir, "jsconfig.json");
    const globalsPath = path.join(tempDir, "global.d.ts");
    const storyPath = path.join(srcDir, "vds-drawer.stories.litsx");
    const originalCwd = process.cwd();
    const originalWrite = process.stderr.write;

    fs.mkdirSync(srcDir, { recursive: true });
    fs.writeFileSync(
      tsconfigPath,
      JSON.stringify({
        compilerOptions: {
          jsx: "preserve",
          allowJs: true,
          allowArbitraryExtensions: true,
          checkJs: true,
          noEmit: true,
        },
        include: ["src/**/*", "global.d.ts"],
      }),
    );
    fs.writeFileSync(globalsPath, TEMP_JSX_GLOBALS_DTS);
    fs.writeFileSync(
      storyPath,
      [
        "type VdsDrawerStoryProps = {",
        "  defaultOpen?: boolean;",
        "  heading?: string;",
        "  description?: string;",
        "};",
        "",
        "const VdsDrawerStory = ({",
        "  defaultOpen = false,",
        "  heading = \"\",",
        "  description = \"\",",
        "}: VdsDrawerStoryProps) => {",
        "  return <section>{heading}{description}{String(defaultOpen)}</section>;",
        "};",
        "",
        "export const Playground = {",
        "  render: (args: VdsDrawerStoryProps) => (",
        "    <VdsDrawerStory",
        "      defaultOpen={args.defaultOpen}",
        "      heading={args.heading}",
        "      description={args.description}",
        "    />",
        "  ),",
        "};",
        "",
      ].join("\n"),
    );

    process.stderr.write = () => true;

    try {
      process.chdir(tempDir);
      assert.equal(runLitsxTypecheck(["-p", "jsconfig.json", "--noEmit"]), 0);
    } finally {
      process.chdir(originalCwd);
      process.stderr.write = originalWrite;
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  }, 20_000);

  it("typechecks a LitSX-authored .litsx.jsx project end-to-end", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "litsx-typecheck-valid-litsx-jsx-"));
    const tsconfigPath = path.join(tempDir, "tsconfig.json");
    const filePath = path.join(tempDir, "index.litsx.jsx");
    const globalsPath = path.join(tempDir, "global.d.ts");
    const originalCwd = process.cwd();
    const originalWrite = process.stderr.write;

    fs.writeFileSync(
      tsconfigPath,
      JSON.stringify({
        compilerOptions: {
          jsx: "preserve",
          allowJs: true,
          allowArbitraryExtensions: true,
          checkJs: true,
          noEmit: true,
        },
        include: ["index.litsx.jsx", "global.d.ts"],
      }),
    );
    fs.writeFileSync(globalsPath, TEMP_JSX_GLOBALS_DTS);
    fs.writeFileSync(
      filePath,
      `
        const handleClick = () => {};
        const value = 1;
        const busy = false;
        const view = <button @click={handleClick} .value={value} ?disabled={busy}>Save</button>;
      `,
    );

    process.stderr.write = () => true;

    try {
      process.chdir(tempDir);
      assert.equal(runLitsxTypecheck([]), 0);
    } finally {
      process.chdir(originalCwd);
      process.stderr.write = originalWrite;
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  }, 20_000);

  it("typechecks jsx projects that use static hoists", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "litsx-typecheck-hoists-"));
    const tsconfigPath = path.join(tempDir, "tsconfig.json");
    const filePath = path.join(tempDir, "index.jsx");
    const globalsPath = path.join(tempDir, "global.d.ts");
    const originalCwd = process.cwd();
    const originalWrite = process.stderr.write;

    fs.writeFileSync(
      tsconfigPath,
      JSON.stringify({
        compilerOptions: {
          jsx: "preserve",
          allowJs: true,
          checkJs: true,
          noEmit: true,
        },
        include: ["index.jsx", "global.d.ts"],
      }),
    );
    fs.writeFileSync(globalsPath, TEMP_JSX_GLOBALS_DTS);
    fs.writeFileSync(
      filePath,
      `
        export const Card = ({ title = "Smoke" }) => {
          static styles = \`:host { display: block; }\`;
          return <button>{title}</button>;
        };
      `,
    );

    process.stderr.write = () => true;

    try {
      process.chdir(tempDir);
      assert.equal(runLitsxTypecheck([]), 0);
    } finally {
      process.chdir(originalCwd);
      process.stderr.write = originalWrite;
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  }, 20_000);

  it("reports missing tsconfig files through the CLI entrypoint", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "litsx-typecheck-missing-config-"));
    const originalCwd = process.cwd();
    const originalWrite = process.stderr.write;

    process.stderr.write = () => true;

    try {
      process.chdir(tempDir);
      assert.equal(runLitsxTypecheck([]), 1);
    } finally {
      process.chdir(originalCwd);
      process.stderr.write = originalWrite;
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("reports invalid tsconfig JSON through the CLI entrypoint", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "litsx-typecheck-invalid-config-"));
    const originalCwd = process.cwd();
    const originalWrite = process.stderr.write;

    fs.writeFileSync(path.join(tempDir, "tsconfig.json"), "{ invalid json");
    process.stderr.write = () => true;

    try {
      process.chdir(tempDir);
      assert.equal(runLitsxTypecheck([]), 1);
    } finally {
      process.chdir(originalCwd);
      process.stderr.write = originalWrite;
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("reports invalid CLI arguments through the CLI entrypoint", () => {
    const originalWrite = process.stderr.write;
    process.stderr.write = () => true;

    try {
      assert.equal(runLitsxTypecheck(["--definitely-not-a-real-flag"]), 1);
    } finally {
      process.stderr.write = originalWrite;
    }
  });

  it("does not write stderr for CLI errors when formatting returns an empty string", () => {
    return (async () => {
      const originalWrite = process.stderr.write;
      let writes = 0;

      process.stderr.write = () => {
        writes += 1;
        return true;
      };

      try {
        await withMockedTypeScript((tsModule) => ({
          ...tsModule,
          parseCommandLine() {
            return {
              errors: [
                {
                  category: tsModule.DiagnosticCategory.Error,
                  code: 9999,
                  messageText: "synthetic cli error",
                },
              ],
              options: {},
              fileNames: [],
            };
          },
          formatDiagnosticsWithColorAndContext() {
            return "";
          },
        }), ({ runLitsxTypecheck: mockedRunLitsxTypecheck }) => {
          assert.equal(mockedRunLitsxTypecheck(["--synthetic"]), 1);
        });
        assert.equal(writes, 0);
      } finally {
        process.stderr.write = originalWrite;
      }
    })();
  });

  it("reports real TypeScript diagnostics through the CLI entrypoint after remapping virtualized source", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "litsx-typecheck-diagnostic-"));
    const tsconfigPath = path.join(tempDir, "tsconfig.json");
    const filePath = path.join(tempDir, "index.jsx");
    const globalsPath = path.join(tempDir, "global.d.ts");
    const originalCwd = process.cwd();
    const originalWrite = process.stderr.write;
    let stderrOutput = "";

    fs.writeFileSync(
      tsconfigPath,
      JSON.stringify({
        compilerOptions: {
          jsx: "preserve",
          allowJs: true,
          checkJs: true,
          noEmit: true,
        },
        include: ["index.jsx", "global.d.ts"],
      }),
    );
    fs.writeFileSync(globalsPath, TEMP_JSX_GLOBALS_DTS);
    fs.writeFileSync(
      filePath,
      `
        const value = "text";
        /** @type {number} */
        const count = value;
        const view = <button @click={count} />;
      `,
    );

    process.stderr.write = (chunk) => {
      stderrOutput += String(chunk);
      return true;
    };

    try {
      process.chdir(tempDir);
      assert.equal(runLitsxTypecheck([]), 1);
      assert.match(stderrOutput, /Type 'string' is not assignable to type 'number'/);
      assert.doesNotMatch(stderrOutput, /__litsx_event_click/);
    } finally {
      process.chdir(originalCwd);
      process.stderr.write = originalWrite;
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  }, 20_000);

  it("remaps synthetic virtualized diagnostics and preserves non-virtual related information in the CLI entrypoint", () => {
    return (async () => {
      const originalWrite = process.stderr.write;
      const jsxFile = path.join(os.tmpdir(), "virtualized-example.jsx");
      const otherFile = path.join(os.tmpdir(), "other.ts");
      const virtualSource = `
        const handleClick = () => {};
        export const view = <button @click={handleClick}>Save</button>;
      `;
      const compilerHostReads = [];
      let formatterDiagnostics = null;
      let formatterHostSnapshot = null;
      let stderrOutput = "";
      const actualTs = await vi.importActual("typescript");

      vi.resetModules();
      vi.doMock("typescript", () => {
        const mockedTs = {
          ...actualTs.default,
          parseCommandLine() {
            return {
              errors: [],
              options: {},
              fileNames: [],
            };
          },
          findConfigFile() {
            return "/virtual/tsconfig.json";
          },
          readConfigFile() {
            return {
              config: {
                compilerOptions: {},
              },
            };
          },
          parseJsonConfigFileContent() {
            return {
              errors: [],
              options: {
                noEmit: true,
              },
              fileNames: [jsxFile],
              projectReferences: undefined,
            };
          },
          createCompilerHost() {
            return {
              readFile(fileName) {
                compilerHostReads.push(fileName);
                if (fileName === jsxFile) return virtualSource;
                if (fileName === otherFile) return "export const other = 1;";
                return undefined;
              },
              useCaseSensitiveFileNames() {
                return false;
              },
              getSourceFile(fileName) {
                return {
                  originalFileName: fileName,
                };
              },
            };
          },
          createIncrementalCompilerHost(options) {
            return mockedTs.createCompilerHost(options);
          },
          createSourceFile(fileName, sourceText) {
            return {
              fileName,
              text: sourceText,
            };
          },
          createProgram({ host }) {
            assert.equal(host.readFile("/virtual/missing.ts"), undefined);
            assert.deepStrictEqual(host.getSourceFile("/virtual/missing.ts", actualTs.default.ScriptTarget.Latest), {
              originalFileName: "/virtual/missing.ts",
              version: "",
            });
            const created = host.getSourceFile(jsxFile, actualTs.default.ScriptTarget.Latest);
            assert.ok(created.text.includes("__litsx_event_click"));
            return { mocked: true };
          },
          createIncrementalProgram(args) {
            return {
              getProgram() {
                return mockedTs.createProgram(args);
              },
            };
          },
          getPreEmitDiagnostics() {
            const virtualized = createToolingVirtualLitsxSource(virtualSource);
            const virtualEventStart = virtualized.code.indexOf("__litsx_event_click");
            return [
              {
                file: { fileName: jsxFile },
                start: virtualEventStart,
                length: undefined,
                code: 2322,
                category: actualTs.default.DiagnosticCategory.Error,
                messageText: {
                  messageText: "__litsx_event_click is invalid",
                  next: [
                    {
                      messageText: "__litsx_event_click follow-up",
                    },
                  ],
                },
                relatedInformation: [
                  {
                    start: 1,
                    messageText: "__litsx_event_click fileless info",
                  },
                  {
                    file: { fileName: otherFile },
                    start: 2,
                    length: undefined,
                    messageText: "__litsx_event_click external info",
                  },
                ],
              },
            ];
          },
          formatDiagnosticsWithColorAndContext(diagnostics, formatHost) {
            formatterDiagnostics = diagnostics;
            formatterHostSnapshot = {
              canonical: formatHost.getCanonicalFileName("FILE.TSX"),
              cwd: formatHost.getCurrentDirectory(),
              newLine: formatHost.getNewLine(),
            };
            return "synthetic diagnostic output";
          },
          sys: {
            ...actualTs.default.sys,
            useCaseSensitiveFileNames: false,
            getCurrentDirectory() {
              return "/virtual/cwd";
            },
            newLine: "\r\n",
          },
        };

        return {
          ...mockedTs,
          default: mockedTs,
        };
      });

      process.stderr.write = (chunk) => {
        stderrOutput += String(chunk);
        return true;
      };

      try {
        const { runLitsxTypecheck: mockedRunLitsxTypecheck } = await import(
          "../packages/typescript/src/typecheck.js"
        );
        assert.equal(mockedRunLitsxTypecheck([]), 1);
        assert.ok(compilerHostReads.includes(jsxFile));
        assert.ok(formatterDiagnostics);
        assert.equal(formatterDiagnostics[0].start, virtualSource.indexOf("@click"));
        assert.equal(formatterDiagnostics[0].length, "@click".length);
        assert.equal(formatterDiagnostics[0].messageText.messageText, "@click is invalid");
        assert.equal(formatterDiagnostics[0].messageText.next[0].messageText, "@click follow-up");
        assert.equal(formatterDiagnostics[0].relatedInformation[0].messageText, "@click fileless info");
        assert.equal(formatterDiagnostics[0].relatedInformation[0].start, 1);
        assert.equal(formatterDiagnostics[0].relatedInformation[1].messageText, "@click external info");
        assert.equal(formatterDiagnostics[0].relatedInformation[1].start, 2);
        assert.deepStrictEqual(formatterHostSnapshot, {
          canonical: "file.tsx",
          cwd: "/virtual/cwd",
          newLine: "\r\n",
        });
        assert.equal(stderrOutput, "synthetic diagnostic output");
      } finally {
        process.stderr.write = originalWrite;
        vi.doUnmock("typescript");
        vi.resetModules();
      }
    })();
  });

  it("reuses virtualized text within a single CLI typecheck run", () => {
    return (async () => {
      const jsxFile = path.join(os.tmpdir(), "virtualized-cache-example.jsx");
      const virtualSource = `
        const handleClick = () => {};
        export const view = <button @click={handleClick}>Save</button>;
      `;
      const actualTs = await vi.importActual("typescript");

      vi.resetModules();
      const toolingVirtualSourceModule = await import(
        "../packages/typescript/src/virtualization.js"
      );
      const virtualizationSpy = vi.spyOn(
        toolingVirtualSourceModule,
        "createToolingVirtualLitsxSource",
      );
      vi.doMock("typescript", () => {
        const mockedTs = {
          ...actualTs.default,
          parseCommandLine() {
            return {
              errors: [],
              options: {},
              fileNames: [],
            };
          },
          findConfigFile() {
            return "/virtual/tsconfig.json";
          },
          readConfigFile() {
            return {
              config: {
                compilerOptions: {},
              },
            };
          },
          parseJsonConfigFileContent() {
            return {
              errors: [],
              options: {
                noEmit: true,
              },
              fileNames: [jsxFile],
              projectReferences: undefined,
            };
          },
          createCompilerHost() {
            return {
              readFile(fileName) {
                if (fileName === jsxFile) return virtualSource;
                return undefined;
              },
              useCaseSensitiveFileNames() {
                return false;
              },
              getSourceFile(fileName) {
                return {
                  originalFileName: fileName,
                };
              },
            };
          },
          createIncrementalCompilerHost(options) {
            return mockedTs.createCompilerHost(options);
          },
          createSourceFile(fileName, sourceText) {
            return {
              fileName,
              text: sourceText,
            };
          },
          createProgram({ host }) {
            host.readFile(jsxFile);
            host.getSourceFile(jsxFile, actualTs.default.ScriptTarget.Latest);
            return { mocked: true };
          },
          createIncrementalProgram(args) {
            return {
              getProgram() {
                return mockedTs.createProgram(args);
              },
            };
          },
          getPreEmitDiagnostics() {
            return [];
          },
        };

        return {
          ...mockedTs,
          default: mockedTs,
        };
      });
      try {
        const { runLitsxTypecheck: mockedRunLitsxTypecheck } = await import(
          "../packages/typescript/src/typecheck.js"
        );
        assert.equal(mockedRunLitsxTypecheck([]), 0);
        assert.strictEqual(virtualizationSpy.mock.calls.length, 1);
      } finally {
        virtualizationSpy.mockRestore();
        vi.doUnmock("typescript");
        vi.resetModules();
      }
    })();
  });

  it("reuses the previous incremental builder program across repeated CLI typecheck runs", () => {
    return (async () => {
      const jsxFile = path.join(os.tmpdir(), "virtualized-incremental-cache-example.jsx");
      const virtualSource = `
        const handleClick = () => {};
        export const view = <button @click={handleClick}>Save</button>;
      `;
      let previousOldProgram = Symbol("unset");
      let createProgramCalls = 0;
      let createIncrementalProgramCalls = 0;

      await withMockedTypeScript((tsModule) => {
        const mockedTs = {
          ...tsModule,
          parseCommandLine() {
            return {
              errors: [],
              options: {},
              fileNames: [],
            };
          },
          findConfigFile() {
            return "/virtual/tsconfig.json";
          },
          readConfigFile() {
            return {
              config: {
                compilerOptions: {},
              },
            };
          },
          sys: {
            ...tsModule.sys,
            readFile(fileName) {
              if (fileName === "/virtual/tsconfig.json") {
                return JSON.stringify({ compilerOptions: {} });
              }
              if (fileName === jsxFile) return virtualSource;
              return tsModule.sys.readFile(fileName);
            },
            fileExists(fileName) {
              if (fileName === "/virtual/tsconfig.json" || fileName === jsxFile) {
                return true;
              }
              return tsModule.sys.fileExists(fileName);
            },
            getModifiedTime(fileName) {
              if (fileName === "/virtual/tsconfig.json") {
                return new Date(1);
              }
              return tsModule.sys.getModifiedTime?.(fileName);
            },
          },
          parseJsonConfigFileContent() {
            return {
              errors: [],
              options: {
                noEmit: true,
              },
              fileNames: [jsxFile],
              projectReferences: undefined,
              projectPath: "/virtual/tsconfig.json",
              projectVersion: "1",
            };
          },
          createCompilerHost() {
            return {
              readFile(fileName) {
                if (fileName === jsxFile) return virtualSource;
                return undefined;
              },
              useCaseSensitiveFileNames() {
                return false;
              },
              getSourceFile(fileName) {
                return {
                  originalFileName: fileName,
                };
              },
            };
          },
          createIncrementalCompilerHost(options) {
            return mockedTs.createCompilerHost(options);
          },
          createSourceFile(fileName, sourceText) {
            return {
              fileName,
              text: sourceText,
            };
          },
          createProgram({ host }) {
            createProgramCalls += 1;
            host.readFile(jsxFile);
            host.getSourceFile(jsxFile, tsModule.ScriptTarget.Latest);
            return { mocked: true };
          },
          createIncrementalProgram(args) {
            createIncrementalProgramCalls += 1;
            previousOldProgram = args.oldProgram ?? null;
            return {
              getProgram() {
                return mockedTs.createProgram(args);
              },
            };
          },
          getPreEmitDiagnostics() {
            return [];
          },
        };

        return mockedTs;
      }, ({ runLitsxTypecheck: mockedRunLitsxTypecheck }) => {
        assert.equal(mockedRunLitsxTypecheck([]), 0);
        assert.strictEqual(previousOldProgram.description, "unset");
        assert.strictEqual(createProgramCalls, 1);
        assert.strictEqual(createIncrementalProgramCalls, 0);
        assert.equal(mockedRunLitsxTypecheck([]), 0);
        assert.notStrictEqual(previousOldProgram, null);
        assert.strictEqual(createProgramCalls, 2);
        assert.strictEqual(createIncrementalProgramCalls, 1);
      });
    })();
  });

  it("reuses the same typecheck session across parsed-command-line refreshes for the same project", () => {
    return (async () => {
      let configVersion = 1;

      await withMockedTypeScript((tsModule) => {
        const mockedTs = {
          ...tsModule,
          parseCommandLine() {
            return {
              errors: [],
              options: {},
              fileNames: [],
            };
          },
          findConfigFile() {
            return "/virtual/tsconfig.json";
          },
          readConfigFile() {
            return {
              config: {
                compilerOptions: {},
              },
            };
          },
          sys: {
            ...tsModule.sys,
            readFile(fileName) {
              if (fileName === "/virtual/tsconfig.json") {
                return JSON.stringify({ compilerOptions: {} });
              }
              return tsModule.sys.readFile(fileName);
            },
            fileExists(fileName) {
              if (fileName === "/virtual/tsconfig.json") {
                return true;
              }
              return tsModule.sys.fileExists(fileName);
            },
            getModifiedTime(fileName) {
              if (fileName === "/virtual/tsconfig.json") {
                return new Date(configVersion);
              }
              return tsModule.sys.getModifiedTime?.(fileName);
            },
          },
          parseJsonConfigFileContent() {
            return {
              errors: [],
              options: {
                noEmit: true,
              },
              fileNames: [],
              projectReferences: undefined,
              projectPath: "/virtual/tsconfig.json",
              projectVersion: String(configVersion),
            };
          },
        };

        return mockedTs;
      }, ({ createLitsxTypecheckSession }) => {
        const firstSession = createLitsxTypecheckSession([]);
        configVersion = 2;
        const secondSession = createLitsxTypecheckSession([]);

        assert.strictEqual(secondSession, firstSession);
        assert.strictEqual(secondSession.parsedCommandLine.projectVersion, "2");
      });
    })();
  });

  it("surfaces missing and invalid tsconfig states through createLitsxTypecheckSession", () => {
    return (async () => {
      await withMockedTypeScript((tsModule) => ({
        ...tsModule,
        parseCommandLine() {
          return {
            errors: [],
            options: {},
            fileNames: [],
          };
        },
        findConfigFile() {
          return undefined;
        },
      }), ({ createLitsxTypecheckSession }) => {
        const session = createLitsxTypecheckSession([]);
        assert.strictEqual(session.parsedCommandLine.errors[0].code, 5083);
      });

      await withMockedTypeScript((tsModule) => ({
        ...tsModule,
        parseCommandLine() {
          return {
            errors: [],
            options: {},
            fileNames: [],
          };
        },
        findConfigFile() {
          return "/virtual/tsconfig.json";
        },
        readConfigFile() {
          return {
            error: {
              category: tsModule.DiagnosticCategory.Error,
              code: 10001,
              messageText: "broken tsconfig",
            },
          };
        },
      }), ({ createLitsxTypecheckSession }) => {
        const session = createLitsxTypecheckSession([]);
        assert.strictEqual(session.parsedCommandLine.errors[0].code, 10001);
      });
    })();
  });

  it("collects additional .litsx files from tsconfig files, include patterns, and directory reads", () => {
    return (async () => {
      let parseCalls = 0;

      await withMockedTypeScript((tsModule) => ({
        ...tsModule,
        parseCommandLine() {
          return {
            errors: [],
            options: {},
            fileNames: [],
          };
        },
        findConfigFile() {
          return "/virtual/tsconfig.json";
        },
        readConfigFile() {
          return {
            config: {
              files: ["src/direct.litsx", "src/ignored.ts"],
              include: ["src/pattern.litsx.jsx", "src/**/*.tsx"],
              exclude: ["dist"],
              compilerOptions: {},
            },
          };
        },
        parseJsonConfigFileContent(_config, _host, basePath, options, projectPath) {
          parseCalls += 1;
          return {
            errors: [
              {
                code: 18003,
              },
            ],
            options,
            fileNames: ["/virtual/src/main.tsx"],
            projectReferences: undefined,
            projectPath,
            projectVersion: "1",
          };
        },
        sys: {
          ...tsModule.sys,
          readFile(fileName) {
            if (fileName === "/virtual/tsconfig.json") {
              return JSON.stringify({ compilerOptions: {} });
            }
            return "";
          },
          fileExists(fileName) {
            return fileName === "/virtual/tsconfig.json"
              || fileName === "/virtual/src/pattern.litsx.jsx";
          },
          readDirectory(basePath, extensions) {
            assert.strictEqual(basePath, "/virtual");
            assert.deepStrictEqual(extensions, [".litsx", ".litsx.jsx"]);
            return [
              "/virtual/tsconfig.json",
              "/virtual/src/discovered.litsx",
            ];
          },
          getModifiedTime() {
            return new Date(1);
          },
        },
      }), ({ createLitsxTypecheckSession }) => {
        const first = createLitsxTypecheckSession(["--project", "/virtual/tsconfig.json"]);
        const second = createLitsxTypecheckSession(["--project", "/virtual/tsconfig.json"]);

        assert.strictEqual(parseCalls, 1);
        assert.deepStrictEqual(first.parsedCommandLine.errors, []);
        assert.deepStrictEqual(first.parsedCommandLine.fileNames, [
          "/virtual/src/direct.litsx",
          "/virtual/src/discovered.litsx",
          "/virtual/src/main.tsx",
          "/virtual/src/pattern.litsx.jsx",
        ]);
        assert.strictEqual(first.parsedCommandLine.options.allowNonTsExtensions, true);
        assert.strictEqual(second.parsedCommandLine.fileNames.length, 4);
      });
    })();
  });

  it("accepts an existing typecheck session object in runLitsxTypecheck", () => {
    return withMockedTypeScript((tsModule) => ({
      ...tsModule,
      getPreEmitDiagnostics() {
        return [];
      },
    }), ({ runLitsxTypecheck: mockedRunLitsxTypecheck }) => {
      const existingSession = {
        parsedCommandLine: {
          errors: [],
          fileNames: [],
        },
        virtualizationState: {
          getVirtualizedText(_fileName, sourceText) {
            return sourceText;
          },
        },
        projectSession: {
          refresh() {},
          getProgram() {
            return { mocked: true };
          },
          clearOverlayFile() {},
        },
      };

      assert.strictEqual(mockedRunLitsxTypecheck(existingSession), 0);
    });
  });

  it("reuses cached sessions while replacing the project session when one is provided", () => {
    return (async () => {
      let version = 1;
      const firstProjectSession = {
        refresh: vi.fn(),
      };
      const secondProjectSession = {
        refresh: vi.fn(),
      };

      await withMockedTypeScript((tsModule) => ({
        ...tsModule,
        parseCommandLine() {
          return {
            errors: [],
            options: {},
            fileNames: [],
          };
        },
        findConfigFile() {
          return "/virtual/tsconfig.json";
        },
        readConfigFile() {
          return {
            config: {
              compilerOptions: {},
            },
          };
        },
        sys: {
          ...tsModule.sys,
          readFile(fileName) {
            if (fileName === "/virtual/tsconfig.json") {
              return JSON.stringify({ compilerOptions: {} });
            }
            return tsModule.sys.readFile(fileName);
          },
          fileExists(fileName) {
            return fileName === "/virtual/tsconfig.json" || tsModule.sys.fileExists(fileName);
          },
          getModifiedTime(fileName) {
            if (fileName === "/virtual/tsconfig.json") {
              return new Date(version);
            }
            return tsModule.sys.getModifiedTime?.(fileName);
          },
        },
        parseJsonConfigFileContent() {
          return {
            errors: [],
            options: {
              noEmit: true,
            },
            fileNames: [],
            projectReferences: undefined,
            projectPath: "/virtual/tsconfig.json",
            projectVersion: String(version),
          };
        },
      }), ({ createLitsxTypecheckSession }) => {
        const firstSession = createLitsxTypecheckSession([], {
          projectSession: firstProjectSession,
        });
        version = 2;
        const secondSession = createLitsxTypecheckSession([], {
          projectSession: secondProjectSession,
        });

        assert.strictEqual(secondSession, firstSession);
        assert.strictEqual(secondSession.projectSession, secondProjectSession);
        assert.strictEqual(secondSession.parsedCommandLine.projectVersion, "2");
        assert.strictEqual(firstProjectSession.refresh.mock.calls.length, 0);
        assert.deepStrictEqual(secondProjectSession.refresh.mock.calls[0][0], {
          parsedCommandLine: secondSession.parsedCommandLine,
        });
      });
    })();
  });

  it("sets and clears overlay files while running a typecheck session", () => {
    return withMockedTypeScript((tsModule) => ({
      ...tsModule,
      getPreEmitDiagnostics() {
        return [];
      },
    }), ({ runLitsxTypecheck: mockedRunLitsxTypecheck }) => {
      const overlays = [];
      const cleared = [];
      const existingSession = {
        parsedCommandLine: {
          errors: [],
          fileNames: ["/virtual/litsx.tsx", "/virtual/plain.tsx", "/virtual/missing.tsx"],
        },
        virtualizationState: {
          getVirtualizedText(fileName, sourceText) {
            if (fileName === "/virtual/litsx.tsx") {
              return sourceText.replace("@click", "__litsx_event_click");
            }
            return sourceText;
          },
          get() {
            return null;
          },
        },
        projectSession: {
          refresh() {},
          readFile(fileName) {
            if (fileName === "/virtual/litsx.tsx") {
              return "const view = <button @click={save} />;";
            }
            if (fileName === "/virtual/plain.tsx") {
              return "const view = <button onClick={save} />;";
            }
            return undefined;
          },
          setOverlayFile(fileName, text) {
            overlays.push([fileName, text]);
          },
          clearOverlayFile(fileName) {
            cleared.push(fileName);
          },
          getProgram() {
            return { mocked: true };
          },
        },
      };

      assert.strictEqual(mockedRunLitsxTypecheck(existingSession), 0);
      assert.deepStrictEqual(overlays, [
        ["/virtual/litsx.tsx", "const view = <button __litsx_event_click={save} />;"],
      ]);
      assert.deepStrictEqual(cleared.sort(), [
        "/virtual/missing.tsx",
        "/virtual/plain.tsx",
      ]);
    });
  });

  it("reuses cached typecheck diagnostics when project files have not changed", () => {
    let getPreEmitDiagnosticsMock = null;
    return withMockedTypeScript((tsModule) => {
      const getPreEmitDiagnostics = vi.fn(() => []);
      getPreEmitDiagnosticsMock = getPreEmitDiagnostics;
      return {
        ...tsModule,
        getPreEmitDiagnostics,
        sys: {
          ...tsModule.sys,
          getModifiedTime(fileName) {
            if (fileName === "/virtual/one.tsx") {
              return new Date(1);
            }
            return tsModule.sys.getModifiedTime?.(fileName);
          },
          readFile(fileName) {
            if (fileName === "/virtual/one.tsx") {
              return "const view = <button onClick={save} />;";
            }
            return tsModule.sys.readFile(fileName);
          },
        },
      };
    }, ({ runLitsxTypecheck: mockedRunLitsxTypecheck }) => {
      const existingSession = {
        parsedCommandLine: {
          errors: [],
          fileNames: ["/virtual/one.tsx"],
          projectVersion: "1",
        },
        virtualizationState: {
          getVirtualizedText(_fileName, sourceText) {
            return sourceText;
          },
          get() {
            return null;
          },
        },
        diagnosticsCacheKey: null,
        diagnosticsCacheResult: null,
        projectSession: {
          refresh() {},
          readFile() {
            return "const view = <button onClick={save} />;";
          },
          setOverlayFile() {},
          clearOverlayFile() {},
          getProgram() {
            return { mocked: true };
          },
        },
      };

      assert.strictEqual(mockedRunLitsxTypecheck(existingSession), 0);
      assert.strictEqual(mockedRunLitsxTypecheck(existingSession), 0);
      assert.strictEqual(getPreEmitDiagnosticsMock.mock.calls.length, 1);
    });
  });

  it("filters virtual attribute completions and remaps diagnostics", () => {
    const source = `
          const view = <button @click={handleClick} />;
        `;
    const virtualSource = createVirtualLitsxJsxSource(source);
    const virtualEventStart = virtualSource.code.indexOf("__litsx_event_click");
    const originalEventStart = source.indexOf("@click");
    const snapshots = new Map([
      [
        "/virtual/example.tsx",
        source,
      ],
    ]);

    const pluginModule = plugin({
      typescript: {
        ScriptSnapshot: {
          fromString(value) {
            return {
              getLength() {
                return value.length;
              },
              getText(start, end) {
                return value.slice(start, end);
              },
            };
          },
        },
      },
    });

    const wrapped = pluginModule.create({
      languageServiceHost: {
        getScriptSnapshot(fileName) {
          const text = snapshots.get(fileName);
          if (text == null) {
            return undefined;
          }

          return {
            getLength() {
              return text.length;
            },
            getText(start, end) {
              return text.slice(start, end);
            },
          };
        },
      },
      languageService: {
        getSyntacticDiagnostics() {
          return [
            {
              start: virtualEventStart,
              length: "__litsx_event_click".length,
              messageText: "bad attr",
              category: 1,
              code: 1001,
              relatedInformation: [
                {
                  file: { fileName: "/virtual/example.tsx" },
                  start: virtualEventStart,
                  length: "__litsx_event_click".length,
                  messageText: "see attr",
                },
              ],
            },
          ];
        },
        getSemanticDiagnostics() {
          return [];
        },
        getSuggestionDiagnostics() {
          return [];
        },
        getQuickInfoAtPosition(_fileName, _position) {
          return {
            kind: "property",
            kindModifiers: "",
            textSpan: { start: virtualEventStart, length: "__litsx_event_click".length },
            displayParts: [{ text: "__litsx_event_click", kind: "propertyName" }],
            documentation: [{ text: "__litsx_event_click docs", kind: "text" }],
          };
        },
        getCompletionsAtPosition() {
          return {
            entries: [
              { name: "__litsx_event_click", kind: "property", sortText: "0" },
              { name: "class", kind: "property", sortText: "1" },
            ],
          };
        },
      },
    });

    const diagnostic = wrapped.getSyntacticDiagnostics("/virtual/example.tsx")[0];
    const quickInfo = wrapped.getQuickInfoAtPosition("/virtual/example.tsx", originalEventStart);
    const completions = wrapped.getCompletionsAtPosition("/virtual/example.tsx", originalEventStart);

    assert.strictEqual(diagnostic.start, originalEventStart);
    assert.strictEqual(diagnostic.length, "@click".length);
    assert.strictEqual(diagnostic.relatedInformation[0].span, undefined);
    assert.strictEqual(diagnostic.relatedInformation[0].start, originalEventStart);
    assert.strictEqual(quickInfo.textSpan.start, originalEventStart);
    assert.strictEqual(quickInfo.displayParts[0].text, "@click");
    assert.strictEqual(quickInfo.documentation[0].text, "@click docs");
    assert.deepStrictEqual(
      completions.entries.map((entry) => entry.name),
      ["class"],
    );
  });

  it("remaps virtual diagnostics with nested message chains, missing lengths, and fileless related info", () => {
    const source = `
      const view = <button @click={handleClick} />;
    `;
    const virtualSource = createVirtualLitsxJsxSource(source);
    const virtualEventStart = virtualSource.code.indexOf("__litsx_event_click");
    const originalEventStart = source.indexOf("@click");
    const snapshots = new Map([
      ["/virtual/example.tsx", source],
    ]);

    const pluginModule = plugin({
      typescript: {
        ScriptSnapshot: {
          fromString(value) {
            return {
              getLength() {
                return value.length;
              },
              getText(start, end) {
                return value.slice(start, end);
              },
            };
          },
        },
      },
    });

    const wrapped = pluginModule.create({
      languageServiceHost: {
        getScriptSnapshot(fileName) {
          const text = snapshots.get(fileName);
          if (text == null) {
            return undefined;
          }

          return {
            getLength() {
              return text.length;
            },
            getText(start, end) {
              return text.slice(start, end);
            },
          };
        },
      },
      languageService: {
        getSyntacticDiagnostics() {
          return [
            {
              file: { fileName: "/virtual/example.tsx" },
              start: virtualEventStart,
              length: undefined,
              messageText: {
                messageText: "__litsx_event_click is wrong",
                next: [
                  {
                    messageText: "__litsx_event_click follow-up",
                  },
                ],
              },
              category: 1,
              code: 1002,
              relatedInformation: [
                {
                  start: 1,
                  messageText: "__litsx_event_click related",
                },
              ],
            },
          ];
        },
        getSemanticDiagnostics() {
          return [];
        },
        getSuggestionDiagnostics() {
          return [];
        },
        getQuickInfoAtPosition() {
          return undefined;
        },
        getCompletionsAtPosition() {
          return null;
        },
      },
    });

    const diagnostic = wrapped.getSyntacticDiagnostics("/virtual/example.tsx")[0];

    assert.strictEqual(diagnostic.start, originalEventStart);
    assert.strictEqual(diagnostic.length, "@click".length);
    assert.strictEqual(diagnostic.messageText.messageText, "@click is wrong");
    assert.strictEqual(diagnostic.messageText.next[0].messageText, "@click follow-up");
    assert.strictEqual(diagnostic.relatedInformation[0].messageText, "@click related");
    assert.strictEqual(diagnostic.relatedInformation[0].start, 1);
  });

  it("normalizes escaped newlines in quick info documentation", () => {
    const source = `
      const view = <button @click={handleClick} />;
    `;
    const virtualSource = createVirtualLitsxJsxSource(source);
    const virtualEventStart = virtualSource.code.indexOf("__litsx_event_click");
    const originalEventStart = source.indexOf("@click");
    const snapshots = new Map([
      ["/virtual/example.tsx", source],
    ]);

    const pluginModule = plugin({
      typescript: {
        ScriptSnapshot: {
          fromString(text) {
            return {
              getText(start, end) {
                return text.slice(start, end);
              },
              getLength() {
                return text.length;
              },
            };
          },
        },
      },
    });

    const wrapped = pluginModule.create({
      languageServiceHost: {
        getScriptSnapshot(fileName) {
          const sourceText = snapshots.get(fileName);
          if (sourceText == null) {
            return undefined;
          }

          return {
            getText(start, end) {
              return sourceText.slice(start, end);
            },
            getLength() {
              return sourceText.length;
            },
          };
        },
      },
      languageService: {
        getSyntacticDiagnostics() {
          return [];
        },
        getSemanticDiagnostics() {
          return [];
        },
        getSuggestionDiagnostics() {
          return [];
        },
        getQuickInfoAtPosition() {
          return {
            kind: "property",
            kindModifiers: "",
            textSpan: { start: virtualEventStart, length: "__litsx_event_click".length },
            displayParts: [{ text: "__litsx_event_click", kind: "propertyName" }],
            documentation: [{ text: "line 1\\nline 2", kind: "text" }],
          };
        },
        getCompletionsAtPosition() {
          return null;
        },
      },
    });

    const quickInfo = wrapped.getQuickInfoAtPosition("/virtual/example.tsx", originalEventStart);

    assert.strictEqual(quickInfo.documentation[0].text, "line 1\nline 2");
  });

  it("passes through diagnostics unchanged when no virtualization exists", () => {
    const pluginModule = plugin({
      typescript: {
        ScriptSnapshot: {
          fromString(value) {
            return {
              getLength() {
                return value.length;
              },
              getText(start, end) {
                return value.slice(start, end);
              },
            };
          },
        },
      },
    });

    const originalDiagnostic = {
      start: 4,
      length: 3,
      messageText: "plain diagnostic",
      category: 1,
      code: 1001,
    };

    const wrapped = pluginModule.create({
      languageServiceHost: {
        getScriptSnapshot() {
          return {
            getLength() {
              return 18;
            },
            getText() {
              return "const value = 1;";
            },
          };
        },
      },
      languageService: {
        getSyntacticDiagnostics() {
          return [originalDiagnostic];
        },
        getSemanticDiagnostics() {
          return [];
        },
        getSuggestionDiagnostics() {
          return [];
        },
        getQuickInfoAtPosition() {
          return undefined;
        },
        getCompletionsAtPosition() {
          return null;
        },
      },
    });

    assert.strictEqual(
      wrapped.getSyntacticDiagnostics("/virtual/plain.ts")[0],
      originalDiagnostic,
    );
  });

  it("passes through semantic diagnostics unchanged when no virtualization exists", () => {
    const pluginModule = plugin({
      typescript: {
        ScriptSnapshot: {
          fromString(value) {
            return {
              getLength() {
                return value.length;
              },
              getText(start, end) {
                return value.slice(start, end);
              },
            };
          },
        },
      },
    });

    const originalDiagnostic = {
      start: 2,
      length: 4,
      messageText: "plain semantic diagnostic",
      category: 1,
      code: 1002,
    };

    const wrapped = pluginModule.create({
      languageServiceHost: {
        getScriptSnapshot() {
          return {
            getLength() {
              return 18;
            },
            getText() {
              return "const value = 1;";
            },
          };
        },
      },
      languageService: {
        getSyntacticDiagnostics() {
          return [];
        },
        getSemanticDiagnostics() {
          return [originalDiagnostic];
        },
        getSuggestionDiagnostics() {
          return [];
        },
        getQuickInfoAtPosition() {
          return undefined;
        },
        getCompletionsAtPosition() {
          return null;
        },
      },
    });

    assert.strictEqual(
      wrapped.getSemanticDiagnostics("/virtual/plain.ts")[0],
      originalDiagnostic,
    );
  });

  it("normalizes undefined diagnostics to an empty array for virtualized files", () => {
    const source = `const view = <button @click={handleClick} />;`;
    const snapshots = new Map([["/virtual/example.tsx", source]]);
    const pluginModule = plugin({
      typescript: {
        ScriptSnapshot: {
          fromString(value) {
            return {
              getLength() {
                return value.length;
              },
              getText(start, end) {
                return value.slice(start, end);
              },
            };
          },
        },
      },
    });

    const wrapped = pluginModule.create({
      languageServiceHost: {
        getScriptSnapshot(fileName) {
          const text = snapshots.get(fileName);
          if (text == null) {
            return undefined;
          }

          return {
            getLength() {
              return text.length;
            },
            getText(start, end) {
              return text.slice(start, end);
            },
          };
        },
      },
      languageService: {
        getSyntacticDiagnostics() {
          return undefined;
        },
        getSemanticDiagnostics() {
          return undefined;
        },
        getSuggestionDiagnostics() {
          return undefined;
        },
        getQuickInfoAtPosition() {
          return undefined;
        },
        getCompletionsAtPosition() {
          return null;
        },
      },
    });

    assert.deepStrictEqual(wrapped.getSyntacticDiagnostics("/virtual/example.tsx"), []);
    assert.deepStrictEqual(wrapped.getSemanticDiagnostics("/virtual/example.tsx"), []);
    assert.deepStrictEqual(wrapped.getSuggestionDiagnostics("/virtual/example.tsx"), []);
  });

  it("preserves diagnostic start and length when they are not numeric", () => {
    const source = `const view = <button @click={handleClick} />;`;
    const snapshots = new Map([["/virtual/example.tsx", source]]);
    const originalDiagnostic = {
      start: undefined,
      length: undefined,
      messageText: "plain diagnostic",
      category: 1,
      code: 1003,
    };
    const pluginModule = plugin({
      typescript: {
        ScriptSnapshot: {
          fromString(value) {
            return {
              getLength() {
                return value.length;
              },
              getText(start, end) {
                return value.slice(start, end);
              },
            };
          },
        },
      },
    });

    const wrapped = pluginModule.create({
      languageServiceHost: {
        getScriptSnapshot(fileName) {
          const text = snapshots.get(fileName);
          if (text == null) {
            return undefined;
          }

          return {
            getLength() {
              return text.length;
            },
            getText(start, end) {
              return text.slice(start, end);
            },
          };
        },
      },
      languageService: {
        getSyntacticDiagnostics() {
          return [originalDiagnostic];
        },
        getSemanticDiagnostics() {
          return [];
        },
        getSuggestionDiagnostics() {
          return [];
        },
        getQuickInfoAtPosition() {
          return undefined;
        },
        getCompletionsAtPosition() {
          return null;
        },
      },
    });

    assert.strictEqual(
      wrapped.getSyntacticDiagnostics("/virtual/example.tsx")[0].start,
      undefined,
    );
    assert.strictEqual(
      wrapped.getSyntacticDiagnostics("/virtual/example.tsx")[0].length,
      undefined,
    );
  });

  it("passes through quick info and completions when no virtualization exists", () => {
    const pluginModule = plugin({
      typescript: {
        ScriptSnapshot: {
          fromString(value) {
            return {
              getLength() {
                return value.length;
              },
              getText(start, end) {
                return value.slice(start, end);
              },
            };
          },
        },
      },
    });

    const info = {
      textSpan: { start: 2, length: 3 },
      displayParts: [{ text: "value", kind: "text" }],
      documentation: [{ text: "docs", kind: "text" }],
    };
    const completions = {
      entries: [{ name: "class", kind: "property", sortText: "1" }],
    };

    const wrapped = pluginModule.create({
      languageServiceHost: {
        getScriptSnapshot() {
          return {
            getLength() {
              return 18;
            },
            getText() {
              return "const value = 1;";
            },
          };
        },
      },
      languageService: {
        getSyntacticDiagnostics() {
          return [];
        },
        getSemanticDiagnostics() {
          return [];
        },
        getSuggestionDiagnostics() {
          return [];
        },
        getQuickInfoAtPosition() {
          return info;
        },
        getCompletionsAtPosition() {
          return completions;
        },
      },
    });

    assert.strictEqual(wrapped.getQuickInfoAtPosition("/virtual/plain.ts", 2), info);
    assert.deepStrictEqual(wrapped.getCompletionsAtPosition("/virtual/plain.ts", 2), completions);
  });

  it("returns undefined completion details when the language service does not expose that method", () => {
    const source = `const view = <button @click={handleClick} />;`;
    const snapshots = new Map([["/virtual/no-details.tsx", source]]);
    const pluginModule = plugin({
      typescript: {
        ScriptSnapshot: {
          fromString(value) {
            return {
              getLength() {
                return value.length;
              },
              getText(start, end) {
                return value.slice(start, end);
              },
            };
          },
        },
      },
    });

    const wrapped = pluginModule.create({
      languageServiceHost: {
        getScriptSnapshot(fileName) {
          const text = snapshots.get(fileName);
          if (text == null) {
            return undefined;
          }

          return {
            getLength() {
              return text.length;
            },
            getText(start, end) {
              return text.slice(start, end);
            },
          };
        },
      },
      languageService: {
        getSyntacticDiagnostics() {
          return [];
        },
        getSemanticDiagnostics() {
          return [];
        },
        getSuggestionDiagnostics() {
          return [];
        },
        getQuickInfoAtPosition() {
          return undefined;
        },
        getCompletionsAtPosition() {
          return null;
        },
      },
    });

    assert.strictEqual(
      wrapped.getCompletionEntryDetails("/virtual/no-details.tsx", source.indexOf("@click"), "class"),
      undefined,
    );
  });

  it("provides synthetic quick info for authored LitSX attributes when TypeScript returns nothing", () => {
    const source = "<button @click={handleClick} />";
    const snapshots = new Map([["/virtual/hover.tsx", source]]);
    const pluginModule = plugin({
      typescript: {
        ScriptSnapshot: {
          fromString(value) {
            return {
              getLength() {
                return value.length;
              },
              getText(start, end) {
                return value.slice(start, end);
              },
            };
          },
        },
      },
    });

    const wrapped = pluginModule.create({
      languageServiceHost: {
        getScriptSnapshot(fileName) {
          const text = snapshots.get(fileName);
          if (text == null) {
            return undefined;
          }

          return {
            getLength() {
              return text.length;
            },
            getText(start, end) {
              return text.slice(start, end);
            },
          };
        },
      },
      languageService: {
        getSyntacticDiagnostics() {
          return [];
        },
        getSemanticDiagnostics() {
          return [];
        },
        getSuggestionDiagnostics() {
          return [];
        },
        getQuickInfoAtPosition() {
          return undefined;
        },
        getCompletionsAtPosition() {
          return null;
        },
      },
    });

    const quickInfo = wrapped.getQuickInfoAtPosition("/virtual/hover.tsx", source.indexOf("@click") + 2);

    assert.ok(quickInfo);
    assert.deepStrictEqual(quickInfo.textSpan, {
      start: source.indexOf("@click"),
      length: "@click".length,
    });
    assert.strictEqual(quickInfo.displayParts[0].text, "@click");
    assert.match(quickInfo.documentation[0].text, /LitSX event listener binding for <button>/);
  });

  it("provides synthetic quick info for boolean LitSX attributes when TypeScript returns nothing", () => {
    const source = "<button ?disabled={flag} />";
    const snapshots = new Map([["/virtual/bool-hover.tsx", source]]);
    const pluginModule = plugin({
      typescript: {
        ScriptSnapshot: {
          fromString(value) {
            return {
              getLength() {
                return value.length;
              },
              getText(start, end) {
                return value.slice(start, end);
              },
            };
          },
        },
      },
    });

    const wrapped = pluginModule.create({
      languageServiceHost: {
        getScriptSnapshot(fileName) {
          const text = snapshots.get(fileName);
          if (text == null) {
            return undefined;
          }

          return {
            getLength() {
              return text.length;
            },
            getText(start, end) {
              return text.slice(start, end);
            },
          };
        },
      },
      languageService: {
        getSyntacticDiagnostics() {
          return [];
        },
        getSemanticDiagnostics() {
          return [];
        },
        getSuggestionDiagnostics() {
          return [];
        },
        getQuickInfoAtPosition() {
          return undefined;
        },
        getCompletionsAtPosition() {
          return null;
        },
      },
    });

    const quickInfo = wrapped.getQuickInfoAtPosition("/virtual/bool-hover.tsx", source.indexOf("?disabled") + 2);

    assert.ok(quickInfo);
    assert.strictEqual(quickInfo.displayParts[0].text, "?disabled");
    assert.match(quickInfo.documentation[0].text, /LitSX boolean attribute binding for <button>/);
  });

  it("provides synthetic quick info for property LitSX attributes when TypeScript returns nothing", () => {
    const source = "<input .value={name} />";
    const snapshots = new Map([["/virtual/prop-hover.tsx", source]]);
    const pluginModule = plugin({
      typescript: {
        ScriptSnapshot: {
          fromString(value) {
            return {
              getLength() {
                return value.length;
              },
              getText(start, end) {
                return value.slice(start, end);
              },
            };
          },
        },
      },
    });

    const wrapped = pluginModule.create({
      languageServiceHost: {
        getScriptSnapshot(fileName) {
          const text = snapshots.get(fileName);
          if (text == null) {
            return undefined;
          }

          return {
            getLength() {
              return text.length;
            },
            getText(start, end) {
              return text.slice(start, end);
            },
          };
        },
      },
      languageService: {
        getSyntacticDiagnostics() {
          return [];
        },
        getSemanticDiagnostics() {
          return [];
        },
        getSuggestionDiagnostics() {
          return [];
        },
        getQuickInfoAtPosition() {
          return undefined;
        },
        getCompletionsAtPosition() {
          return null;
        },
      },
    });

    const quickInfo = wrapped.getQuickInfoAtPosition("/virtual/prop-hover.tsx", source.indexOf(".value") + 2);

    assert.ok(quickInfo);
    assert.strictEqual(quickInfo.displayParts[0].text, ".value");
    assert.match(quickInfo.documentation[0].text, /LitSX property binding for <input>/);
  });

  it("returns undefined quick info when a LitSX-looking file has no authored hover target at the cursor", () => {
    const source = "<button @click={handleClick} />";
    const snapshots = new Map([["/virtual/no-hover.tsx", source]]);
    const pluginModule = plugin({
      typescript: {
        ScriptSnapshot: {
          fromString(value) {
            return {
              getLength() {
                return value.length;
              },
              getText(start, end) {
                return value.slice(start, end);
              },
            };
          },
        },
      },
    });

    const wrapped = pluginModule.create({
      languageServiceHost: {
        getScriptSnapshot(fileName) {
          const text = snapshots.get(fileName);
          if (text == null) {
            return undefined;
          }

          return {
            getLength() {
              return text.length;
            },
            getText(start, end) {
              return text.slice(start, end);
            },
          };
        },
      },
      languageService: {
        getSyntacticDiagnostics() {
          return [];
        },
        getSemanticDiagnostics() {
          return [];
        },
        getSuggestionDiagnostics() {
          return [];
        },
        getQuickInfoAtPosition() {
          return undefined;
        },
        getCompletionsAtPosition() {
          return null;
        },
      },
    });

    assert.strictEqual(
      wrapped.getQuickInfoAtPosition("/virtual/no-hover.tsx", source.indexOf("button")),
      undefined,
    );
  });

  it("provides synthetic quick info for static hoists without exposing tooling stubs", () => {
    const source = `
      export const Card = () => {
        static styles = \`:host { display: block; }\`;
        return <div />;
      };
    `;
    const snapshots = new Map([["/virtual/hoist-hover.tsx", source]]);
    const pluginModule = plugin({
      typescript: {
        ScriptSnapshot: {
          fromString(value) {
            return {
              getLength() {
                return value.length;
              },
              getText(start, end) {
                return value.slice(start, end);
              },
            };
          },
        },
      },
    });

    const wrapped = pluginModule.create({
      languageServiceHost: {
        getScriptSnapshot(fileName) {
          const text = snapshots.get(fileName);
          if (text == null) {
            return undefined;
          }

          return {
            getLength() {
              return text.length;
            },
            getText(start, end) {
              return text.slice(start, end);
            },
          };
        },
      },
      languageService: {
        getSyntacticDiagnostics() {
          return [];
        },
        getSemanticDiagnostics() {
          return [];
        },
        getSuggestionDiagnostics() {
          return [];
        },
        getQuickInfoAtPosition() {
          return {
            kind: "function",
            kindModifiers: "",
            textSpan: { start: 0, length: 10 },
            displayParts: [{ text: "__litsx_static_styles", kind: "functionName" }],
            documentation: [{ text: "tooling stub", kind: "text" }],
          };
        },
        getCompletionsAtPosition() {
          return null;
        },
      },
    });

    const quickInfo = wrapped.getQuickInfoAtPosition("/virtual/hoist-hover.tsx", source.indexOf("static styles") + 2);

    assert.ok(quickInfo);
    assert.deepStrictEqual(quickInfo.textSpan, {
      start: source.indexOf("static styles"),
      length: "static styles".length,
    });
    assert.strictEqual(quickInfo.displayParts[0].text, "static styles");
    assert.match(quickInfo.documentation[0].text, /static style hoist/i);
  });

  it("provides synthetic quick info for static hoists when TypeScript returns nothing", () => {
    const source = `
      export const Card = () => {
        static styles = \`:host { display: block; }\`;
        return <div />;
      };
    `;
    const snapshots = new Map([["/virtual/hoist-no-info.tsx", source]]);
    const pluginModule = plugin({
      typescript: {
        ScriptSnapshot: {
          fromString(value) {
            return {
              getLength() {
                return value.length;
              },
              getText(start, end) {
                return value.slice(start, end);
              },
            };
          },
        },
      },
    });

    const wrapped = pluginModule.create({
      languageServiceHost: {
        getScriptSnapshot(fileName) {
          const text = snapshots.get(fileName);
          if (text == null) {
            return undefined;
          }

          return {
            getLength() {
              return text.length;
            },
            getText(start, end) {
              return text.slice(start, end);
            },
          };
        },
      },
      languageService: {
        getSyntacticDiagnostics() {
          return [];
        },
        getSemanticDiagnostics() {
          return [];
        },
        getSuggestionDiagnostics() {
          return [];
        },
        getQuickInfoAtPosition() {
          return undefined;
        },
        getCompletionsAtPosition() {
          return null;
        },
      },
    });

    const quickInfo = wrapped.getQuickInfoAtPosition("/virtual/hoist-no-info.tsx", source.indexOf("static styles") + 2);

    assert.ok(quickInfo);
    assert.strictEqual(quickInfo.displayParts[0].text, "static styles");
    assert.match(quickInfo.documentation[0].text, /static style hoist/i);
  });

  it("passes through unrelated quick-info display parts when no static hoist is inferred", () => {
    const source = "<button @click={handleClick} />";
    const snapshots = new Map([["/virtual/legacy-hoist.tsx", source]]);
    const pluginModule = plugin({
      typescript: {
        ScriptSnapshot: {
          fromString(value) {
            return {
              getLength() {
                return value.length;
              },
              getText(start, end) {
                return value.slice(start, end);
              },
            };
          },
        },
      },
    });

    const wrapped = pluginModule.create({
      languageServiceHost: {
        getScriptSnapshot(fileName) {
          const text = snapshots.get(fileName);
          if (text == null) {
            return undefined;
          }

          return {
            getLength() {
              return text.length;
            },
            getText(start, end) {
              return text.slice(start, end);
            },
          };
        },
      },
      languageService: {
        getSyntacticDiagnostics() {
          return [];
        },
        getSemanticDiagnostics() {
          return [];
        },
        getSuggestionDiagnostics() {
          return [];
        },
        getQuickInfoAtPosition() {
          return {
            kind: "function",
            kindModifiers: "",
            textSpan: { start: 1, length: 3 },
            displayParts: [{ text: "externalHelper", kind: "functionName" }],
            documentation: [{ text: "external helper", kind: "text" }],
          };
        },
        getCompletionsAtPosition() {
          return null;
        },
      },
    });

    const quickInfo = wrapped.getQuickInfoAtPosition("/virtual/legacy-hoist.tsx", source.indexOf("@click"));

    assert.ok(quickInfo);
    assert.strictEqual(quickInfo.displayParts[0].text, "externalHelper");
    assert.strictEqual(quickInfo.documentation[0].text, "external helper");
  });

  it("returns null completions when virtualization exists but there is no context or source completion result", () => {
    const source = "<button @click={handleClick} />";
    const snapshots = new Map([["/virtual/null-completions.tsx", source]]);
    const pluginModule = plugin({
      typescript: {
        ScriptSnapshot: {
          fromString(value) {
            return {
              getLength() {
                return value.length;
              },
              getText(start, end) {
                return value.slice(start, end);
              },
            };
          },
        },
      },
    });

    const wrapped = pluginModule.create({
      languageServiceHost: {
        getScriptSnapshot(fileName) {
          const text = snapshots.get(fileName);
          if (text == null) {
            return undefined;
          }

          return {
            getLength() {
              return text.length;
            },
            getText(start, end) {
              return text.slice(start, end);
            },
          };
        },
      },
      languageService: {
        getSyntacticDiagnostics() {
          return [];
        },
        getSemanticDiagnostics() {
          return [];
        },
        getSuggestionDiagnostics() {
          return [];
        },
        getQuickInfoAtPosition() {
          return undefined;
        },
        getCompletionsAtPosition() {
          return null;
        },
      },
    });

    assert.strictEqual(
      wrapped.getCompletionsAtPosition("/virtual/null-completions.tsx", source.length),
      null,
    );
  });

  it("falls back to plain property completion metadata for unsupported contextual names", () => {
    const source = "<button @click={handleClick} />";
    const snapshots = new Map([["/virtual/plain-contextual.tsx", source]]);
    const pluginModule = plugin({
      typescript: {
        ScriptSnapshot: {
          fromString(value) {
            return {
              getLength() {
                return value.length;
              },
              getText(start, end) {
                return value.slice(start, end);
              },
            };
          },
        },
      },
    });

    const wrapped = pluginModule.create({
      languageServiceHost: {
        getScriptSnapshot(fileName) {
          const text = snapshots.get(fileName);
          if (text == null) {
            return undefined;
          }

          return {
            getLength() {
              return text.length;
            },
            getText(start, end) {
              return text.slice(start, end);
            },
          };
        },
      },
      languageService: {
        getSyntacticDiagnostics() {
          return [];
        },
        getSemanticDiagnostics() {
          return [];
        },
        getSuggestionDiagnostics() {
          return [];
        },
        getQuickInfoAtPosition() {
          return undefined;
        },
        getCompletionsAtPosition() {
          return {
            entries: [
              { name: "class", kind: "property", sortText: "1" },
            ],
          };
        },
      },
    });

    const completions = wrapped.getCompletionsAtPosition("/virtual/plain-contextual.tsx", source.indexOf("@click") + 2);

    assert.ok(completions.entries.some((entry) => entry.name === "@click"));
    assert.ok(completions.entries.some((entry) => entry.name === "class"));
  });

  it("reuses cached virtualization and computes authored diagnostics lazily", () => {
    const source = "<button @click={handleClick} />";
    const fileName = "/virtual/cached.tsx";
    const snapshots = new Map([[fileName, source]]);
    const virtualizationSpy = vi.spyOn(virtualSourceModule, "createToolingVirtualLitsxSource");
    const authoredDiagnosticsSpy = vi.spyOn(virtualSourceModule, "collectLitsxAuthoredDiagnostics");
    const pluginModule = plugin({
      typescript: {
        ScriptSnapshot: {
          fromString(value) {
            return {
              getLength() {
                return value.length;
              },
              getText(start, end) {
                return value.slice(start, end);
              },
            };
          },
        },
      },
    });
    const languageServiceHost = {
      getScriptSnapshot(requestedFileName) {
        const text = snapshots.get(requestedFileName);
        if (text == null) {
          return undefined;
        }

        return {
          getLength() {
            return text.length;
          },
          getText(start, end) {
            return text.slice(start, end);
          },
        };
      },
    };

    try {
      const wrapped = pluginModule.create({
        languageServiceHost,
        languageService: {
          getSyntacticDiagnostics() {
            return [];
          },
          getSemanticDiagnostics() {
            return [];
          },
          getSuggestionDiagnostics() {
            return [];
          },
          getQuickInfoAtPosition() {
            return undefined;
          },
          getCompletionsAtPosition() {
            return null;
          },
        },
      });

      languageServiceHost.getScriptSnapshot(fileName);
      languageServiceHost.getScriptSnapshot(fileName);
      wrapped.getQuickInfoAtPosition(fileName, source.indexOf("@click"));
      wrapped.getCompletionsAtPosition(fileName, source.indexOf("@click"));
      wrapped.getSyntacticDiagnostics(fileName);

      assert.strictEqual(virtualizationSpy.mock.calls.length, 1);
      assert.strictEqual(authoredDiagnosticsSpy.mock.calls.length, 1);

      wrapped.getSemanticDiagnostics(fileName);
      wrapped.getSemanticDiagnostics(fileName);

      assert.strictEqual(virtualizationSpy.mock.calls.length, 1);
      assert.strictEqual(authoredDiagnosticsSpy.mock.calls.length, 1);
    } finally {
      virtualizationSpy.mockRestore();
      authoredDiagnosticsSpy.mockRestore();
    }
  });

  it("reuses cached virtualization records when the original snapshot object is unchanged", () => {
    const source = "<button @click={handleClick} />";
    const fileName = "/virtual/stable-snapshot.tsx";
    const stableSnapshot = {
      getLength() {
        return source.length;
      },
      getText(start, end) {
        return source.slice(start, end);
      },
    };
    let snapshotCalls = 0;
    const virtualizationSpy = vi.spyOn(virtualSourceModule, "createToolingVirtualLitsxSource");
    const pluginModule = plugin({
      typescript: {
        ScriptSnapshot: {
          fromString(value) {
            return {
              getLength() {
                return value.length;
              },
              getText(start, end) {
                return value.slice(start, end);
              },
            };
          },
        },
      },
    });

    try {
      const wrapped = pluginModule.create({
        languageServiceHost: {
          getScriptSnapshot(requestedFileName) {
            if (requestedFileName !== fileName) {
              return undefined;
            }

            snapshotCalls += 1;
            return stableSnapshot;
          },
        },
        languageService: {
          getSyntacticDiagnostics() {
            return [];
          },
          getSemanticDiagnostics() {
            return [];
          },
          getSuggestionDiagnostics() {
            return [];
          },
          getQuickInfoAtPosition() {
            return undefined;
          },
          getCompletionsAtPosition() {
            return null;
          },
        },
      });

      assert.deepStrictEqual(wrapped.getSyntacticDiagnostics(fileName), []);
      assert.deepStrictEqual(wrapped.getSyntacticDiagnostics(fileName), []);
      assert.ok(snapshotCalls >= 2);
      assert.strictEqual(virtualizationSpy.mock.calls.length, 1);
    } finally {
      virtualizationSpy.mockRestore();
    }
  });

  it("reuses cached virtualization records when a new snapshot has identical source text", () => {
    const fileName = "/virtual/example.tsx";
    const source = `const view = <button @click={handleClick} />;`;
    let snapshotVersion = 0;

    const pluginModule = plugin({
      typescript: {
        ScriptSnapshot: {
          fromString(value) {
            return {
              getLength() {
                return value.length;
              },
              getText(start, end) {
                return value.slice(start, end);
              },
            };
          },
        },
      },
    });

    const languageServiceHost = {
      getScriptSnapshot(requestedFileName) {
        if (requestedFileName !== fileName) {
          return undefined;
        }

        snapshotVersion += 1;
        return {
          version: snapshotVersion,
          getLength() {
            return source.length;
          },
          getText(start, end) {
            return source.slice(start, end);
          },
        };
      },
    };

    const wrapped = pluginModule.create({
      languageServiceHost,
      languageService: {
        getSyntacticDiagnostics() {
          return [];
        },
        getSemanticDiagnostics() {
          return [];
        },
        getSuggestionDiagnostics() {
          return [];
        },
        getQuickInfoAtPosition() {
          return undefined;
        },
        getCompletionsAtPosition() {
          return null;
        },
      },
    });

    const first = languageServiceHost.getScriptSnapshot(fileName);
    const second = languageServiceHost.getScriptSnapshot(fileName);

    assert.strictEqual(first.getText(0, first.getLength()), second.getText(0, second.getLength()));
    assert.strictEqual(snapshotVersion, 2);
    assert.deepStrictEqual(wrapped.getSyntacticDiagnostics(fileName), []);
  });

  it("skips caching a virtualization record when tooling virtualization returns the source unchanged", () => {
    const fileName = "/virtual/unchanged.tsx";
    const source = "<button @click={handleClick} />";
    const virtualizationSpy = vi
      .spyOn(virtualSourceModule, "createToolingVirtualLitsxSource")
      .mockReturnValue({
        code: source,
        replacements: [],
        toolingPreamble: "",
        toolingPreambleLength: 0,
      });

    const pluginModule = plugin({
      typescript: {
        ScriptSnapshot: {
          fromString(value) {
            return {
              getLength() {
                return value.length;
              },
              getText(start, end) {
                return value.slice(start, end);
              },
            };
          },
        },
      },
    });

    try {
      const wrapped = pluginModule.create({
        languageServiceHost: {
          getScriptSnapshot(requestedFileName) {
            if (requestedFileName !== fileName) {
              return undefined;
            }

            return {
              getLength() {
                return source.length;
              },
              getText(start, end) {
                return source.slice(start, end);
              },
            };
          },
        },
        languageService: {
          getSyntacticDiagnostics() {
            return [];
          },
          getSemanticDiagnostics() {
            return [];
          },
          getSuggestionDiagnostics() {
            return [];
          },
          getQuickInfoAtPosition() {
            return undefined;
          },
          getCompletionsAtPosition() {
            return null;
          },
        },
      });

      assert.deepStrictEqual(wrapped.getSyntacticDiagnostics(fileName), []);
      assert.deepStrictEqual(wrapped.getSyntacticDiagnostics(fileName), []);
      assert.strictEqual(virtualizationSpy.mock.calls.length, 4);
    } finally {
      virtualizationSpy.mockRestore();
    }
  });

  it("invalidates cached virtualization when snapshot text changes", () => {
    const fileName = "/virtual/changing.tsx";
    let source = "<button @click={handleClick} />";
    const virtualizationSpy = vi.spyOn(virtualSourceModule, "createToolingVirtualLitsxSource");
    const pluginModule = plugin({
      typescript: {
        ScriptSnapshot: {
          fromString(value) {
            return {
              getLength() {
                return value.length;
              },
              getText(start, end) {
                return value.slice(start, end);
              },
            };
          },
        },
      },
    });

    try {
      const wrapped = pluginModule.create({
        languageServiceHost: {
          getScriptSnapshot(requestedFileName) {
            if (requestedFileName !== fileName) {
              return undefined;
            }

            return {
              getLength() {
                return source.length;
              },
              getText(start, end) {
                return source.slice(start, end);
              },
            };
          },
        },
        languageService: {
          getSyntacticDiagnostics() {
            return [];
          },
          getSemanticDiagnostics() {
            return [];
          },
          getSuggestionDiagnostics() {
            return [];
          },
          getQuickInfoAtPosition() {
            return undefined;
          },
          getCompletionsAtPosition() {
            return null;
          },
        },
      });

      wrapped.getSyntacticDiagnostics(fileName);
      source = "<button .value={name} />";
      wrapped.getSyntacticDiagnostics(fileName);

      assert.strictEqual(virtualizationSpy.mock.calls.length, 2);
    } finally {
      virtualizationSpy.mockRestore();
    }
  });

  it("adds contextual completions for authored lit prefixes", () => {
    const source = "<input .va />";
    const snapshots = new Map([["/virtual/input.tsx", source]]);

    const pluginModule = plugin({
      typescript: {
        ScriptSnapshot: {
          fromString(value) {
            return {
              getLength() {
                return value.length;
              },
              getText(start, end) {
                return value.slice(start, end);
              },
            };
          },
        },
      },
    });

    const wrapped = pluginModule.create({
      languageServiceHost: {
        getScriptSnapshot(fileName) {
          const text = snapshots.get(fileName);
          if (text == null) {
            return undefined;
          }

          return {
            getLength() {
              return text.length;
            },
            getText(start, end) {
              return text.slice(start, end);
            },
          };
        },
      },
      languageService: {
        getSyntacticDiagnostics() {
          return [];
        },
        getSemanticDiagnostics() {
          return [];
        },
        getSuggestionDiagnostics() {
          return [];
        },
        getQuickInfoAtPosition() {
          return undefined;
        },
        getCompletionsAtPosition() {
          return null;
        },
      },
    });

    const completions = wrapped.getCompletionsAtPosition("/virtual/input.tsx", source.indexOf(".va") + 3);

    assert.deepStrictEqual(
      completions.entries.map((entry) => entry.name),
      [".value", ".valueAsNumber"],
    );
    assert.ok(completions.entries.every((entry) => entry.source === "LitSX"));
  });

  it("matches contextual property completions by camel-case word segments", () => {
    const source = "<input .number />";
    const snapshots = new Map([["/virtual/input-number.tsx", source]]);

    const pluginModule = plugin({
      typescript: {
        ScriptSnapshot: {
          fromString(value) {
            return {
              getLength() {
                return value.length;
              },
              getText(start, end) {
                return value.slice(start, end);
              },
            };
          },
        },
      },
    });

    const wrapped = pluginModule.create({
      languageServiceHost: {
        getScriptSnapshot(fileName) {
          const text = snapshots.get(fileName);
          if (text == null) {
            return undefined;
          }

          return {
            getLength() {
              return text.length;
            },
            getText(start, end) {
              return text.slice(start, end);
            },
          };
        },
      },
      languageService: {
        getSyntacticDiagnostics() {
          return [];
        },
        getSemanticDiagnostics() {
          return [];
        },
        getSuggestionDiagnostics() {
          return [];
        },
        getQuickInfoAtPosition() {
          return undefined;
        },
        getCompletionsAtPosition() {
          return {
            entries: [
              { name: "name", kind: "property", sortText: "1" },
              { name: "nonce", kind: "property", sortText: "2" },
            ],
          };
        },
      },
    });

    const completions = wrapped.getCompletionsAtPosition(
      "/virtual/input-number.tsx",
      source.indexOf(".number") + ".number".length,
    );

    assert.deepStrictEqual(
      completions.entries.map((entry) => entry.name),
      [".valueAsNumber", "name", "nonce"],
    );
  });

  it("merges contextual completions ahead of existing non-virtual entries without duplication", () => {
    const source = "<button @cl />";
    const snapshots = new Map([["/virtual/merge.tsx", source]]);

    const pluginModule = plugin({
      typescript: {
        ScriptSnapshot: {
          fromString(value) {
            return {
              getLength() {
                return value.length;
              },
              getText(start, end) {
                return value.slice(start, end);
              },
            };
          },
        },
      },
    });

    const wrapped = pluginModule.create({
      languageServiceHost: {
        getScriptSnapshot(fileName) {
          const text = snapshots.get(fileName);
          if (text == null) {
            return undefined;
          }

          return {
            getLength() {
              return text.length;
            },
            getText(start, end) {
              return text.slice(start, end);
            },
          };
        },
      },
      languageService: {
        getSyntacticDiagnostics() {
          return [];
        },
        getSemanticDiagnostics() {
          return [];
        },
        getSuggestionDiagnostics() {
          return [];
        },
        getQuickInfoAtPosition() {
          return undefined;
        },
        getCompletionsAtPosition() {
          return {
            entries: [
              { name: "@click", kind: "property", sortText: "2" },
              { name: "class", kind: "property", sortText: "3" },
            ],
          };
        },
      },
    });

    const completions = wrapped.getCompletionsAtPosition("/virtual/merge.tsx", source.indexOf("@cl") + 3);

    assert.deepStrictEqual(
      completions.entries.map((entry) => entry.name),
      ["@click", "class"],
    );
  });

  it("adds contextual boolean completions for known tags", () => {
    const source = "<suspense-boundary ?re />";
    const snapshots = new Map([["/virtual/bool.tsx", source]]);

    const pluginModule = plugin({
      typescript: {
        ScriptSnapshot: {
          fromString(value) {
            return {
              getLength() {
                return value.length;
              },
              getText(start, end) {
                return value.slice(start, end);
              },
            };
          },
        },
      },
    });

    const wrapped = pluginModule.create({
      languageServiceHost: {
        getScriptSnapshot(fileName) {
          const text = snapshots.get(fileName);
          if (text == null) {
            return undefined;
          }

          return {
            getLength() {
              return text.length;
            },
            getText(start, end) {
              return text.slice(start, end);
            },
          };
        },
      },
      languageService: {
        getSyntacticDiagnostics() {
          return [];
        },
        getSemanticDiagnostics() {
          return [];
        },
        getSuggestionDiagnostics() {
          return [];
        },
        getQuickInfoAtPosition() {
          return undefined;
        },
        getCompletionsAtPosition() {
          return null;
        },
      },
    });

    const completions = wrapped.getCompletionsAtPosition("/virtual/bool.tsx", source.indexOf("?re") + 3);

    assert.deepStrictEqual(
      completions.entries.map((entry) => entry.name),
      ["?resolved"],
    );
  });

  it("adds contextual event completions for known tags", () => {
    const source = "<button @cl />";
    const snapshots = new Map([["/virtual/event.tsx", source]]);

    const pluginModule = plugin({
      typescript: {
        ScriptSnapshot: {
          fromString(value) {
            return {
              getLength() {
                return value.length;
              },
              getText(start, end) {
                return value.slice(start, end);
              },
            };
          },
        },
      },
    });

    const wrapped = pluginModule.create({
      languageServiceHost: {
        getScriptSnapshot(fileName) {
          const text = snapshots.get(fileName);
          if (text == null) {
            return undefined;
          }

          return {
            getLength() {
              return text.length;
            },
            getText(start, end) {
              return text.slice(start, end);
            },
          };
        },
      },
      languageService: {
        getSyntacticDiagnostics() {
          return [];
        },
        getSemanticDiagnostics() {
          return [];
        },
        getSuggestionDiagnostics() {
          return [];
        },
        getQuickInfoAtPosition() {
          return undefined;
        },
        getCompletionsAtPosition() {
          return null;
        },
      },
    });

    const completions = wrapped.getCompletionsAtPosition("/virtual/event.tsx", source.indexOf("@cl") + 3);

    assert.deepStrictEqual(
      completions.entries.map((entry) => entry.name),
      ["@click"],
    );
    assert.strictEqual(completions.entries[0].kind, "memberVariableElement");
    assert.deepStrictEqual(completions.entries[0].replacementSpan, {
      start: source.indexOf("@cl") + 1,
      length: "cl".length,
    });
  });

  it("provides completion entry details for contextual LitSX attribute completions", () => {
    const source = "<button @cl />";
    const snapshots = new Map([["/virtual/details.tsx", source]]);

    const pluginModule = plugin({
      typescript: {
        ScriptSnapshot: {
          fromString(value) {
            return {
              getLength() {
                return value.length;
              },
              getText(start, end) {
                return value.slice(start, end);
              },
            };
          },
        },
      },
    });

    const wrapped = pluginModule.create({
      languageServiceHost: {
        getScriptSnapshot(fileName) {
          const text = snapshots.get(fileName);
          if (text == null) {
            return undefined;
          }

          return {
            getLength() {
              return text.length;
            },
            getText(start, end) {
              return text.slice(start, end);
            },
          };
        },
      },
      languageService: {
        getSyntacticDiagnostics() {
          return [];
        },
        getSemanticDiagnostics() {
          return [];
        },
        getSuggestionDiagnostics() {
          return [];
        },
        getQuickInfoAtPosition() {
          return undefined;
        },
        getCompletionsAtPosition() {
          return null;
        },
        getCompletionEntryDetails() {
          return undefined;
        },
      },
    });

    const details = wrapped.getCompletionEntryDetails(
      "/virtual/details.tsx",
      source.indexOf("@cl") + 3,
      "@click",
    );

    assert.ok(details);
    assert.strictEqual(details.name, "@click");
    assert.strictEqual(details.kind, "memberVariableElement");
    assert.strictEqual(details.displayParts[0].text, "@click");
    assert.match(details.documentation[0].text, /LitSX event listener binding for <button>/);
  });

  it("passes through completion details and navigation wrappers when there is no contextual or remapped result", () => {
    const source = `const view = <button @click={handleClick} />;`;
    const snapshots = new Map([["/virtual/details.tsx", source]]);
    const passthroughDetails = {
      name: "class",
      kind: "property",
      displayParts: [{ text: "class", kind: "propertyName" }],
      documentation: [{ text: "plain docs", kind: "text" }],
    };
    const passthroughDefinitionAndBoundSpan = {
      textSpan: { start: 1, length: 2 },
      definitions: undefined,
    };
    const passthroughRenameInfo = {
      canRename: true,
      triggerSpan: undefined,
    };

    const pluginModule = plugin({
      typescript: {
        ScriptKind: {
          TSX: 4,
          JSX: 2,
        },
        ScriptSnapshot: {
          fromString(value) {
            return {
              getLength() {
                return value.length;
              },
              getText(start, end) {
                return value.slice(start, end);
              },
            };
          },
        },
      },
    });

    const wrapped = pluginModule.create({
      languageServiceHost: {
        getScriptSnapshot(fileName) {
          const text = snapshots.get(fileName);
          if (text == null) {
            return undefined;
          }
          return {
            getLength() {
              return text.length;
            },
            getText(start, end) {
              return text.slice(start, end);
            },
          };
        },
      },
      languageService: {
        getSyntacticDiagnostics() {
          return [];
        },
        getSemanticDiagnostics() {
          return [];
        },
        getSuggestionDiagnostics() {
          return [];
        },
        getQuickInfoAtPosition() {
          return undefined;
        },
        getCompletionsAtPosition() {
          return null;
        },
        getCompletionEntryDetails() {
          return passthroughDetails;
        },
        getDefinitionAtPosition() {
          return undefined;
        },
        getDefinitionAndBoundSpan() {
          return passthroughDefinitionAndBoundSpan;
        },
        getReferencesAtPosition() {
          return undefined;
        },
        getRenameInfo() {
          return passthroughRenameInfo;
        },
        findRenameLocations() {
          return undefined;
        },
      },
    });

    assert.deepStrictEqual(
      wrapped.getCompletionEntryDetails("/virtual/details.tsx", source.indexOf("@click"), "class"),
      passthroughDetails,
    );
    assert.strictEqual(
      wrapped.getDefinitionAtPosition("/virtual/details.tsx", source.indexOf("@click")),
      undefined,
    );
    assert.strictEqual(
      wrapped.getReferencesAtPosition("/virtual/details.tsx", source.indexOf("@click")),
      undefined,
    );
    assert.strictEqual(
      wrapped.findRenameLocations("/virtual/details.tsx", source.indexOf("@click"), false, false, false),
      undefined,
    );
    assert.strictEqual(
      wrapped.getRenameInfo("/virtual/details.tsx", source.indexOf("@click")),
      passthroughRenameInfo,
    );
    assert.deepStrictEqual(
      wrapped.getDefinitionAndBoundSpan("/virtual/details.tsx", source.indexOf("@click")),
      passthroughDefinitionAndBoundSpan,
    );
  });

  it("passes through undefined completion details for virtualized files when the language service returns nothing", () => {
    const source = `const view = <button @click={handleClick} />;`;
    const snapshots = new Map([["/virtual/details-undefined.tsx", source]]);

    const pluginModule = plugin({
      typescript: {
        ScriptSnapshot: {
          fromString(value) {
            return {
              getLength() {
                return value.length;
              },
              getText(start, end) {
                return value.slice(start, end);
              },
            };
          },
        },
      },
    });

    const wrapped = pluginModule.create({
      languageServiceHost: {
        getScriptSnapshot(fileName) {
          const text = snapshots.get(fileName);
          if (text == null) {
            return undefined;
          }
          return {
            getLength() {
              return text.length;
            },
            getText(start, end) {
              return text.slice(start, end);
            },
          };
        },
      },
      languageService: {
        getSyntacticDiagnostics() {
          return [];
        },
        getSemanticDiagnostics() {
          return [];
        },
        getSuggestionDiagnostics() {
          return [];
        },
        getQuickInfoAtPosition() {
          return undefined;
        },
        getCompletionsAtPosition() {
          return null;
        },
        getCompletionEntryDetails() {
          return undefined;
        },
      },
    });

    assert.strictEqual(
      wrapped.getCompletionEntryDetails("/virtual/details-undefined.tsx", source.indexOf("@click"), "class"),
      undefined,
    );
  });

  it("passes through non-contextual completion detail requests with short entry names", () => {
    const source = "<button @click={handleClick} />";
    const snapshots = new Map([["/virtual/details-short.tsx", source]]);
    const expected = {
      name: "a",
      kind: "property",
      displayParts: [{ text: "a", kind: "propertyName" }],
      documentation: [{ text: "short name", kind: "text" }],
    };

    const pluginModule = plugin({
      typescript: {
        ScriptSnapshot: {
          fromString(value) {
            return {
              getLength() {
                return value.length;
              },
              getText(start, end) {
                return value.slice(start, end);
              },
            };
          },
        },
      },
    });

    const wrapped = pluginModule.create({
      languageServiceHost: {
        getScriptSnapshot(fileName) {
          const text = snapshots.get(fileName);
          if (text == null) {
            return undefined;
          }

          return {
            getLength() {
              return text.length;
            },
            getText(start, end) {
              return text.slice(start, end);
            },
          };
        },
      },
      languageService: {
        getSyntacticDiagnostics() {
          return [];
        },
        getSemanticDiagnostics() {
          return [];
        },
        getSuggestionDiagnostics() {
          return [];
        },
        getQuickInfoAtPosition() {
          return undefined;
        },
        getCompletionsAtPosition() {
          return null;
        },
        getCompletionEntryDetails() {
          return expected;
        },
      },
    });

    assert.deepStrictEqual(
      wrapped.getCompletionEntryDetails("/virtual/details-short.tsx", source.indexOf("@click"), "a"),
      expected,
    );
  });

  it("reports LitSX script kinds through the wrapped host", () => {
    const pluginModule = plugin({
      typescript: {
        ScriptKind: {
          TSX: 4,
          JSX: 2,
        },
        ScriptSnapshot: {
          fromString(value) {
            return {
              getLength() {
                return value.length;
              },
              getText(start, end) {
                return value.slice(start, end);
              },
            };
          },
        },
      },
    });

    const host = {
      getScriptSnapshot() {
        return undefined;
      },
      getScriptKind(fileName) {
        return fileName.endsWith(".tsx") ? 4 : 1;
      },
    };

    pluginModule.create({
      languageServiceHost: host,
      languageService: {
        getSyntacticDiagnostics() {
          return [];
        },
        getSemanticDiagnostics() {
          return [];
        },
        getSuggestionDiagnostics() {
          return [];
        },
        getQuickInfoAtPosition() {
          return undefined;
        },
        getCompletionsAtPosition() {
          return null;
        },
      },
    });

    assert.strictEqual(host.getScriptKind("/virtual/card.litsx"), 4);
    assert.strictEqual(host.getScriptKind("/virtual/card.litsx.jsx"), 2);
    assert.strictEqual(host.getScriptKind("/virtual/card.tsx"), 4);
    assert.strictEqual(host.getScriptKind("/virtual/card.ts"), 1);
  });

  it("remaps definition, references, and rename spans back to authored positions", () => {
    const source = `
      const handleClick = () => {};
      const view = <button @click={handleClick} />;
    `;
    const virtualSource = createToolingVirtualLitsxSource(source);
    const virtualEventStart = virtualSource.code.indexOf("__litsx_event_click");
    const originalEventStart = source.indexOf("@click");
    const snapshots = new Map([["/virtual/navigation.tsx", source]]);

    const pluginModule = plugin({
      typescript: {
        ScriptSnapshot: {
          fromString(value) {
            return {
              getLength() {
                return value.length;
              },
              getText(start, end) {
                return value.slice(start, end);
              },
            };
          },
        },
      },
    });

    const wrapped = pluginModule.create({
      languageServiceHost: {
        getScriptSnapshot(fileName) {
          const text = snapshots.get(fileName);
          if (text == null) {
            return undefined;
          }

          return {
            getLength() {
              return text.length;
            },
            getText(start, end) {
              return text.slice(start, end);
            },
          };
        },
      },
      languageService: {
        getSyntacticDiagnostics() {
          return [];
        },
        getSemanticDiagnostics() {
          return [];
        },
        getSuggestionDiagnostics() {
          return [];
        },
        getQuickInfoAtPosition() {
          return undefined;
        },
        getCompletionsAtPosition() {
          return null;
        },
        getDefinitionAtPosition() {
          return [
            {
              fileName: "/virtual/navigation.tsx",
              textSpan: {
                start: virtualEventStart,
                length: "__litsx_event_click".length,
              },
              contextSpan: {
                start: virtualEventStart,
                length: "__litsx_event_click".length,
              },
            },
          ];
        },
        getDefinitionAndBoundSpan() {
          return {
            textSpan: {
              start: virtualEventStart,
              length: "__litsx_event_click".length,
            },
            definitions: [
              {
                fileName: "/virtual/navigation.tsx",
                textSpan: {
                  start: virtualEventStart,
                  length: "__litsx_event_click".length,
                },
                originalTextSpan: {
                  start: virtualEventStart,
                  length: "__litsx_event_click".length,
                },
              },
            ],
          };
        },
        getReferencesAtPosition() {
          return [
            {
              fileName: "/virtual/navigation.tsx",
              textSpan: {
                start: virtualEventStart,
                length: "__litsx_event_click".length,
              },
            },
          ];
        },
        getRenameInfo() {
          return {
            canRename: true,
            displayName: "@click",
            fullDisplayName: "@click",
            kind: "property",
            kindModifiers: "",
            triggerSpan: {
              start: virtualEventStart,
              length: "__litsx_event_click".length,
            },
          };
        },
        findRenameLocations() {
          return [
            {
              fileName: "/virtual/navigation.tsx",
              textSpan: {
                start: virtualEventStart,
                length: "__litsx_event_click".length,
              },
              contextSpan: {
                start: virtualEventStart,
                length: "__litsx_event_click".length,
              },
            },
          ];
        },
      },
    });

    const definitions = wrapped.getDefinitionAtPosition("/virtual/navigation.tsx", originalEventStart);
    const definitionAndBoundSpan = wrapped.getDefinitionAndBoundSpan("/virtual/navigation.tsx", originalEventStart);
    const references = wrapped.getReferencesAtPosition("/virtual/navigation.tsx", originalEventStart);
    const renameInfo = wrapped.getRenameInfo("/virtual/navigation.tsx", originalEventStart);
    const renameLocations = wrapped.findRenameLocations("/virtual/navigation.tsx", originalEventStart, false, false, false);

    assert.strictEqual(definitions[0].textSpan.start, originalEventStart);
    assert.strictEqual(definitions[0].textSpan.length, "@click".length);
    assert.strictEqual(definitions[0].contextSpan.start, originalEventStart);
    assert.strictEqual(definitionAndBoundSpan.textSpan.start, originalEventStart);
    assert.strictEqual(definitionAndBoundSpan.definitions[0].textSpan.start, originalEventStart);
    assert.strictEqual(definitionAndBoundSpan.definitions[0].originalTextSpan.start, originalEventStart);
    assert.strictEqual(references[0].textSpan.start, originalEventStart);
    assert.strictEqual(renameInfo.triggerSpan.start, originalEventStart);
    assert.strictEqual(renameLocations[0].textSpan.start, originalEventStart);
    assert.strictEqual(renameLocations[0].contextSpan.start, originalEventStart);
  });

  it("merges authored lit diagnostics into semantic diagnostics", () => {
    const source = '<button @click="handler" />';
    const snapshots = new Map([["/virtual/semantic.tsx", source]]);

    const pluginModule = plugin({
      typescript: {
        DiagnosticCategory: {
          Error: 1,
        },
        ScriptSnapshot: {
          fromString(value) {
            return {
              getLength() {
                return value.length;
              },
              getText(start, end) {
                return value.slice(start, end);
              },
            };
          },
        },
      },
    });

    const wrapped = pluginModule.create({
      languageServiceHost: {
        getScriptSnapshot(fileName) {
          const text = snapshots.get(fileName);
          if (text == null) {
            return undefined;
          }

          return {
            getLength() {
              return text.length;
            },
            getText(start, end) {
              return text.slice(start, end);
            },
          };
        },
      },
      languageService: {
        getSyntacticDiagnostics() {
          return [];
        },
        getSemanticDiagnostics() {
          return [];
        },
        getSuggestionDiagnostics() {
          return [];
        },
        getQuickInfoAtPosition() {
          return undefined;
        },
        getCompletionsAtPosition() {
          return null;
        },
      },
    });

    const diagnostics = wrapped.getSemanticDiagnostics("/virtual/semantic.tsx");

    assert.strictEqual(diagnostics.length, 1);
    assert.strictEqual(diagnostics[0].source, "@litsx/typescript");
    assert.match(diagnostics[0].messageText, /must use an expression/);
    assert.strictEqual(diagnostics[0].start, source.indexOf("@click"));
  });

  it("does not merge warning-only authored diagnostics into semantic diagnostics", () => {
    const source = `const view = <button @click={handleClick} />;`;
    const fileName = "/virtual/example.tsx";
    const pluginModule = plugin({
      typescript: {
        DiagnosticCategory: {
          Warning: 0,
          Error: 1,
        },
        ScriptSnapshot: {
          fromString(value) {
            return {
              getLength() {
                return value.length;
              },
              getText(start, end) {
                return value.slice(start, end);
              },
            };
          },
        },
      },
    });

    const baseDiagnostics = [{
      start: 1,
      length: 2,
      messageText: "base diagnostic",
      category: 1,
      code: 1000,
    }];

    const wrapped = pluginModule.create({
      languageServiceHost: {
        getScriptSnapshot(requestedFileName) {
          if (requestedFileName !== fileName) {
            return undefined;
          }

          return {
            getLength() {
              return source.length;
            },
            getText(start, end) {
              return source.slice(start, end);
            },
          };
        },
      },
      languageService: {
        getSemanticDiagnostics() {
          return baseDiagnostics;
        },
        getSyntacticDiagnostics() {
          return [];
        },
        getSuggestionDiagnostics() {
          return [];
        },
        getQuickInfoAtPosition() {
          return undefined;
        },
        getCompletionsAtPosition() {
          return null;
        },
      },
    });

    const diagnostics = wrapped.getSemanticDiagnostics(fileName);

    assert.strictEqual(diagnostics.length, 1);
    assert.strictEqual(diagnostics[0].code, baseDiagnostics[0].code);
    assert.strictEqual(diagnostics[0].messageText, baseDiagnostics[0].messageText);
    assert.strictEqual(diagnostics[0].start, baseDiagnostics[0].start);
    assert.strictEqual(diagnostics[0].length, baseDiagnostics[0].length);
  });

  it("returns the original language service when the host cannot provide snapshots", () => {
    const pluginModule = plugin({
      typescript: {
        ScriptSnapshot: {
          fromString(value) {
            return {
              getLength() {
                return value.length;
              },
              getText(start, end) {
                return value.slice(start, end);
              },
            };
          },
        },
      },
    });

    const languageService = {
      marker: "original",
    };

    assert.strictEqual(
      pluginModule.create({
        languageServiceHost: {},
        languageService,
      }),
      languageService,
    );

    assert.strictEqual(
      pluginModule.create({
        languageServiceHost: null,
        languageService,
      }),
      languageService,
    );
  });

  it("surfaces known-tag property warnings through syntactic diagnostics", () => {
    const source = '<input .unknownProp={value} />';
    const snapshots = new Map([["/virtual/warn.tsx", source]]);

    const pluginModule = plugin({
      typescript: {
        DiagnosticCategory: {
          Warning: 0,
          Error: 1,
        },
        ScriptSnapshot: {
          fromString(value) {
            return {
              getLength() {
                return value.length;
              },
              getText(start, end) {
                return value.slice(start, end);
              },
            };
          },
        },
      },
    });

    const wrapped = pluginModule.create({
      languageServiceHost: {
        getScriptSnapshot(fileName) {
          const text = snapshots.get(fileName);
          if (text == null) {
            return undefined;
          }

          return {
            getLength() {
              return text.length;
            },
            getText(start, end) {
              return text.slice(start, end);
            },
          };
        },
      },
      languageService: {
        getSyntacticDiagnostics() {
          return [];
        },
        getSemanticDiagnostics() {
          return [];
        },
        getSuggestionDiagnostics() {
          return [];
        },
        getQuickInfoAtPosition() {
          return undefined;
        },
        getCompletionsAtPosition() {
          return null;
        },
      },
    });

    const diagnostics = wrapped.getSyntacticDiagnostics("/virtual/warn.tsx");

    assert.strictEqual(diagnostics.length, 1);
    assert.strictEqual(diagnostics[0].category, 0);
    assert.strictEqual(diagnostics[0].code, 91004);
    assert.match(diagnostics[0].messageText, /<input>/);
  });

  it("surfaces known-tag boolean warnings through syntactic diagnostics", () => {
    const source = "<input ?hidden={flag} />";
    const snapshots = new Map([["/virtual/bool-warn.tsx", source]]);

    const pluginModule = plugin({
      typescript: {
        DiagnosticCategory: {
          Warning: 0,
          Error: 1,
        },
        ScriptSnapshot: {
          fromString(value) {
            return {
              getLength() {
                return value.length;
              },
              getText(start, end) {
                return value.slice(start, end);
              },
            };
          },
        },
      },
    });

    const wrapped = pluginModule.create({
      languageServiceHost: {
        getScriptSnapshot(fileName) {
          const text = snapshots.get(fileName);
          if (text == null) {
            return undefined;
          }

          return {
            getLength() {
              return text.length;
            },
            getText(start, end) {
              return text.slice(start, end);
            },
          };
        },
      },
      languageService: {
        getSyntacticDiagnostics() {
          return [];
        },
        getSemanticDiagnostics() {
          return [];
        },
        getSuggestionDiagnostics() {
          return [];
        },
        getQuickInfoAtPosition() {
          return undefined;
        },
        getCompletionsAtPosition() {
          return null;
        },
      },
    });

    const diagnostics = wrapped.getSyntacticDiagnostics("/virtual/bool-warn.tsx");

    assert.strictEqual(diagnostics.length, 1);
    assert.strictEqual(diagnostics[0].category, 0);
    assert.strictEqual(diagnostics[0].code, 91005);
    assert.match(diagnostics[0].messageText, /<input>/);
  });

  it("surfaces known-tag listener warnings through syntactic diagnostics", () => {
    const source = "<button @submit={handleSubmit} />";
    const snapshots = new Map([["/virtual/event-warn.tsx", source]]);

    const pluginModule = plugin({
      typescript: {
        DiagnosticCategory: {
          Warning: 0,
          Error: 1,
        },
        ScriptSnapshot: {
          fromString(value) {
            return {
              getLength() {
                return value.length;
              },
              getText(start, end) {
                return value.slice(start, end);
              },
            };
          },
        },
      },
    });

    const wrapped = pluginModule.create({
      languageServiceHost: {
        getScriptSnapshot(fileName) {
          const text = snapshots.get(fileName);
          if (text == null) {
            return undefined;
          }

          return {
            getLength() {
              return text.length;
            },
            getText(start, end) {
              return text.slice(start, end);
            },
          };
        },
      },
      languageService: {
        getSyntacticDiagnostics() {
          return [];
        },
        getSemanticDiagnostics() {
          return [];
        },
        getSuggestionDiagnostics() {
          return [];
        },
        getQuickInfoAtPosition() {
          return undefined;
        },
        getCompletionsAtPosition() {
          return null;
        },
      },
    });

    const diagnostics = wrapped.getSyntacticDiagnostics("/virtual/event-warn.tsx");

    assert.strictEqual(diagnostics.length, 1);
    assert.strictEqual(diagnostics[0].category, 0);
    assert.strictEqual(diagnostics[0].code, 91006);
    assert.match(diagnostics[0].messageText, /<button>/);
  });

  it("surfaces authored warning diagnostics through syntactic diagnostics in jsx files", () => {
    const source = `
      const view = (
        <main>
          <input .valuee={count} />
          <button @clcik={() => save()} />
          <button ?disbled={busy} />
        </main>
      );
    `;
    const snapshots = new Map([["/virtual/warn.jsx", source]]);

    const pluginModule = plugin({
      typescript: {
        DiagnosticCategory: {
          Warning: 0,
          Error: 1,
        },
        ScriptSnapshot: {
          fromString(value) {
            return {
              getLength() {
                return value.length;
              },
              getText(start, end) {
                return value.slice(start, end);
              },
            };
          },
        },
      },
    });

    const wrapped = pluginModule.create({
      languageServiceHost: {
        getScriptSnapshot(fileName) {
          const text = snapshots.get(fileName);
          if (text == null) {
            return undefined;
          }

          return {
            getLength() {
              return text.length;
            },
            getText(start, end) {
              return text.slice(start, end);
            },
          };
        },
      },
      languageService: {
        getSyntacticDiagnostics() {
          return [];
        },
        getSemanticDiagnostics() {
          return [];
        },
        getSuggestionDiagnostics() {
          return [];
        },
        getQuickInfoAtPosition() {
          return undefined;
        },
        getCompletionsAtPosition() {
          return null;
        },
      },
    });

    const syntaxDiagnostics = wrapped.getSyntacticDiagnostics("/virtual/warn.jsx");
    const semanticDiagnostics = wrapped.getSemanticDiagnostics("/virtual/warn.jsx");

    assert.deepStrictEqual(
      syntaxDiagnostics.map((diagnostic) => diagnostic.code).sort(),
      [91004, 91005, 91006],
    );
    assert.ok(syntaxDiagnostics.every((diagnostic) => diagnostic.category === 0));
    assert.deepStrictEqual(semanticDiagnostics, []);
  });

  it("replaces raw jsx parser cascades with authored diagnostics in jsx files", () => {
    const source = `
      const view = (
        <main>
          <input .valuee={count} />
          <button @clcik={() => save()} />
          <button ?disbled={busy} />
        </main>
      );
    `;
    const snapshots = new Map([["/virtual/warn.jsx", source]]);

    const pluginModule = plugin({
      typescript: {
        DiagnosticCategory: {
          Warning: 0,
          Error: 1,
        },
        ScriptSnapshot: {
          fromString(value) {
            return {
              getLength() {
                return value.length;
              },
              getText(start, end) {
                return value.slice(start, end);
              },
            };
          },
        },
      },
    });

    const wrapped = pluginModule.create({
      languageServiceHost: {
        getScriptSnapshot(fileName) {
          const text = snapshots.get(fileName);
          if (text == null) {
            return undefined;
          }

          return {
            getLength() {
              return text.length;
            },
            getText(start, end) {
              return text.slice(start, end);
            },
          };
        },
      },
      languageService: {
        getSyntacticDiagnostics() {
          return [
            {
              code: 2657,
              category: 1,
              start: source.indexOf("<main>"),
              length: "<main>".length,
              messageText: "JSX expressions must have one parent element.",
            },
            {
              code: 1003,
              category: 1,
              start: source.indexOf("@clcik"),
              length: 1,
              messageText: "Identifier expected.",
            },
          ];
        },
        getSemanticDiagnostics() {
          return [];
        },
        getSuggestionDiagnostics() {
          return [];
        },
        getQuickInfoAtPosition() {
          return undefined;
        },
        getCompletionsAtPosition() {
          return null;
        },
      },
    });

    const diagnostics = wrapped.getSyntacticDiagnostics("/virtual/warn.jsx");

    assert.deepStrictEqual(
      diagnostics.map((diagnostic) => diagnostic.code).sort(),
      [91004, 91005, 91006],
    );
  });

  it("deduplicates authored warnings when replacing raw jsx parser cascades in jsx files", () => {
    const fileName = "/virtual/duplicate-warning.jsx";
    const source = "<button @click={handleClick} className=\"cta\" />";
    const authoredDiagnosticsSpy = vi
      .spyOn(virtualSourceModule, "collectLitsxAuthoredDiagnostics")
      .mockReturnValue([
        {
          code: 91008,
          category: 0,
          start: source.indexOf("className"),
          length: "className".length,
          messageText: "duplicate",
        },
        {
          code: 91008,
          category: 0,
          start: source.indexOf("className"),
          length: "className".length,
          messageText: "duplicate",
        },
      ]);

    const pluginModule = plugin({
      typescript: {
        DiagnosticCategory: {
          Warning: 0,
          Error: 1,
        },
        ScriptSnapshot: {
          fromString(value) {
            return {
              getLength() {
                return value.length;
              },
              getText(start, end) {
                return value.slice(start, end);
              },
            };
          },
        },
      },
    });

    try {
      const wrapped = pluginModule.create({
        languageServiceHost: {
          getScriptSnapshot(requestedFileName) {
            if (requestedFileName !== fileName) {
              return undefined;
            }

            return {
              getLength() {
                return source.length;
              },
              getText(start, end) {
                return source.slice(start, end);
              },
            };
          },
        },
        languageService: {
          getSyntacticDiagnostics() {
            return [
              {
                code: 1003,
                category: 1,
                start: source.indexOf("className"),
                length: 1,
                messageText: "raw jsx parse error",
              },
            ];
          },
          getSemanticDiagnostics() {
            return [];
          },
          getSuggestionDiagnostics() {
            return [];
          },
          getQuickInfoAtPosition() {
            return undefined;
          },
          getCompletionsAtPosition() {
            return null;
          },
        },
      });

      const diagnostics = wrapped.getSyntacticDiagnostics(fileName);
      assert.strictEqual(diagnostics.length, 1);
      assert.strictEqual(diagnostics[0].code, 91008);
    } finally {
      authoredDiagnosticsSpy.mockRestore();
    }
  });

  it("reports implicit children misuse as authored diagnostics", () => {
    const unsupportedIssues = collectLitsxAuthoredIssues(`
      export function Panel({ children }) {
        const body = children;
        return <section>{body}</section>;
      }
    `);

    assert.ok(unsupportedIssues.some((issue) => issue.code === 91021));
    assert.ok(unsupportedIssues.some((issue) => issue.code === 91021 && issue.severity === "error"));

    const duplicateIssues = collectLitsxAuthoredIssues(`
      export function Panel({ children }) {
        return <section>{children}{children}</section>;
      }
    `);

    assert.ok(duplicateIssues.some((issue) => issue.code === 91022));
    assert.ok(duplicateIssues.some((issue) => issue.code === 91022 && issue.severity === "error"));
  });

  it("surfaces authored warning diagnostics through syntactic diagnostics in tsx files", () => {
    const source = `
      const view = (
        <main>
          <input .valuee={count} />
          <button @clcik={() => save()} />
          <button ?disbled={busy} />
        </main>
      );
    `;
    const snapshots = new Map([["/virtual/warn.tsx", source]]);

    const pluginModule = plugin({
      typescript: {
        DiagnosticCategory: {
          Warning: 0,
          Error: 1,
        },
        ScriptSnapshot: {
          fromString(value) {
            return {
              getLength() {
                return value.length;
              },
              getText(start, end) {
                return value.slice(start, end);
              },
            };
          },
        },
      },
    });

    const wrapped = pluginModule.create({
      languageServiceHost: {
        getScriptSnapshot(fileName) {
          const text = snapshots.get(fileName);
          if (text == null) {
            return undefined;
          }

          return {
            getLength() {
              return text.length;
            },
            getText(start, end) {
              return text.slice(start, end);
            },
          };
        },
      },
      languageService: {
        getSyntacticDiagnostics() {
          return [];
        },
        getSemanticDiagnostics() {
          return [];
        },
        getSuggestionDiagnostics() {
          return [];
        },
        getQuickInfoAtPosition() {
          return undefined;
        },
        getCompletionsAtPosition() {
          return null;
        },
      },
    });

    const syntaxDiagnostics = wrapped.getSyntacticDiagnostics("/virtual/warn.tsx");
    const semanticDiagnostics = wrapped.getSemanticDiagnostics("/virtual/warn.tsx");

    assert.deepStrictEqual(
      syntaxDiagnostics.map((diagnostic) => diagnostic.code).sort(),
      [91004, 91005, 91006],
    );
    assert.ok(syntaxDiagnostics.every((diagnostic) => diagnostic.category === 0));
    assert.deepStrictEqual(semanticDiagnostics, []);
  });

  it("deduplicates authored warnings that overlap existing syntactic diagnostics in tsx files", () => {
    const fileName = "/virtual/duplicate-warning.tsx";
    const source = "<button className=\"cta\" ?disabled={flag} />";
    const authoredDiagnosticsSpy = vi
      .spyOn(virtualSourceModule, "collectLitsxAuthoredDiagnostics")
      .mockReturnValue([
        {
          code: 91008,
          category: 0,
          start: source.indexOf("className"),
          length: "className".length,
          messageText: "duplicate",
        },
        {
          code: 91005,
          category: 0,
          start: source.indexOf("?disabled"),
          length: "?disabled".length,
          messageText: "unique",
        },
      ]);

    const pluginModule = plugin({
      typescript: {
        DiagnosticCategory: {
          Warning: 0,
          Error: 1,
        },
        ScriptSnapshot: {
          fromString(value) {
            return {
              getLength() {
                return value.length;
              },
              getText(start, end) {
                return value.slice(start, end);
              },
            };
          },
        },
      },
    });

    try {
      const wrapped = pluginModule.create({
        languageServiceHost: {
          getScriptSnapshot(requestedFileName) {
            if (requestedFileName !== fileName) {
              return undefined;
            }

            return {
              getLength() {
                return source.length;
              },
              getText(start, end) {
                return source.slice(start, end);
              },
            };
          },
        },
        languageService: {
          getSyntacticDiagnostics() {
            return [
              {
                code: 91008,
                category: 0,
                start: source.indexOf("className"),
                length: "className".length,
                messageText: "from ts",
              },
            ];
          },
          getSemanticDiagnostics() {
            return [];
          },
          getSuggestionDiagnostics() {
            return [];
          },
          getQuickInfoAtPosition() {
            return undefined;
          },
          getCompletionsAtPosition() {
            return null;
          },
        },
      });

      const diagnostics = wrapped.getSyntacticDiagnostics(fileName);

      assert.strictEqual(diagnostics.filter((diagnostic) => diagnostic.code === 91008).length, 1);
      assert.strictEqual(diagnostics.filter((diagnostic) => diagnostic.code === 91005).length, 1);
    } finally {
      authoredDiagnosticsSpy.mockRestore();
    }
  });

  it("drops raw jsx parser cascades when authored jsx files have no LitSX warnings", () => {
    const source = `const view = <button @click={handleClick} />;`;
    const snapshots = new Map([["/virtual/clean.jsx", source]]);

    const pluginModule = plugin({
      typescript: {
        DiagnosticCategory: {
          Warning: 0,
          Error: 1,
        },
        ScriptSnapshot: {
          fromString(value) {
            return {
              getLength() {
                return value.length;
              },
              getText(start, end) {
                return value.slice(start, end);
              },
            };
          },
        },
      },
    });

    const wrapped = pluginModule.create({
      languageServiceHost: {
        getScriptSnapshot(fileName) {
          const text = snapshots.get(fileName);
          if (text == null) return undefined;
          return {
            getLength() {
              return text.length;
            },
            getText(start, end) {
              return text.slice(start, end);
            },
          };
        },
      },
      languageService: {
        getSyntacticDiagnostics() {
          return [
            {
              code: 1003,
              category: 1,
              start: source.indexOf("@click"),
              length: 1,
              messageText: "Identifier expected.",
            },
          ];
        },
        getSemanticDiagnostics() {
          return [];
        },
        getSuggestionDiagnostics() {
          return [];
        },
        getQuickInfoAtPosition() {
          return undefined;
        },
        getCompletionsAtPosition() {
          return null;
        },
      },
    });

    assert.deepStrictEqual(wrapped.getSyntacticDiagnostics("/virtual/clean.jsx"), []);
  });

  it("remaps suggestion diagnostics and related information", () => {
    const source = `const view = <button @click={handleClick} />;`;
    const virtualSource = createVirtualLitsxJsxSource(source);
    const virtualEventStart = virtualSource.code.indexOf("__litsx_event_click");
    const originalEventStart = source.indexOf("@click");
    const snapshots = new Map([["/virtual/suggestion.tsx", source]]);

    const pluginModule = plugin({
      typescript: {
        ScriptSnapshot: {
          fromString(value) {
            return {
              getLength() {
                return value.length;
              },
              getText(start, end) {
                return value.slice(start, end);
              },
            };
          },
        },
      },
    });

    const wrapped = pluginModule.create({
      languageServiceHost: {
        getScriptSnapshot(fileName) {
          const text = snapshots.get(fileName);
          if (text == null) return undefined;
          return {
            getLength() {
              return text.length;
            },
            getText(start, end) {
              return text.slice(start, end);
            },
          };
        },
      },
      languageService: {
        getSyntacticDiagnostics() {
          return [];
        },
        getSemanticDiagnostics() {
          return [];
        },
        getSuggestionDiagnostics() {
          return [
            {
              code: 80001,
              category: 2,
              start: virtualEventStart,
              length: "__litsx_event_click".length,
              messageText: "Suggestion for __litsx_event_click",
              relatedInformation: [
                {
                  file: { fileName: "/virtual/suggestion.tsx" },
                  start: virtualEventStart,
                  length: "__litsx_event_click".length,
                  messageText: "See __litsx_event_click",
                },
              ],
            },
          ];
        },
        getQuickInfoAtPosition() {
          return undefined;
        },
        getCompletionsAtPosition() {
          return null;
        },
      },
    });

    const diagnostics = wrapped.getSuggestionDiagnostics("/virtual/suggestion.tsx");

    assert.strictEqual(diagnostics[0].start, originalEventStart);
    assert.strictEqual(diagnostics[0].length, "@click".length);
    assert.match(diagnostics[0].messageText, /@click/);
    assert.strictEqual(diagnostics[0].relatedInformation[0].start, originalEventStart);
    assert.match(diagnostics[0].relatedInformation[0].messageText, /@click/);
  });

  it("passes through undefined optional navigation methods", () => {
    const source = `const view = <button @click={handleClick} />;`;
    const snapshots = new Map([["/virtual/optional.tsx", source]]);
    const pluginModule = plugin({
      typescript: {
        ScriptSnapshot: {
          fromString(value) {
            return {
              getLength() {
                return value.length;
              },
              getText(start, end) {
                return value.slice(start, end);
              },
            };
          },
        },
      },
    });

    const wrapped = pluginModule.create({
      languageServiceHost: {
        getScriptSnapshot(fileName) {
          const text = snapshots.get(fileName);
          if (text == null) return undefined;
          return {
            getLength() {
              return text.length;
            },
            getText(start, end) {
              return text.slice(start, end);
            },
          };
        },
      },
      languageService: {
        getSyntacticDiagnostics() {
          return [];
        },
        getSemanticDiagnostics() {
          return [];
        },
        getSuggestionDiagnostics() {
          return [];
        },
        getQuickInfoAtPosition() {
          return undefined;
        },
        getCompletionsAtPosition() {
          return null;
        },
      },
    });

    const position = source.indexOf("@click");
    assert.strictEqual(wrapped.getDefinitionAtPosition("/virtual/optional.tsx", position), undefined);
    assert.strictEqual(wrapped.getDefinitionAndBoundSpan("/virtual/optional.tsx", position), undefined);
    assert.strictEqual(wrapped.getReferencesAtPosition("/virtual/optional.tsx", position), undefined);
    assert.strictEqual(wrapped.getRenameInfo("/virtual/optional.tsx", position), undefined);
    assert.strictEqual(
      wrapped.findRenameLocations("/virtual/optional.tsx", position, false, false, false),
      undefined,
    );
  });

  it("remaps internal virtual names in quick-info text fragments", () => {
    assert.strictEqual(remapVirtualText("__litsx_prop_value"), ".value");
    assert.strictEqual(remapVirtualText("bind __litsx_bool_disabled here"), "bind ?disabled here");
  });

  it("only exposes existing LitSX-relevant files through getExternalFiles", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "litsx-plugin-external-files-"));
    const jsxFile = path.join(tempDir, "view.jsx");
    const tsxFile = path.join(tempDir, "view.tsx");
    const litsxFile = path.join(tempDir, "view.litsx");
    const litsxJsxFile = path.join(tempDir, "view.litsx.jsx");
    const jsFile = path.join(tempDir, "ignored.js");
    const missingJsxFile = path.join(tempDir, "missing.jsx");

    fs.writeFileSync(jsxFile, "const view = <button @click={save} />;");
    fs.writeFileSync(tsxFile, "const view = <button @click={save} />;");
    fs.writeFileSync(litsxFile, "const view = <button @click={save} />;");
    fs.writeFileSync(litsxJsxFile, "const view = <button @click={save} />;");
    fs.writeFileSync(jsFile, "const value = 1;");

    try {
      const pluginModule = plugin({
        typescript: {
          ScriptSnapshot: {
            fromString(value) {
              return value;
            },
          },
        },
      });

      const result = pluginModule.getExternalFiles({
        getFileNames() {
          return [jsxFile, tsxFile, litsxFile, litsxJsxFile, jsFile, missingJsxFile];
        },
      });

      assert.deepStrictEqual(result.sort(), [jsxFile, tsxFile, litsxFile, litsxJsxFile].sort());
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("returns no external files when the project cannot enumerate file names", () => {
    const pluginModule = plugin({
      typescript: {
        ScriptSnapshot: {
          fromString(value) {
            return value;
          },
        },
      },
    });

    assert.deepStrictEqual(pluginModule.getExternalFiles({}), []);
  });

  it("recomputes external files when the project version changes", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "litsx-plugin-external-files-version-"));
    const jsxFile = path.join(tempDir, "view.jsx");
    fs.writeFileSync(jsxFile, "const view = <button @click={save} />;");
    const readSpy = vi.spyOn(fs, "readFileSync");
    let version = "1";

    try {
      const pluginModule = plugin({
        typescript: {
          ScriptSnapshot: {
            fromString(value) {
              return value;
            },
          },
        },
      });

      const project = {
        getProjectVersion() {
          return version;
        },
        getFileNames() {
          return [jsxFile];
        },
      };

      assert.deepStrictEqual(pluginModule.getExternalFiles(project), [jsxFile]);
      version = "2";
      assert.deepStrictEqual(pluginModule.getExternalFiles(project), [jsxFile]);
      assert.strictEqual(readSpy.mock.calls.filter(([fileName]) => fileName === jsxFile).length, 2);
    } finally {
      readSpy.mockRestore();
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("reuses cached external files while the project version is unchanged", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "litsx-plugin-external-files-cache-"));
    const jsxFile = path.join(tempDir, "view.jsx");
    fs.writeFileSync(jsxFile, "const view = <button @click={save} />;");
    const readSpy = vi.spyOn(fs, "readFileSync");

    try {
      const pluginModule = plugin({
        typescript: {
          ScriptSnapshot: {
            fromString(value) {
              return value;
            },
          },
        },
      });

      const project = {
        getProjectVersion() {
          return "1";
        },
        getFileNames() {
          return [jsxFile];
        },
      };

      assert.deepStrictEqual(pluginModule.getExternalFiles(project), [jsxFile]);
      assert.deepStrictEqual(pluginModule.getExternalFiles(project), [jsxFile]);
      assert.strictEqual(readSpy.mock.calls.filter(([fileName]) => fileName === jsxFile).length, 1);
    } finally {
      readSpy.mockRestore();
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("leaves relevant files unvirtualized when they do not use LitSX-authored syntax", () => {
    const source = `const view = <button onClick={handleClick} />;`;
    const snapshots = new Map([["/virtual/plain-react.tsx", source]]);
    const pluginModule = plugin({
      typescript: {
        ScriptSnapshot: {
          fromString(value) {
            return {
              getLength() {
                return value.length;
              },
              getText(start, end) {
                return value.slice(start, end);
              },
            };
          },
        },
      },
    });
    const languageServiceHost = {
      getScriptSnapshot(fileName) {
        const text = snapshots.get(fileName);
        if (text == null) {
          return undefined;
        }

        return {
          getLength() {
            return text.length;
          },
          getText(start, end) {
            return text.slice(start, end);
          },
        };
      },
    };

    pluginModule.create({
      languageServiceHost,
      languageService: {
        getSyntacticDiagnostics() {
          return [];
        },
        getSemanticDiagnostics() {
          return [];
        },
        getSuggestionDiagnostics() {
          return [];
        },
        getQuickInfoAtPosition() {
          return undefined;
        },
        getCompletionsAtPosition() {
          return null;
        },
      },
    });

    const snapshot = languageServiceHost.getScriptSnapshot("/virtual/plain-react.tsx");
    assert.strictEqual(snapshot.getText(0, snapshot.getLength()), source);
  });

  it("resolves .litsx module imports in the TypeScript language-service plugin", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "litsx-plugin-module-resolution-"));
    const entryFile = path.join(tempDir, "entry.tsx");
    const componentFile = path.join(tempDir, "vds-button.litsx");

    try {
      fs.writeFileSync(entryFile, 'import { VdsButton } from "./vds-button.litsx";\n');
      fs.writeFileSync(componentFile, "export const VdsButton = () => <button />;\n");

      const pluginModule = plugin({
        typescript: ts,
      });
      const languageServiceHost = {
        getScriptSnapshot(fileName) {
          if (!fs.existsSync(fileName)) {
            return undefined;
          }
          return ts.ScriptSnapshot.fromString(fs.readFileSync(fileName, "utf8"));
        },
        getScriptKind(fileName) {
          return fileName.endsWith(".tsx") ? ts.ScriptKind.TSX : undefined;
        },
        fileExists(fileName) {
          return fs.existsSync(fileName);
        },
        resolveModuleNames(moduleNames) {
          return moduleNames.map(() => undefined);
        },
      };

      pluginModule.create({
        languageServiceHost,
        languageService: {
          getSyntacticDiagnostics() {
            return [];
          },
          getSemanticDiagnostics() {
            return [];
          },
          getSuggestionDiagnostics() {
            return [];
          },
          getQuickInfoAtPosition() {
            return undefined;
          },
          getCompletionsAtPosition() {
            return null;
          },
        },
      });

      const [resolved] = languageServiceHost.resolveModuleNames(
        ["./vds-button.litsx"],
        entryFile,
      );

      assert.strictEqual(resolved.resolvedFileName, componentFile);
      assert.strictEqual(resolved.extension, ts.Extension.Tsx);
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("virtualizes snapshots for TSX files after wrapping the language service host", () => {
    const source = `const view = <button @click={handleClick} />;`;
    const snapshots = new Map([["/virtual/example.tsx", source]]);
    const pluginModule = plugin({
      typescript: {
        ScriptSnapshot: {
          fromString(value) {
            return {
              getLength() {
                return value.length;
              },
              getText(start, end) {
                return value.slice(start, end);
              },
            };
          },
        },
      },
    });
    const languageServiceHost = {
      getScriptSnapshot(fileName) {
        const text = snapshots.get(fileName);
        if (text == null) {
          return undefined;
        }

        return {
          getLength() {
            return text.length;
          },
          getText(start, end) {
            return text.slice(start, end);
          },
        };
      },
    };

    pluginModule.create({
      languageServiceHost,
      languageService: {
        getSyntacticDiagnostics() {
          return [];
        },
        getSemanticDiagnostics() {
          return [];
        },
        getSuggestionDiagnostics() {
          return [];
        },
        getQuickInfoAtPosition() {
          return undefined;
        },
        getCompletionsAtPosition() {
          return null;
        },
      },
    });

    const snapshot = languageServiceHost.getScriptSnapshot("/virtual/example.tsx");
    assert.match(snapshot.getText(0, snapshot.getLength()), /__litsx_event_click/);
  });

  it("virtualizes snapshots for JSX files without enabling TypeScript-only parser plugins", () => {
    const source = `const view = <button @click={handleClick} />;`;
    const snapshots = new Map([["/virtual/example.jsx", source]]);
    const pluginModule = plugin({
      typescript: {
        ScriptSnapshot: {
          fromString(value) {
            return {
              getLength() {
                return value.length;
              },
              getText(start, end) {
                return value.slice(start, end);
              },
            };
          },
        },
      },
    });
    const languageServiceHost = {
      getScriptSnapshot(fileName) {
        const text = snapshots.get(fileName);
        if (text == null) {
          return undefined;
        }

        return {
          getLength() {
            return text.length;
          },
          getText(start, end) {
            return text.slice(start, end);
          },
        };
      },
    };

    pluginModule.create({
      languageServiceHost,
      languageService: {
        getSyntacticDiagnostics() {
          return [];
        },
        getSemanticDiagnostics() {
          return [];
        },
        getSuggestionDiagnostics() {
          return [];
        },
        getQuickInfoAtPosition() {
          return undefined;
        },
        getCompletionsAtPosition() {
          return null;
        },
      },
    });

    const snapshot = languageServiceHost.getScriptSnapshot("/virtual/example.jsx");
    assert.match(snapshot.getText(0, snapshot.getLength()), /__litsx_event_click/);
  });

  it("typechecks TSX projects through an explicit --project path and respects case-sensitive format hosts", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "litsx-typecheck-project-"));
    const tsconfigPath = path.join(tempDir, "tsconfig.json");
    const filePath = path.join(tempDir, "index.tsx");
    const globalsPath = path.join(tempDir, "global.d.ts");
    const originalWrite = process.stderr.write;
    const originalUseCaseSensitive = ts.sys.useCaseSensitiveFileNames;

    fs.writeFileSync(
      tsconfigPath,
      JSON.stringify({
        compilerOptions: {
          jsx: "preserve",
          noEmit: true,
        },
        include: ["index.tsx", "global.d.ts"],
      }),
    );
    fs.writeFileSync(globalsPath, TEMP_JSX_GLOBALS_DTS);
    fs.writeFileSync(
      filePath,
      `
        const handleClick = () => {};
        export const view = <button @click={handleClick}>Save</button>;
      `,
    );

    process.stderr.write = () => true;
    ts.sys.useCaseSensitiveFileNames = true;

    try {
      assert.equal(runLitsxTypecheck(["--project", tsconfigPath]), 0);
    } finally {
      ts.sys.useCaseSensitiveFileNames = originalUseCaseSensitive;
      process.stderr.write = originalWrite;
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });
});
