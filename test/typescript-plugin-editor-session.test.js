import assert from "assert";
import fs from "fs";
import os from "os";
import path from "path";
import ts from "typescript";
import { describe, it } from "vitest";

import { createLitsxEditorSession } from "../packages/typescript/src/editor-session.js";

function createCompletionKinds() {
  return {
    Keyword: 14,
    Variable: 6,
    Property: 10,
    Function: 3,
    Class: 7,
    Interface: 8,
    Module: 9,
    Text: 0,
    Event: 23,
  };
}

describe("@litsx/typescript editor-session", () => {
  it("uses the injected TypeScript module", () => {
    const session = createLitsxEditorSession({
      typescript: ts,
    });

    assert.strictEqual(session.typescript, ts);
  });

  it("provides project-backed diagnostics, hover, and completions", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "litsx-editor-session-"));
    const filePath = path.join(tempDir, "component.litsx");
    const sourceText = [
      "const count: number = 1;",
      "const broken: number = 'nope';",
      "const view = <button @cl>{cou}</button>;",
      "",
    ].join("\n");

    fs.writeFileSync(
      path.join(tempDir, "tsconfig.json"),
      JSON.stringify({
        compilerOptions: {
          jsx: "preserve",
          target: "ES2022",
          module: "ESNext",
          strict: true,
        },
        include: ["component.litsx"],
      }),
    );
    fs.writeFileSync(filePath, sourceText);

    const session = createLitsxEditorSession({ typescript: ts });
    const diagnostics = session.getDiagnostics(filePath, sourceText, "litsx");
    const hover = session.getHover(filePath, sourceText, "litsx", sourceText.indexOf("count") + 1);
    const completions = session.getCompletions(
      filePath,
      sourceText,
      "litsx",
      sourceText.indexOf("@cl") + 3,
      createCompletionKinds(),
    );

    assert.ok(diagnostics.some((diagnostic) => diagnostic.code === 2322));
    assert.match(hover.code, /const count: number/);
    assert.ok(completions.some((entry) => entry.label === "@click" && entry.kind === 23));
    const clickCompletion = completions.find((entry) => entry.label === "@click");
    assert.strictEqual(clickCompletion.insertText, "click");
    assert.strictEqual(clickCompletion.filterText, "click");
  }, 15000);

  it("preserves LitSX import resolution and filters virtual names", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "litsx-editor-session-resolve-"));
    const filePath = path.join(tempDir, "component.litsx");
    const sourceText = [
      'import { buttonLabel } from "./litsx-button";',
      'import { wrongButtonLabel } from "./litsx-button.litsx.jsx";',
      "const view = <input .valuee={buttonLabel} @cl />;",
      "wrongButtonLabel;",
      "",
    ].join("\n");

    fs.writeFileSync(
      path.join(tempDir, "tsconfig.json"),
      JSON.stringify({
        compilerOptions: {
          jsx: "preserve",
          target: "ES2022",
          module: "ESNext",
          strict: true,
        },
        include: ["component.litsx", "litsx-button.litsx"],
      }),
    );
    fs.writeFileSync(
      path.join(tempDir, "litsx-button.litsx"),
      [
        'export const buttonLabel = "Primary";',
        "",
      ].join("\n"),
    );
    fs.writeFileSync(filePath, sourceText);

    const session = createLitsxEditorSession({ typescript: ts });
    const diagnostics = session.getDiagnostics(filePath, sourceText, "litsx");
    const completions = session.getCompletions(
      filePath,
      sourceText,
      "litsx",
      sourceText.indexOf("@cl") + 3,
      createCompletionKinds(),
    );

    assert.ok(diagnostics.some((diagnostic) => diagnostic.code === 91004));
    assert.ok(
      diagnostics.some((diagnostic) => (
        diagnostic.code === 2307 &&
        String(diagnostic.messageText).includes("./litsx-button.litsx.jsx")
      )),
    );
    assert.ok(completions.every((entry) => !entry.label.startsWith("__litsx_")));
  }, 15000);

  it("prefers markup-facing completions in opening tags", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "litsx-editor-session-markup-"));
    const filePath = path.join(tempDir, "component.litsx");
    const sourceText = "const view = <button  />;\n";

    fs.writeFileSync(
      path.join(tempDir, "tsconfig.json"),
      JSON.stringify({
        compilerOptions: {
          jsx: "preserve",
          target: "ES2022",
          module: "ESNext",
          strict: true,
        },
        include: ["component.litsx"],
      }),
    );
    fs.writeFileSync(filePath, sourceText);

    const session = createLitsxEditorSession({ typescript: ts });
    const completions = session.getCompletions(
      filePath,
      sourceText,
      "litsx",
      sourceText.indexOf("<button ") + "<button ".length,
      createCompletionKinds(),
    );

    assert.deepStrictEqual(
      completions.slice(0, 8).map((entry) => entry.label),
      ["class", "id", "title", "style", "role", "slot", "part", "tabIndex"],
    );
    assert.ok(completions.some((entry) => entry.label === "@click"));
    assert.ok(completions.some((entry) => entry.label === "?disabled"));
    assert.ok(!completions.some((entry) => entry.label === "_currentTarget"));
    assert.ok(!completions.some((entry) => entry.label === "addEventListener"));
  }, 15000);

  it("accepts click listeners on interactive intrinsic elements", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "litsx-editor-session-input-click-"));
    const filePath = path.join(tempDir, "component.litsx");
    const sourceText = [
      "const count = 1;",
      "const view = <input .value={count} @click={() => count.toFixed()} ?disabled />;",
      "",
    ].join("\n");

    fs.writeFileSync(
      path.join(tempDir, "tsconfig.json"),
      JSON.stringify({
        compilerOptions: {
          jsx: "preserve",
          target: "ES2022",
          module: "ESNext",
          strict: true,
        },
        include: ["component.litsx"],
      }),
    );
    fs.writeFileSync(filePath, sourceText);

    const session = createLitsxEditorSession({ typescript: ts });
    const diagnostics = session.getDiagnostics(filePath, sourceText, "litsx");

    assert.ok(!diagnostics.some((diagnostic) => diagnostic.code === 91006));
  }, 15000);

  it("keeps markup completions available after handler expressions inside the same opening tag", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "litsx-editor-session-after-handler-"));
    const filePath = path.join(tempDir, "component.litsx");
    const sourceText = [
      "const count = 1;",
      "const view = <input .value={count} @click={() => count.toFixed()}  />;",
      "",
    ].join("\n");

    fs.writeFileSync(
      path.join(tempDir, "tsconfig.json"),
      JSON.stringify({
        compilerOptions: {
          jsx: "preserve",
          target: "ES2022",
          module: "ESNext",
          strict: true,
        },
        include: ["component.litsx"],
      }),
    );
    fs.writeFileSync(filePath, sourceText);

    const session = createLitsxEditorSession({ typescript: ts });
    const completions = session.getCompletions(
      filePath,
      sourceText,
      "litsx",
      sourceText.indexOf("/>") - 1,
      createCompletionKinds(),
    );

    assert.ok(completions.some((entry) => entry.label === "@click"));
    assert.ok(completions.some((entry) => entry.label === "?disabled"));
    assert.ok(completions.some((entry) => entry.label === "class"));
  }, 15000);

  it("surfaces imported component props in opening tags", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "litsx-editor-session-component-props-"));
    const componentFilePath = path.join(tempDir, "button.litsx");
    const filePath = path.join(tempDir, "component.litsx");
    const sourceText = [
      'import { Button } from "./button.litsx";',
      "const view = <Button  />;",
      "",
    ].join("\n");

    fs.writeFileSync(
      path.join(tempDir, "tsconfig.json"),
      JSON.stringify({
        compilerOptions: {
          jsx: "react-jsx",
          jsxImportSource: "@litsx/core",
          target: "ES2022",
          module: "ESNext",
          strict: true,
          moduleResolution: "Bundler",
          allowArbitraryExtensions: true,
        },
        include: ["*.litsx"],
      }),
    );
    fs.writeFileSync(
      componentFilePath,
      "export const Button = ({ kind = 'primary', disabled = false, count = 0 } = {}) => <button>{kind}{count}</button>;\n",
    );
    fs.writeFileSync(filePath, sourceText);

    const session = createLitsxEditorSession({ typescript: ts });
    const completions = session.getCompletions(
      filePath,
      sourceText,
      "litsx",
      sourceText.indexOf("<Button ") + "<Button ".length,
      createCompletionKinds(),
    );

    assert.deepStrictEqual(
      completions.slice(0, 3).map((entry) => entry.label),
      ["count", "disabled", "kind"],
    );
  }, 15000);

  it("falls back to static properties hoists for component prop completions when typed props are absent", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "litsx-editor-session-static-props-"));
    const componentFilePath = path.join(tempDir, "button.litsx");
    const filePath = path.join(tempDir, "component.litsx");
    const sourceText = [
      'import { Button } from "./button.litsx";',
      "const view = <Button  />;",
      "",
    ].join("\n");

    fs.writeFileSync(
      path.join(tempDir, "tsconfig.json"),
      JSON.stringify({
        compilerOptions: {
          jsx: "react-jsx",
          jsxImportSource: "@litsx/core",
          target: "ES2022",
          module: "ESNext",
          strict: true,
          moduleResolution: "Bundler",
          allowArbitraryExtensions: true,
        },
        include: ["*.litsx"],
      }),
    );
    fs.writeFileSync(
      componentFilePath,
      [
        "export const Button = () => {",
        "  static properties = {",
        "    label: { type: String },",
        "    kind: { type: String },",
        "    disabled: { type: Boolean },",
        "  };",
        "  return <button />;",
        "};",
        "",
      ].join("\n"),
    );
    fs.writeFileSync(filePath, sourceText);

    const session = createLitsxEditorSession({ typescript: ts });
    const completions = session.getCompletions(
      filePath,
      sourceText,
      "litsx",
      sourceText.indexOf("<Button ") + "<Button ".length,
      createCompletionKinds(),
    );

    assert.ok(completions.some((entry) => entry.label === "label"));
    assert.ok(completions.some((entry) => entry.label === "kind"));
    assert.ok(completions.some((entry) => entry.label === "disabled"));
  }, 15000);

  it("infers emitted component events for listener completions on imported LitSX components", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "litsx-editor-session-component-events-"));
    const componentFilePath = path.join(tempDir, "button.litsx");
    const filePath = path.join(tempDir, "consumer.litsx");
    const sourceText = [
      'import { Button } from "./button.litsx";',
      "const view = <Button @pr />;",
      "",
    ].join("\n");

    fs.writeFileSync(
      path.join(tempDir, "tsconfig.json"),
      JSON.stringify({
        compilerOptions: {
          jsx: "react-jsx",
          jsxImportSource: "@litsx/core",
          target: "ES2022",
          module: "ESNext",
          strict: true,
          moduleResolution: "Bundler",
          allowArbitraryExtensions: true,
        },
        include: ["*.litsx"],
      }),
    );
    fs.writeFileSync(
      componentFilePath,
      [
        'import { useEmit } from "@litsx/core";',
        "",
        "export const Button = () => {",
        "  const emit = useEmit();",
        '  emit("primary-action");',
        '  emit("secondary-action");',
        "  return <button />;",
        "};",
        "",
      ].join("\n"),
    );
    fs.writeFileSync(filePath, sourceText);

    const session = createLitsxEditorSession({ typescript: ts });
    const completions = session.getCompletions(
      filePath,
      sourceText,
      "litsx",
      sourceText.indexOf("@pr") + 3,
      createCompletionKinds(),
    );

    assert.ok(completions.some((entry) => entry.label === "@primary-action"));
    assert.ok(!completions.some((entry) => entry.label === "@secondary-action"));
  }, 15000);

  it("prioritizes @litsx/core exports over noisy globals in component bodies", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "litsx-editor-session-uses-"));
    const packageDir = path.join(tempDir, "node_modules", "@litsx");
    const filePath = path.join(tempDir, "component.litsx");
    const sourceText = "export function Component() { useS }\n";

    fs.mkdirSync(packageDir, { recursive: true });
    fs.symlinkSync(path.join(process.cwd(), "packages", "core"), path.join(packageDir, "core"), "dir");
    fs.writeFileSync(
      path.join(tempDir, "tsconfig.json"),
      JSON.stringify({
        compilerOptions: {
          jsx: "react-jsx",
          jsxImportSource: "@litsx/core",
          target: "ES2022",
          module: "ESNext",
          moduleResolution: "Bundler",
          allowArbitraryExtensions: true,
        },
        include: ["component.litsx"],
      }),
    );
    fs.writeFileSync(filePath, sourceText);

    const session = createLitsxEditorSession({ typescript: ts });
    const completions = session.getCompletions(
      filePath,
      sourceText,
      "litsx",
      sourceText.indexOf("useS") + 4,
      createCompletionKinds(),
    );

    const topTen = completions.slice(0, 10).map((entry) => entry.label);
    assert.ok(topTen.includes("useState"));
    assert.ok(topTen.every((label) => label.startsWith("use")));
    assert.ok(completions.findIndex((entry) => entry.label === "useState") < completions.findIndex((entry) => entry.label === "AbortController"));
    const useStateCompletion = completions.find((entry) => entry.label === "useState");
    assert.ok(useStateCompletion.additionalTextEdits?.some((edit) => (
      edit.newText.includes('import { useState } from "@litsx/core";')
    )));
    assert.ok(!completions.some((entry) => entry.label === "__litsx_static_styles"));
  }, 15000);

  it("surfaces jsxImportSource exports for bare use-prefix completions", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "litsx-editor-session-demo-"));
    const packageDir = path.join(tempDir, "node_modules", "@litsx");
    const filePath = path.join(tempDir, "component.litsx");
    const sourceText = [
      "const count = 1;",
      "",
      "function Demo() {",
      "  static styles = `:host { display: block; }`;",
      "",
      "  use",
      "  ",
      "  return <input .value={count} @click={() => count.toFixed()} ?disabled />;",
      "}",
      "",
    ].join("\n");

    fs.mkdirSync(packageDir, { recursive: true });
    fs.symlinkSync(path.join(process.cwd(), "packages", "core"), path.join(packageDir, "core"), "dir");
    fs.writeFileSync(
      path.join(tempDir, "tsconfig.json"),
      JSON.stringify({
        compilerOptions: {
          jsx: "react-jsx",
          jsxImportSource: "@litsx/core",
          target: "ES2022",
          module: "ESNext",
          moduleResolution: "Bundler",
          allowArbitraryExtensions: true,
        },
        include: ["component.litsx"],
      }),
    );
    fs.writeFileSync(filePath, sourceText);

    const session = createLitsxEditorSession({ typescript: ts });
    const completions = session.getCompletions(
      filePath,
      sourceText,
      "litsx",
      sourceText.indexOf("use") + 3,
      createCompletionKinds(),
    );

    const topTen = completions.slice(0, 10).map((entry) => entry.label);
    assert.ok(topTen.includes("useHost"));
    assert.ok(topTen.every((label) => label.startsWith("use")));
    assert.ok(completions.findIndex((entry) => entry.label === "useState") < completions.findIndex((entry) => entry.label === "UserActivation"));
  }, 15000);

  it("suppresses customElements.define false positives for imported .litsx components", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "litsx-editor-session-story-"));
    const componentFilePath = path.join(tempDir, "button.litsx");
    const storyFilePath = path.join(tempDir, "button.stories.litsx");

    fs.writeFileSync(
      path.join(tempDir, "tsconfig.json"),
      JSON.stringify({
        compilerOptions: {
          jsx: "react-jsx",
          jsxImportSource: "@litsx/core",
          target: "ES2022",
          module: "ESNext",
        },
        include: ["*.litsx"],
      }),
    );
    fs.writeFileSync(
      componentFilePath,
      [
        "export const LitsxButton = ({ label = '' } = {}) => {",
        "  return <button>{label}</button>;",
        "};",
        "",
      ].join("\n"),
    );
    const storySource = [
      'import { LitsxButton } from "./button.litsx";',
      "",
      'if (!customElements.get("litsx-button")) {',
      '  customElements.define("litsx-button", LitsxButton);',
      "}",
      "",
    ].join("\n");
    fs.writeFileSync(storyFilePath, storySource);

    const session = createLitsxEditorSession({ typescript: ts });
    const diagnostics = session.getDiagnostics(storyFilePath, storySource, "litsx");

    assert.ok(!diagnostics.some((diagnostic) => diagnostic.code === 2345));
  }, 15000);
});
