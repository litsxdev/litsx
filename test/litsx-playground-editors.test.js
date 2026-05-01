// @vitest-environment jsdom

import assert from "assert";
import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { describe, expect, it, vi } from "vitest";
import {
  createEmittedEditorState,
  createSourceEditorState,
  foldSourceEditorHoists,
  setEditorDocument,
} from "../packages/litsx-playground/src/litsx-playground-editors.js";

describe("@litsx/playground editors", () => {
  it("notifies source editor changes only when the document changes", () => {
    const onChange = vi.fn();
    const view = new EditorView({
      state: createSourceEditorState("export const Demo = () => <button />;", onChange),
      parent: document.body.appendChild(document.createElement("div")),
    });

    try {
      view.dispatch({
        selection: { anchor: 0 },
      });
      expect(onChange).not.toHaveBeenCalled();

      view.dispatch({
        changes: {
          from: 0,
          to: 0,
          insert: "const ready = true;\n",
        },
      });
      expect(onChange).toHaveBeenCalledWith(
        "const ready = true;\nexport const Demo = () => <button />;",
      );
    } finally {
      view.destroy();
    }
  });

  it("folds authored hoists only when a view and foldable hoists are present", () => {
    const dispatch = vi.fn();
    const noHoistView = {
      state: EditorState.create({
        doc: "const value = 1;",
      }),
      dispatch,
    };

    foldSourceEditorHoists(null);
    foldSourceEditorHoists(noHoistView);
    expect(dispatch).not.toHaveBeenCalled();

    const hoistView = {
      state: createSourceEditorState("^styles(`:host { display: block; }`);\nreturn <div />;", vi.fn()),
      dispatch,
    };

    foldSourceEditorHoists(hoistView);
    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(dispatch.mock.calls[0][0].effects.length).toBeGreaterThan(0);
  });

  it("updates emitted editor documents only when content changes", () => {
    const state = createEmittedEditorState("export const current = true;");
    const view = {
      state,
      dispatch: vi.fn(),
    };

    setEditorDocument(view, "export const current = true;");
    expect(view.dispatch).not.toHaveBeenCalled();

    setEditorDocument(view, "export const current = false;");
    expect(view.dispatch).toHaveBeenCalledWith({
      changes: {
        from: 0,
        to: "export const current = true;".length,
        insert: "export const current = false;",
      },
    });

    assert.strictEqual(state.facet(EditorState.readOnly), true);
  });
});
