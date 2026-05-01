import assert from "assert";
import fs from "fs";
import os from "os";
import path from "path";
import { describe, it } from "vitest";
import {
  computeLitsxCompletions,
  computeLitsxHover,
  computeLitsxProjectCompletions,
  computeLitsxProjectDiagnostics,
  computeLitsxProjectHover,
  getParserPlugins,
} from "../packages/vscode-litsx/src/editor-support.js";

function createCompletionKinds() {
  return {
    CompletionItemKind: {
      Keyword: 14,
      Variable: 6,
      Property: 10,
      Function: 3,
      Class: 7,
      Interface: 8,
      Module: 9,
      Text: 0,
      Event: 23,
    },
  };
}

describe("vscode-litsx editor support", () => {
  it("returns null hover and empty completions when the cursor is outside LitSX syntax", async () => {
    const sourceText = "const value = count + 1;";

    const hover = await computeLitsxHover(sourceText, "litsx", sourceText.indexOf("count"));
    const completions = await computeLitsxCompletions(
      sourceText,
      "litsx",
      sourceText.indexOf("count") + 2,
      {
        CompletionItemKind: {
          Event: 23,
          Property: 10,
        },
      },
    );

    assert.strictEqual(hover, null);
    assert.deepStrictEqual(completions, []);
    assert.deepStrictEqual(getParserPlugins("litsx"), ["typescript"]);
    assert.deepStrictEqual(getParserPlugins("litsx-jsx"), []);
  });

  it("returns property hover and property completions for dot bindings", async () => {
    const sourceText = "const view = <input .val />;";
    const hover = await computeLitsxHover(sourceText, "litsx", sourceText.indexOf(".val") + 1);
    const completions = await computeLitsxCompletions(
      sourceText,
      "litsx",
      sourceText.indexOf(".val") + 4,
      {
        CompletionItemKind: {
          Event: 23,
          Property: 10,
        },
      },
    );

    assert.match(hover.code, /\.val: property/);
    assert.match(hover.documentation, /property binding/);
    assert.ok(completions.some((entry) => entry.label === ".value" && entry.kind === 10));
  });

  it("supports standalone .litsx.jsx diagnostics, hover, and completions without a tsconfig", async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "litsx-vscode-jsx-"));
    const filePath = path.join(tempDir, "component.litsx.jsx");
    const sourceText = [
      "const busy = true;",
      "const view = <button ?dis @cl />;",
      "",
    ].join("\n");

    fs.writeFileSync(filePath, sourceText);

    const diagnostics = await computeLitsxProjectDiagnostics(filePath, sourceText, "litsx-jsx");
    const boolPosition = sourceText.indexOf("?dis") + 1;
    const hover = await computeLitsxProjectHover(filePath, sourceText, "litsx-jsx", boolPosition);
    const completions = await computeLitsxProjectCompletions(
      filePath,
      sourceText,
      "litsx-jsx",
      sourceText.indexOf("?dis") + 4,
      createCompletionKinds(),
    );

    assert.ok(diagnostics.some((diagnostic) => diagnostic.code === 91005));
    assert.match(hover.code, /\?dis|property/);
    assert.ok(completions.some((entry) => entry.label === "?disabled"));
  }, 15000);

  it("uses hoist hover in project mode and keeps project-backed scope completions", async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "litsx-vscode-hoist-"));
    const filePath = path.join(tempDir, "component.litsx");
    const sourceText = [
      "const count = 1;",
      "^styles(`button { color: red; }`);",
      "const view = <button>{count}</button>;",
      "cou",
      "",
    ].join("\n");

    fs.writeFileSync(filePath, sourceText);

    const hover = await computeLitsxProjectHover(
      filePath,
      sourceText,
      "litsx",
      sourceText.indexOf("^styles") + 1,
    );
    const completions = await computeLitsxProjectCompletions(
      filePath,
      sourceText,
      "litsx",
      sourceText.indexOf("cou") + 3,
      createCompletionKinds(),
    );

    assert.match(hover.code, /\^styles/);
    assert.ok(completions.some((entry) => entry.label === "count"));
  });

  it("filters virtual TypeScript noise while preserving real project diagnostics", async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "litsx-vscode-filter-"));
    const filePath = path.join(tempDir, "component.litsx");
    const sourceText = [
      'import { useState } from "litsx";',
      "export const Component = () => {",
      "  const [count] = useState(0);",
      "  return <input .valuee={count} @clcik={() => count.toFixed()} />;",
      "};",
      "",
    ].join("\n");

    fs.writeFileSync(
      path.join(tempDir, "tsconfig.json"),
      JSON.stringify({
        compilerOptions: {
          jsx: "react-jsx",
          jsxImportSource: "litsx",
          target: "ES2022",
          module: "ESNext",
        },
        include: ["component.litsx"],
      }),
    );
    fs.writeFileSync(filePath, sourceText);

    const diagnostics = await computeLitsxProjectDiagnostics(filePath, sourceText, "litsx");
    const completionSourceText = sourceText.replace("@clcik", "@cl");
    const completionPosition = completionSourceText.indexOf("@cl") + 3;
    const completions = await computeLitsxProjectCompletions(
      filePath,
      completionSourceText,
      "litsx",
      completionPosition,
      createCompletionKinds(),
    );

    assert.ok(diagnostics.some((diagnostic) => diagnostic.code === 91004));
    assert.ok(diagnostics.some((diagnostic) => diagnostic.code === 91006));
    assert.ok(
      diagnostics.every((diagnostic) => !String(diagnostic.messageText).includes("__litsx_")),
    );
    assert.ok(completions.every((entry) => !entry.label.startsWith("__litsx_")));
  }, 15000);

  it("falls back to project type hover and scope completions when direct language-service data is missing", async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "litsx-vscode-fallback-"));
    const filePath = path.join(tempDir, "component.litsx");
    const sourceText = [
      "function FooFn() { return 1; }",
      "class FooClass {}",
      "interface FooInterface { value: number; }",
      "namespace FooModule { export const value = 1; }",
      "const FooValue = 1;",
      "const view = <button>{count}</button>;",
      "type Example = Foo",
      "Foo",
      "",
    ].join("\n");

    fs.writeFileSync(filePath, sourceText);

    const hover = await computeLitsxProjectHover(
      filePath,
      sourceText,
      "litsx",
      sourceText.indexOf("FooFn") + 1,
    );
    const completions = await computeLitsxProjectCompletions(
      filePath,
      sourceText,
      "litsx",
      sourceText.lastIndexOf("Foo") + 3,
      createCompletionKinds(),
    );
    const typeCompletions = await computeLitsxProjectCompletions(
      filePath,
      sourceText,
      "litsx",
      sourceText.indexOf("type Example = Foo") + "type Example = Foo".length,
      createCompletionKinds(),
    );

    assert.ok(hover);
    assert.match(hover.code, /FooFn|function/);
    assert.ok(completions.some((entry) => entry.label === "FooFn" && entry.kind === 3));
    assert.ok(completions.some((entry) => entry.label === "FooClass" && entry.kind === 7));
    assert.ok(completions.some((entry) => entry.label === "FooModule" && entry.kind === 9));
    assert.ok(completions.some((entry) => entry.label === "FooValue" && entry.kind === 6));
    assert.ok(typeCompletions.some((entry) => entry.label === "FooInterface" && entry.kind === 8));
  }, 15000);

  it("supports jsconfig-backed .litsx.jsx projects and non-virtualized project diagnostics", async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "litsx-vscode-jsconfig-"));
    const filePath = path.join(tempDir, "component.litsx.jsx");
    const sourceText = [
      "const answer = 42;",
      "const broken = answer();",
      "",
    ].join("\n");

    fs.writeFileSync(
      path.join(tempDir, "jsconfig.json"),
      JSON.stringify({
        compilerOptions: {
          target: "ES2022",
          module: "ESNext",
          checkJs: true,
        },
        include: ["component.litsx.jsx"],
      }),
    );
    fs.writeFileSync(filePath, sourceText);

    const diagnostics = await computeLitsxProjectDiagnostics(filePath, sourceText, "litsx-jsx");
    const hover = await computeLitsxProjectHover(
      filePath,
      sourceText,
      "litsx-jsx",
      sourceText.indexOf("answer") + 1,
    );

    assert.ok(diagnostics.some((diagnostic) => diagnostic.code === 2349));
    assert.match(hover.code, /const answer: 42|const answer: number/);
  }, 15000);

  it("preserves nested TypeScript diagnostic message chains for non-virtualized project files", async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "litsx-vscode-message-chain-"));
    const filePath = path.join(tempDir, "component.litsx");
    const sourceText = [
      "function overload(value: string): void;",
      "function overload(value: number): void;",
      "function overload(value) {}",
      "overload(true);",
      "",
    ].join("\n");

    fs.writeFileSync(
      path.join(tempDir, "tsconfig.json"),
      JSON.stringify({
        compilerOptions: {
          target: "ES2022",
          module: "ESNext",
          strict: true,
        },
        include: ["component.litsx"],
      }),
    );
    fs.writeFileSync(filePath, sourceText);

    const diagnostics = await computeLitsxProjectDiagnostics(filePath, sourceText, "litsx");
    const overloadDiagnostic = diagnostics.find((diagnostic) => diagnostic.code === 2769);

    assert.ok(overloadDiagnostic);
    assert.strictEqual(typeof overloadDiagnostic.messageText, "object");
    assert.strictEqual(overloadDiagnostic.messageText.messageText, "No overload matches this call.");
    assert.ok(overloadDiagnostic.messageText.next?.length);
  }, 15000);

  it("supports authored syntax in standard .tsx files through the extension-based project path", async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "litsx-vscode-tsx-project-"));
    const filePath = path.join(tempDir, "component.tsx");
    const sourceText = [
      "const count = 1;",
      "const view = <input .valuee={count} @clcik={() => count.toFixed()} />;",
      "",
    ].join("\n");

    fs.writeFileSync(
      path.join(tempDir, "tsconfig.json"),
      JSON.stringify({
        compilerOptions: {
          jsx: "preserve",
          target: "ES2022",
          module: "ESNext",
        },
        include: ["component.tsx"],
      }),
    );
    fs.writeFileSync(filePath, sourceText);

    const diagnostics = await computeLitsxProjectDiagnostics(filePath, sourceText, "typescriptreact");

    assert.ok(diagnostics.some((diagnostic) => diagnostic.code === 91004));
    assert.ok(diagnostics.some((diagnostic) => diagnostic.code === 91006));
  }, 15000);
});
