import assert from "assert";
import fs from "fs";
import os from "os";
import path from "path";
import { describe, it } from "vitest";

import parser from "./helpers/litsx-parser.js";
import {
  ensureLitsxParserPlugins,
  prepareLitsxAuthoredInput,
} from "../packages/compiler/src/authored-input.js";
import {
  createLitsxTransformConfig,
} from "../packages/compiler/src/index.js";
import { createLitsxCompilationSession, transformLitsx } from "../packages/compiler/src/index.js";

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

  it("reuses feature and authored-input caches inside a compilation session", () => {
    const source = "export const Example = () => <button class='cta'>Save</button>;";
    const session = createLitsxCompilationSession({
      transformOptions: {
        jsxTemplate: false,
      },
    });

    try {
      const first = createLitsxTransformConfig(source, {
        filename: "/virtual/Example.jsx",
        __litsxCompilationSession: session,
      });
      const second = createLitsxTransformConfig(source, {
        filename: "/virtual/Example.jsx",
        __litsxCompilationSession: session,
      });

      assert.strictEqual(first.inputAst, second.inputAst);
      assert.strictEqual(first.filename, second.filename);
    } finally {
      session.dispose();
    }
  });

  it("runs the async compiler path without the final template pass", async () => {
    const result = await transformLitsx(
      "export const Example = () => <button>Save</button>;",
      {
        filename: "/virtual/Example.jsx",
        jsxTemplate: false,
      }
    );

    assert.match(result.code, /export const Example = \(\) => <button>Save<\/button>;/);
    assert.strictEqual(result.map, null);
  });

  it("creates project-backed compilation sessions and defaults getTypecheckSession to the project path", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "litsx-compiler-project-"));

    try {
      const tsconfigPath = path.join(tempDir, "tsconfig.json");
      fs.writeFileSync(tsconfigPath, JSON.stringify({
        compilerOptions: {
          allowJs: true,
          jsx: "preserve",
          module: "esnext",
          target: "esnext",
        },
        include: ["src/**/*"],
      }));

      const session = createLitsxCompilationSession({
        projectPath: tsconfigPath,
        transformOptions: { jsxTemplate: false },
      });

      try {
        const typecheck = session.getTypecheckSession();
        assert.strictEqual(typecheck.projectSession, session.typescriptSession);
        assert.strictEqual(session.projectPath, tsconfigPath);
      } finally {
        session.dispose();
      }
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("builds final-template plugin arrays when jsx template options are provided", () => {
    const source = "export const Example = () => <button class='cta'>Save</button>;";
    const config = createLitsxTransformConfig(source, {
      filename: "/virtual/Example.jsx",
      jsxTemplateOptions: { preserveComments: true },
      outputPlugins: [() => ({ visitor: {} })],
    });

    assert.strictEqual(config.shouldRunFinalTemplatePass, true);
    assert.strictEqual(config.finalTemplatePlugins.length, 2);
  });
});
