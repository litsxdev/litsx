import assert from "assert";
import * as babelParser from "@babel/parser";
import fs from "fs";
import os from "os";
import path from "path";
import ts from "typescript";
import { describe, it, vi } from "vitest";
import * as virtualSourceModule from "../packages/typescript-plugin-litsx/src/virtual-source.js";

import plugin, {
  collectLitsxAuthoredDiagnostics,
  createToolingVirtualLitsxSource,
  createVirtualLitsxJsxSource,
  decodeVirtualAttributeName,
  getLitsxAttributeCompletionNames,
  inferLitsxAttributeInfoAtPosition,
  inferLitsxAttributeCompletionContext,
  looksLikeLitsxJsx,
  mapOriginalPositionToVirtual,
  mapOriginalPositionToToolingVirtual,
  remapVirtualText,
  remapTextSpanToOriginal,
  remapToolingTextSpanToOriginal,
  runLitsxTypecheck,
} from "../packages/typescript-plugin-litsx/src/index.js";

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
    const typecheckModule = await import("../packages/typescript-plugin-litsx/src/typecheck.js");
    return await callback(typecheckModule, actualTs.default, actualTs);
  } finally {
    vi.doUnmock("typescript");
    vi.resetModules();
  }
}

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

  it("uses JS-safe tooling stubs for static hoists in jsx files", () => {
    const source = `
      function Card() {
        ^styles(\`:host { display: block; }\`);
        ^lightDom();
        return <div />;
      }
    `;

    const result = createToolingVirtualLitsxSource(source);

    assert.match(result.toolingPreamble, /function __litsx_static_lightDom\(\) \{\}/);
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

  it("typechecks a LitSX-authored .litsx project end-to-end", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "litsx-typecheck-valid-litsx-"));
    const tsconfigPath = path.join(tempDir, "tsconfig.json");
    const filePath = path.join(tempDir, "index.litsx");
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
        include: ["index.litsx"],
      }),
    );
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

  it("typechecks a LitSX-authored .litsx.jsx project end-to-end", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "litsx-typecheck-valid-litsx-jsx-"));
    const tsconfigPath = path.join(tempDir, "tsconfig.json");
    const filePath = path.join(tempDir, "index.litsx.jsx");
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
        include: ["index.litsx.jsx"],
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

  it("typechecks jsx projects that use static hoists", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "litsx-typecheck-hoists-"));
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
        export const Card = ({ title = "Smoke" }) => {
          ^styles(\`:host { display: block; }\`);
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
        "../packages/typescript-plugin-litsx/src/virtual-source.js"
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
          "../packages/typescript-plugin-litsx/src/typecheck.js"
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

  it("provides synthetic quick info for static hoists without exposing tooling stubs", () => {
    const source = `
      export const Card = () => {
        ^styles(\`:host { display: block; }\`);
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

    const quickInfo = wrapped.getQuickInfoAtPosition("/virtual/hoist-hover.tsx", source.indexOf("^styles") + 2);

    assert.ok(quickInfo);
    assert.deepStrictEqual(quickInfo.textSpan, {
      start: source.indexOf("^styles"),
      length: "^styles".length,
    });
    assert.strictEqual(quickInfo.displayParts[0].text, "^styles");
    assert.match(quickInfo.documentation[0].text, /static style hoist/i);
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
      start: source.indexOf("@cl"),
      length: "@cl".length,
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
    assert.strictEqual(diagnostics[0].source, "@litsx/typescript-plugin");
    assert.match(diagnostics[0].messageText, /must use an expression/);
    assert.strictEqual(diagnostics[0].start, source.indexOf("@click"));
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
