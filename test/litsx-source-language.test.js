// @vitest-environment jsdom

import assert from "assert";
import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { forceLinting, forEachDiagnostic } from "@codemirror/lint";
import { foldable } from "@codemirror/language";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  litsxSourceHighlighting,
  litsxSourceParseStabilizer,
  litsxSourceSupport,
} from "../packages/litsx-playground/src/litsx-source-language.js";

function collectDecorationClasses(view) {
  const pluginValue = view.plugin(litsxSourceHighlighting);
  const classes = [];

  pluginValue.decorations.between(0, view.state.doc.length, (_from, _to, value) => {
    const className = value.spec?.attributes?.class;
    if (className) {
      classes.push(className);
    }
  });

  return classes;
}

describe("@litsx/playground source language", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("finds fold ranges for hoists and ignores non-hoist lines", () => {
    const state = EditorState.create({
      doc: `
^styles(\`
  :host {
    color: \${accent};
  }
  /* keep comments */
\`);
const plain = true;
^shadowRootOptions({
  delegatesFocus: true,
});
^broken(
`,
      extensions: [litsxSourceSupport().extension],
    });

    const stylesLine = state.doc.line(2);
    const plainLine = state.doc.line(8);
    const optionsLine = state.doc.line(9);
    const brokenLine = state.doc.line(12);

    const stylesFold = foldable(state, stylesLine.from);
    const optionsFold = foldable(state, optionsLine.from);

    assert.ok(stylesFold);
    assert.ok(optionsFold);
    assert.strictEqual(foldable(state, plainLine.from), null);
    assert.strictEqual(foldable(state, brokenLine.from), null);
    assert.match(state.doc.sliceString(stylesFold.from, stylesFold.to), /:host/);
    assert.match(state.doc.sliceString(optionsFold.from, optionsFold.to), /delegatesFocus/);
  });

  it("decorates lit-prefixed attributes and CSS fragments in the editor view", () => {
    const view = new EditorView({
      state: EditorState.create({
        doc: `
const shared = css\`
  :host { display: block; color: tomato; }
\`;

function Demo() {
  ^styles(\`
    .panel { padding: 4px; }
  \`);
  return <input .value={value} ?checked={ready} @input={handleInput} class="panel" />;
}
`,
        extensions: [
          litsxSourceSupport().extension,
          litsxSourceHighlighting,
        ],
      }),
      parent: document.body.appendChild(document.createElement("div")),
    });

    try {
      const classes = collectDecorationClasses(view);

      expect(classes).toContain("cm-litsx-lit-attr-prefix");
      expect(classes).toContain("cm-litsx-lit-attr-name");
      expect(classes.some((value) => value.includes("tok-propertyName"))).toBe(true);
      expect(classes.some((value) => value.includes("tok-number"))).toBe(true);
    } finally {
      view.destroy();
    }
  });

  it("reports syntax diagnostics for invalid authored source", async () => {
    const view = new EditorView({
      state: EditorState.create({
        doc: `
function Broken() {
  return <div>{</div>;
}
`,
        extensions: [litsxSourceSupport().extension],
      }),
      parent: document.body.appendChild(document.createElement("div")),
    });

    try {
      forceLinting(view);
      await new Promise((resolve) => setTimeout(resolve, 0));

      const diagnostics = [];
      forEachDiagnostic(view.state, (diagnostic) => {
        diagnostics.push(diagnostic);
      });

      expect(diagnostics.length).toBeGreaterThan(0);
      expect(diagnostics[0].severity).toBe("error");
      expect(diagnostics[0].source).toBe("litsx-source");
      expect(diagnostics[0].message).toMatch(/Unexpected syntax/);
    } finally {
      view.destroy();
    }
  });

  it("schedules reparsing on construction and doc updates, then clears timers on destroy", () => {
    vi.useFakeTimers();

    const view = new EditorView({
      state: EditorState.create({
        doc: `function Demo() { return <p>Hello</p>; }`,
        extensions: [litsxSourceParseStabilizer],
      }),
      parent: document.body.appendChild(document.createElement("div")),
    });

    const pluginValue = view.plugin(litsxSourceParseStabilizer);

    try {
      expect(pluginValue.timeoutId).not.toBe(null);

      vi.runAllTimers();
      expect(pluginValue.timeoutId).toBe(null);

      view.dispatch({
        changes: {
          from: 0,
          to: 0,
          insert: "const changed = true;\n",
        },
      });

      expect(pluginValue.timeoutId).not.toBe(null);

      view.destroy();
      expect(pluginValue.timeoutId).toBe(null);
    } finally {
      if (view.dom.isConnected) {
        view.destroy();
      }
    }
  });
});
