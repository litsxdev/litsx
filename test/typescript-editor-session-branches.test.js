import assert from "node:assert";
import path from "node:path";
import os from "node:os";
import { describe, it } from "vitest";
import ts from "typescript";

import { createLitsxEditorSession } from "../packages/typescript/src/editor-session.js";

describe("@litsx/typescript editor-session boundary inputs", () => {
  it("handles alternate JSX language identifiers, inert loggers, and unrelated files", () => {
    const fileName = path.join(os.tmpdir(), "litsx-editor-branches.litsx.jsx");
    const source = "const view = <button title=\"ready\" />;\n";
    const session = createLitsxEditorSession({
      typescript: ts,
      trace: true,
      logger: {},
    });

    const diagnostics = session.getDiagnostics(fileName, source, "litsx-jsx");
    const hover = session.getHover(fileName, source, "litsx-jsx", source.indexOf("view") + 1);
    const completions = session.getCompletions(
      fileName,
      source,
      "litsx-jsx",
      source.indexOf("<button ") + "<button ".length,
      { Property: "property" },
    );

    assert.ok(Array.isArray(diagnostics));
    assert.match(hover.markdown, /```jsx/);
    assert.ok(completions.some((entry) => entry.label === "class" && entry.kind === "property"));
    assert.deepStrictEqual(
      session.getDiagnostics(path.join(os.tmpdir(), "litsx-editor-branches.json"), "{}", "json"),
      [],
    );

    const authoredJsFile = path.join(os.tmpdir(), "litsx-editor-authored.js");
    const authoredJsSource = "const view = <input @click={() => {}} />;\n";
    assert.ok(Array.isArray(
      session.getDiagnostics(authoredJsFile, authoredJsSource, "litsx"),
    ));
    assert.match(
      session.getHover(
        authoredJsFile,
        authoredJsSource,
        "litsx",
        authoredJsSource.indexOf("view") + 1,
      ).markdown,
      /```tsx/,
    );
  });
});
