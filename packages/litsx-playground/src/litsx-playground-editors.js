import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { javascript } from "@codemirror/lang-javascript";
import { basicSetup } from "codemirror";
import {
  litsxSourceHighlighting,
  litsxSourceParseStabilizer,
  litsxSourceSupport,
  litsxSourceTheme,
} from "./litsx-source-language.js";

const sourceEditorTheme = EditorView.theme({
  "&": {
    fontSize: "0.9rem",
    backgroundColor: "transparent",
    color: "var(--vp-c-text-1)",
  },
  ".cm-scroller": {
    fontFamily: '"SFMono-Regular", "Menlo", "Monaco", monospace',
    lineHeight: "1.6",
  },
  ".cm-gutters": {
    border: "0",
    backgroundColor: "transparent",
    color: "var(--vp-c-text-3)",
  },
  ".cm-foldGutter .cm-gutterElement": {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  ".cm-activeLineGutter": {
    backgroundColor: "transparent",
  },
  ".cm-activeLine": {
    backgroundColor: "color-mix(in srgb, var(--vp-c-bg-elv) 42%, transparent)",
  },
  ".cm-focused": {
    outline: "none",
  },
  ".cm-selectionBackground, &.cm-focused .cm-selectionBackground, ::selection": {
    backgroundColor: "color-mix(in srgb, var(--vp-c-brand-soft) 80%, transparent)",
  },
});

const emittedEditorTheme = EditorView.theme({
  "&": {
    fontSize: "0.9rem",
    backgroundColor: "transparent",
    color: "var(--vp-c-text-1)",
  },
  ".cm-scroller": {
    fontFamily: '"SFMono-Regular", "Menlo", "Monaco", monospace',
    lineHeight: "1.6",
  },
  ".cm-gutters": {
    border: "0",
    backgroundColor: "transparent",
    color: "var(--vp-c-text-3)",
  },
  ".cm-activeLine, .cm-activeLineGutter": {
    backgroundColor: "transparent",
  },
  ".cm-focused": {
    outline: "none",
  },
});

export function createSourceEditorState(doc, onChange) {
  return EditorState.create({
    doc,
    extensions: [
      basicSetup,
      litsxSourceSupport().extension,
      litsxSourceParseStabilizer,
      litsxSourceHighlighting,
      sourceEditorTheme,
      litsxSourceTheme,
      EditorView.updateListener.of((update) => {
        if (update.docChanged) {
          onChange(update.state.doc.toString());
        }
      }),
    ],
  });
}

export function createEmittedEditorState(doc) {
  return EditorState.create({
    doc,
    extensions: [
      basicSetup,
      javascript({
        jsx: true,
      }),
      emittedEditorTheme,
      EditorState.readOnly.of(true),
      EditorView.editable.of(false),
    ],
  });
}

export function setEditorDocument(view, nextDoc) {
  if (!view) return;
  const currentDoc = view.state.doc.toString();
  if (currentDoc === nextDoc) return;

  view.dispatch({
    changes: {
      from: 0,
      to: currentDoc.length,
      insert: nextDoc,
    },
  });
}
