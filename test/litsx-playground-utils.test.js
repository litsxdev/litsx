import assert from "assert";
import { EditorState } from "@codemirror/state";
import { describe, expect, it, vi } from "vitest";
import {
  buildPreviewDocument,
  createFallbackPreviewDocument,
  currentEmittedOutput,
  previewRuntimeUrls,
  readPreviewMessage,
} from "../packages/litsx-playground/src/litsx-playground-preview.js";
import {
  createEmittedEditorState,
  createSourceEditorState,
  setEditorDocument,
} from "../packages/litsx-playground/src/litsx-playground-editors.js";
import { playgroundStyles } from "../packages/litsx-playground/src/litsx-playground-styles.js";

describe("@litsx/playground utilities", () => {
  it("prefers compile and preview failures over emitted output", () => {
    assert.strictEqual(
      currentEmittedOutput("Compile failed", "", "", "export const ok = true;"),
      "Compile failed"
    );
    assert.strictEqual(
      currentEmittedOutput("", "Stack trace", "Preview failed", "export const ok = true;"),
      "Stack trace\n\nPreview failed"
    );
    assert.strictEqual(
      currentEmittedOutput("", "", "", "export const ok = true;"),
      "export const ok = true;"
    );
  });

  it("builds preview documents with runtime imports and escaped inline modules", () => {
    const doc = buildPreviewDocument(
      'export const Demo = class Demo {}; document.body.innerHTML = "</script><div>ok</div>";',
      "Demo",
      "demo-preview",
      "preview-1"
    );

    assert.match(doc, /"litsx":/);
    assert.match(doc, /"litsx\/context":/);
    assert.match(doc, /"@litsx\/light-dom-registry":/);
    assert.match(doc, /demo-preview/);
    assert.match(doc, /Preview export not found: Demo/);
    assert.match(doc, /<\\\\\/script><div>ok<\/div>/);
    assert.strictEqual(previewRuntimeUrls.litsx.endsWith("/playground-runtime.js"), true);
  });

  it("normalizes preview bridge payloads and rejects unrelated messages", () => {
    assert.deepStrictEqual(
      readPreviewMessage(
        {
          data: {
            previewId: "preview-1",
            type: "litsx-playground-preview-height",
            height: 0,
          },
        },
        "preview-1"
      ),
      {
        type: "litsx-playground-preview-height",
        height: 1,
      }
    );

    assert.deepStrictEqual(
      readPreviewMessage(
        {
          data: {
            previewId: "preview-1",
            type: "litsx-playground-preview-width",
            width: 320.2,
          },
        },
        "preview-1"
      ),
      {
        type: "litsx-playground-preview-width",
        width: 320.2,
      }
    );

    assert.deepStrictEqual(
      readPreviewMessage(
        {
          data: {
            previewId: "preview-1",
            type: "litsx-playground-preview-error",
          },
        },
        "preview-1"
      ),
      {
        type: "litsx-playground-preview-error",
        message: "Unknown preview error.",
      }
    );

    assert.strictEqual(
      readPreviewMessage(
        {
          data: {
            previewId: "other-preview",
            type: "litsx-playground-preview-height",
            height: 10,
          },
        },
        "preview-1"
      ),
      null
    );
    assert.strictEqual(
      readPreviewMessage(
        {
          data: {
            previewId: "preview-1",
            type: "litsx-playground-preview-width",
            width: Number.NaN,
          },
        },
        "preview-1"
      ),
      null
    );
    assert.strictEqual(
      readPreviewMessage(
        {
          data: {
            previewId: "preview-1",
            type: "litsx-playground-preview-height",
            height: "tall",
          },
        },
        "preview-1"
      ),
      null
    );
    assert.strictEqual(
      readPreviewMessage(
        {
          data: {
            previewId: "preview-1",
            type: "unknown",
          },
        },
        "preview-1"
      ),
      null
    );
  });

  it("creates fallback preview documents with a default placeholder", () => {
    assert.match(createFallbackPreviewDocument("Boom"), /Boom/);
    assert.match(createFallbackPreviewDocument(""), /Compiling\.\.\./);
  });

  it("creates source and emitted editor states with the expected facets", () => {
    const sourceState = createSourceEditorState(
      "export function Demo() { return <p>Hello</p>; }",
      vi.fn()
    );
    const emittedState = createEmittedEditorState("export const Demo = true;");

    assert.strictEqual(
      sourceState.doc.toString(),
      "export function Demo() { return <p>Hello</p>; }"
    );
    assert.strictEqual(emittedState.doc.toString(), "export const Demo = true;");
    assert.strictEqual(emittedState.facet(EditorState.readOnly), true);
  });

  it("updates editor documents only when the content changes", () => {
    const dispatch = vi.fn();
    const view = {
      state: {
        doc: {
          toString: () => "const current = true;",
        },
      },
      dispatch,
    };

    setEditorDocument(view, "const current = true;");
    expect(dispatch).not.toHaveBeenCalled();

    setEditorDocument(view, "const current = false;");
    expect(dispatch).toHaveBeenCalledWith({
      changes: {
        from: 0,
        to: "const current = true;".length,
        insert: "const current = false;",
      },
    });

    setEditorDocument(null, "ignored");
    expect(dispatch).toHaveBeenCalledTimes(1);
  });

  it("exposes playground styles", () => {
    assert.match(playgroundStyles, /\.litsx-playground__workspace/);
    assert.match(playgroundStyles, /\.litsx-playground__signature/);
  });
});
