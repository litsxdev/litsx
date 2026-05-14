import assert from "assert";
import fs from "fs";
import os from "os";
import path from "path";
import ts from "typescript";
import { describe, it } from "vitest";

import { createLitsxEditorSession } from "../packages/typescript-plugin-litsx/src/editor-session.js";

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

describe("@litsx/typescript-plugin editor-session", () => {
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
});
