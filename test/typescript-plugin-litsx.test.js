import assert from "assert";
import * as babelParser from "@babel/parser";
import fs from "fs";
import os from "os";
import path from "path";
import ts from "typescript";
import { describe, it, vi } from "vitest";

import plugin, {
  collectLitsxAuthoredDiagnostics,
  createToolingVirtualLitsxSource,
  createVirtualLitsxJsxSource,
  decodeVirtualAttributeName,
  getLitsxAttributeCompletionNames,
  inferLitsxAttributeCompletionContext,
  looksLikeLitsxJsx,
  mapOriginalPositionToVirtual,
  mapOriginalPositionToToolingVirtual,
  remapVirtualText,
  remapTextSpanToOriginal,
  remapToolingTextSpanToOriginal,
  runLitsxTypecheck,
} from "../packages/typescript-plugin-litsx/src/index.js";

describe("@litsx/typescript-plugin", () => {
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
          ^styles(\`:host { display: block; }\`);
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

    assert.strictEqual(diagnostics.length, 1);
    assert.strictEqual(diagnostics[0].code, 91007);
    assert.match(diagnostics[0].messageText, /must appear as a top-level statement in the component body/);
  });

  it("does not report authored diagnostics for top-level static hoists", () => {
    const source = `
      function Card() {
        ^styles(\`:host { display: block; }\`);
        ^shadowRootOptions({ mode: "open" });
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

  it("declares ^lightDom() without an argument in tooling virtual source", () => {
    const source = `
      function Card() {
        ^lightDom();
        return <div />;
      }
    `;

    const result = createToolingVirtualLitsxSource(source, {
      plugins: ["typescript"],
    });

    assert.match(result.toolingPreamble, /declare function __litsx_static_lightDom\(\): void;/);
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
    assert.match(diagnostics[0].messageText, /known Litsx property set for <input>/);
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
    assert.match(diagnostics[0].messageText, /known Litsx boolean attribute set for <input>/);
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
    assert.match(diagnostics[0].messageText, /known Litsx event set for <button>/);
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
    });
    assert.deepStrictEqual(propContext, {
      tagName: "input",
      prefix: ".",
      partialName: "va",
    });
    assert.deepStrictEqual(boolContext, {
      tagName: "suspense-list",
      prefix: "?",
      partialName: "hi",
    });
    assert.deepStrictEqual(getLitsxAttributeCompletionNames(eventContext), ["@click"]);
    assert.deepStrictEqual(getLitsxAttributeCompletionNames(propContext), [".value", ".valueAsNumber"]);
    assert.deepStrictEqual(getLitsxAttributeCompletionNames(boolContext), ["?hidden"]);
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
      }),
      [".value"],
    );
    assert.deepStrictEqual(
      getLitsxAttributeCompletionNames({
        tagName: "demo-card",
        prefix: "#",
        partialName: "x",
      }),
      [],
    );
    assert.deepStrictEqual(
      inferLitsxAttributeCompletionContext("< @cli", "< @cli".length),
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
        ^styles(\`:host { display: block; }\`);
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
        ^styles(\`:host { display: block; }\`);
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

  it("returns no authored diagnostics for parse failures", () => {
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

    assert.deepStrictEqual(parseFailureDiagnostics, []);
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
        include: ["index.jsx"],
      }),
    );
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
      const actualTs = await vi.importActual("typescript");

      vi.resetModules();
      vi.doMock("typescript", () => {
        const mockedTs = {
          ...actualTs.default,
          parseCommandLine() {
            return {
              errors: [
                {
                  category: actualTs.default.DiagnosticCategory.Error,
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
        };

        return {
          ...mockedTs,
          default: mockedTs,
        };
      });

      process.stderr.write = () => {
        writes += 1;
        return true;
      };

      try {
        const { runLitsxTypecheck: mockedRunLitsxTypecheck } = await import(
          "../packages/typescript-plugin-litsx/src/typecheck.js"
        );
        assert.equal(mockedRunLitsxTypecheck(["--synthetic"]), 1);
        assert.equal(writes, 0);
      } finally {
        process.stderr.write = originalWrite;
        vi.doUnmock("typescript");
        vi.resetModules();
      }
    })();
  });

  it("reports real TypeScript diagnostics through the CLI entrypoint after remapping virtualized source", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "litsx-typecheck-diagnostic-"));
    const tsconfigPath = path.join(tempDir, "tsconfig.json");
    const filePath = path.join(tempDir, "index.jsx");
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
        include: ["index.jsx"],
      }),
    );
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
              getSourceFile(fileName) {
                return {
                  originalFileName: fileName,
                };
              },
            };
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
            });
            const created = host.getSourceFile(jsxFile, actualTs.default.ScriptTarget.Latest);
            assert.ok(created.text.includes("__litsx_event_click"));
            return { mocked: true };
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
          "../packages/typescript-plugin-litsx/src/typecheck.js"
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
    assert.strictEqual(diagnostic.messageText.messageText, "__litsx_event_click is wrong");
    assert.strictEqual(diagnostic.messageText.next[0].messageText, "__litsx_event_click follow-up");
    assert.strictEqual(diagnostic.relatedInformation[0].messageText, "__litsx_event_click related");
    assert.strictEqual(diagnostic.relatedInformation[0].start, 1);
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
    assert.strictEqual(diagnostics[0].source, "@litsx/typescript-plugin");
    assert.match(diagnostics[0].messageText, /must use an expression/);
    assert.strictEqual(diagnostics[0].start, source.indexOf("@click"));
  });

  it("surfaces known-tag property warnings through semantic diagnostics", () => {
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

    const diagnostics = wrapped.getSemanticDiagnostics("/virtual/warn.tsx");

    assert.strictEqual(diagnostics.length, 1);
    assert.strictEqual(diagnostics[0].category, 0);
    assert.strictEqual(diagnostics[0].code, 91004);
    assert.match(diagnostics[0].messageText, /<input>/);
  });

  it("surfaces known-tag boolean warnings through semantic diagnostics", () => {
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

    const diagnostics = wrapped.getSemanticDiagnostics("/virtual/bool-warn.tsx");

    assert.strictEqual(diagnostics.length, 1);
    assert.strictEqual(diagnostics[0].category, 0);
    assert.strictEqual(diagnostics[0].code, 91005);
    assert.match(diagnostics[0].messageText, /<input>/);
  });

  it("surfaces known-tag listener warnings through semantic diagnostics", () => {
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

    const diagnostics = wrapped.getSemanticDiagnostics("/virtual/event-warn.tsx");

    assert.strictEqual(diagnostics.length, 1);
    assert.strictEqual(diagnostics[0].category, 0);
    assert.strictEqual(diagnostics[0].code, 91006);
    assert.match(diagnostics[0].messageText, /<button>/);
  });

  it("remaps internal virtual names in quick-info text fragments", () => {
    assert.strictEqual(remapVirtualText("__litsx_prop_value"), ".value");
    assert.strictEqual(remapVirtualText("bind __litsx_bool_disabled here"), "bind ?disabled here");
  });

  it("only exposes existing JSX and TSX files through getExternalFiles", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "litsx-plugin-external-files-"));
    const jsxFile = path.join(tempDir, "view.jsx");
    const tsxFile = path.join(tempDir, "view.tsx");
    const jsFile = path.join(tempDir, "ignored.js");
    const missingJsxFile = path.join(tempDir, "missing.jsx");

    fs.writeFileSync(jsxFile, "const view = <button @click={save} />;");
    fs.writeFileSync(tsxFile, "const view = <button @click={save} />;");
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
          return [jsxFile, tsxFile, jsFile, missingJsxFile];
        },
      });

      assert.deepStrictEqual(result.sort(), [jsxFile, tsxFile].sort());
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
    const originalWrite = process.stderr.write;
    const originalUseCaseSensitive = ts.sys.useCaseSensitiveFileNames;

    fs.writeFileSync(
      tsconfigPath,
      JSON.stringify({
        compilerOptions: {
          jsx: "preserve",
          noEmit: true,
        },
        include: ["index.tsx"],
      }),
    );
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
