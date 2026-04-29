import assert from "assert";
import { describe, it } from "vitest";

import parser from "../packages/babel-parser-litsx/src/index.mjs";
import {
  ensureLitsxParserPlugins,
  prepareLitsxAuthoredInput,
} from "../packages/compiler/src/authored-input.js";
import {
  createLitsxTransformConfig,
} from "../packages/compiler/src/index.js";

describe("compiler authored input helpers", () => {
  it("normalizes parser plugins from filenames and JSX requirements", () => {
    assert.deepStrictEqual(
      ensureLitsxParserPlugins("/virtual/File.tsx"),
      ["typescript"]
    );
    assert.deepStrictEqual(
      ensureLitsxParserPlugins("/virtual/File.jsx", [], { requireJsx: true }),
      ["jsx"]
    );
    assert.deepStrictEqual(
      ensureLitsxParserPlugins("/virtual/File.jsx", [["jsx", { runtime: "automatic" }]], {
        requireJsx: true,
      }),
      [["jsx", { runtime: "automatic" }]]
    );
    assert.deepStrictEqual(
      ensureLitsxParserPlugins("/virtual/File.jsx", ["typescript"], {
        requireJsx: true,
      }),
      ["typescript", "jsx"]
    );
  });

  it("collects native className and React memo authored warnings", () => {
    const source = [
      "import React, { memo } from 'react';",
      "const Button = memo(() => <button className='cta'>Save</button>, () => true);",
      "const AnotherButton = React.memo(() => <button className='ghost'>Cancel</button>);",
    ].join("\n");

    const result = prepareLitsxAuthoredInput(source, {
      filename: "/virtual/Button.jsx",
    });

    const warningCodes = result.authoredWarnings
      .map((warning) => warning.code)
      .sort((left, right) => String(left).localeCompare(String(right)));

    assert.deepStrictEqual(warningCodes, [
      91016,
      91016,
      91017,
      "LITSX_NATIVE_CLASSNAME",
      "LITSX_NATIVE_CLASSNAME",
    ].sort((left, right) => String(left).localeCompare(String(right))));
  });

  it("applies authoring plugins through the provided runtime transform", () => {
    const source = "export const Example = () => <x-box />;";
    let transformCalls = 0;

    const renameIntrinsicPlugin = ({ types: t }) => ({
      visitor: {
        JSXIdentifier(path) {
          if (path.node.name === "x-box") {
            path.replaceWith(t.jsxIdentifier("button"));
          }
        },
      },
    });

    const result = prepareLitsxAuthoredInput(
      source,
      {
        filename: "/virtual/Example.jsx",
        authoringPlugins: [renameIntrinsicPlugin],
      },
      {
        transformFromAstSync(ast, inputSource, options) {
          transformCalls += 1;
          return {
            ast: parser.parse(inputSource, {
              sourceType: "module",
              plugins: ["jsx"],
            }),
          };
        },
      }
    );

    assert.strictEqual(transformCalls, 1);
    assert.ok(result.inputAst);
  });

  it("throws when authoring plugins are provided without a sync transform runtime", () => {
    assert.throws(
      () =>
        prepareLitsxAuthoredInput("export const Example = () => <div />;", {
          filename: "/virtual/Example.jsx",
          authoringPlugins: [() => ({ visitor: {} })],
        }),
      /requires runtime\.transformFromAstSync/
    );
  });

  it("builds compiler config with virtualization sourcemaps and normalized output plugins", () => {
    const source = "export const Example = () => <button class='cta'>Save</button>;";
    const result = createLitsxTransformConfig(source, {
      filename: "/virtual/Example.jsx",
      sourceMaps: true,
      outputPlugins: null,
    });

    assert.ok(result.inputAst);
    assert.strictEqual(result.babelOptions.inputSourceMap, undefined);
    assert.strictEqual(result.babelOptions.sourceMaps, true);
    assert.ok(Array.isArray(result.babelOptions.plugins));
  });
});
