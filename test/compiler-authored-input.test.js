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
  it("rejects removed authored binding syntax", () => {
    for (const source of [
      "const view = <button @click={handler} />;",
      "const view = <input .value={value} />;",
      "const view = <input ?disabled={disabled} />;",
      "function View() { static styles = `:host {}`; return <div />; }",
      "function View() { staticProps({ title: String }); return <div />; }",
      "function View() { staticStyles(`:host {}`); return <div />; }",
      "function View() { __litsx_static_properties({ title: String }); return <div />; }",
    ]) {
      assert.throws(() => prepareLitsxAuthoredInput(source, {
        filename: "/virtual/View.tsx",
      }));
    }
  });

  it("normalizes parser plugins from filenames and JSX requirements", () => {
    assert.deepStrictEqual(
      ensureLitsxParserPlugins("/virtual/File.tsx"),
      ["typescript"]
    );
    assert.deepStrictEqual(
      ensureLitsxParserPlugins("/virtual/File.ts"),
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
    assert.deepStrictEqual(
      ensureLitsxParserPlugins("/virtual/File.litsx"),
      []
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

  it("collects generic module analysis facts from authored input", () => {
    const source = [
      'import type { StoryObj } from "storybook";',
      'import { VdsButton } from "./vds-button.tsx";',
      "const localMeta = { title: 'Components/Button' };",
      "const LocalStory = () => <VdsButton label={'Save'} />;",
      "export default localMeta;",
      "export const Playground = {",
      "  render: (args) => <LocalStory {...args} />,",
      "};",
      "export { VdsButton as ButtonHost };",
    ].join("\n");

    const result = prepareLitsxAuthoredInput(source, {
      filename: "/virtual/vds-button.stories.tsx",
    });

    assert.deepStrictEqual(result.moduleAnalysis.imports, [
      {
        source: "storybook",
        kind: "type",
        specifiers: [{ importedName: "StoryObj", localName: "StoryObj", kind: "type" }],
      },
      {
        source: "./vds-button.tsx",
        kind: "value",
        specifiers: [{ importedName: "VdsButton", localName: "VdsButton", kind: "value" }],
      },
    ]);
    assert.deepStrictEqual(result.moduleAnalysis.exports, [
      { exportName: "default", localName: "localMeta", kind: "default-object" },
      { exportName: "Playground", localName: "Playground", kind: "named-object" },
      { exportName: "ButtonHost", localName: "VdsButton", kind: "unknown" },
    ]);
    assert.deepStrictEqual(result.moduleAnalysis.declarations, [
      { localName: "localMeta", kind: "const-object" },
      { localName: "LocalStory", kind: "const-arrow-function" },
      { localName: "Playground", kind: "const-object" },
    ]);
    assert.deepStrictEqual(result.moduleAnalysis.jsxReferences, [
      {
        localName: "VdsButton",
        tagName: "vds-button",
        source: "imported-authored-module",
        importSource: "./vds-button.tsx",
      },
      {
        localName: "LocalStory",
        tagName: "local-story",
        source: "local-declaration",
        importSource: null,
      },
    ]);
  });

  it("applies authoring plugins through the provided runtime transform", () => {
    const source = "export const TestExample = () => <x-box />;";
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
        filename: "/virtual/TestExample.jsx",
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
        prepareLitsxAuthoredInput("export const TestExample = () => <div />;", {
          filename: "/virtual/TestExample.jsx",
          authoringPlugins: [() => ({ visitor: {} })],
        }),
      /requires runtime\.transformFromAstSync/
    );
  });

  it("builds compiler config with standard parsing and normalized output plugins", () => {
    const source = "export const TestExample = () => <button class='cta'>Save</button>;";
    const result = createLitsxTransformConfig(source, {
      filename: "/virtual/TestExample.jsx",
      sourceMaps: true,
      outputPlugins: null,
    });

    assert.ok(result.inputAst);
    assert.ok(!Object.hasOwn(result.babelOptions, "inputSourceMap"));
    assert.strictEqual(result.babelOptions.sourceMaps, true);
    assert.ok(Array.isArray(result.babelOptions.plugins));
  });

  it("reuses feature and authored-input caches inside a compilation session", () => {
    const source = "export const TestExample = () => <button class='cta'>Save</button>;";
    const session = createLitsxCompilationSession({
      transformOptions: {
        jsxTemplate: false,
      },
    });

    try {
      const first = createLitsxTransformConfig(source, {
        filename: "/virtual/TestExample.jsx",
        __litsxCompilationSession: session,
      });
      const second = createLitsxTransformConfig(source, {
        filename: "/virtual/TestExample.jsx",
        __litsxCompilationSession: session,
      });

    assert.strictEqual(first.inputAst, second.inputAst);
    assert.strictEqual(first.filename, second.filename);
      assert.strictEqual(first.moduleAnalysis, second.moduleAnalysis);
    } finally {
      session.dispose();
    }
  });

  it("runs the async compiler path without the final template pass", async () => {
    const result = await transformLitsx(
      "export const TestExample = () => <button>Save</button>;",
      {
        filename: "/virtual/TestExample.jsx",
        jsxTemplate: false,
      }
    );

    assert.match(result.code, /export const TestExample = \(\) => <button>Save<\/button>;/);
    assert.strictEqual(result.map, null);
  });

  it("parses TypeScript-only imports in authored .ts modules", async () => {
    const result = await transformLitsx(
      [
        'import type { ItemId } from "./item-id.js";',
        'import { getItem, type Item } from "./items.js";',
        "export const item: Item = getItem({} as ItemId);",
      ].join("\n"),
      {
        filename: "/virtual/src/models/items.ts",
        jsxTemplate: false,
      }
    );

    assert.match(result.code, /import \{ getItem \} from "\.\/items\.js";/);
    assert.match(result.code, /export const item = getItem\(\{\}\);/);
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
        assert.strictEqual(session.typescriptSession.kind, "project");
        assert.strictEqual(session.projectPath, tsconfigPath);
      } finally {
        session.dispose();
      }
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("builds final-template plugin arrays when jsx template options are provided", () => {
    const source = "export const TestExample = () => <button class='cta'>Save</button>;";
    const config = createLitsxTransformConfig(source, {
      filename: "/virtual/TestExample.jsx",
      jsxTemplateOptions: { preserveComments: true },
      outputPlugins: [() => ({ visitor: {} })],
    });

    assert.strictEqual(config.shouldRunFinalTemplatePass, true);
    assert.strictEqual(config.finalTemplatePlugins.length, 2);
  });
});
