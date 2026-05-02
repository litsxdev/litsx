import assert from "assert";
import fs from "fs";
import path from "path";
import * as babelCore from "@babel/core";
import { ensureSyntaxTree, foldable, syntaxTree } from "@codemirror/language";
import parser from "../packages/babel-parser-litsx/src/index.mjs";
import { PLAYGROUND_TYPE_FILES } from "../packages/litsx-playground/src/virtual-types.js";
import { createSourceEditorState } from "../packages/litsx-playground/src/litsx-playground-editors.js";
import { createFallbackPreviewDocument } from "../packages/litsx-playground/src/litsx-playground-preview.js";
import { createVirtualLitsxJsxSource } from "../packages/jsx-authoring/src/index.js";
import {
  litDirectivesExampleSource,
  primitivesExampleSource,
  staticExposeExampleSource,
  useAsyncStateExampleSource,
  useEmitExampleSource,
  useOptimisticExampleSource,
} from "../website/docs/.vitepress/theme/components/playground-example-source.js";
import { beforeAll, describe, it } from "vitest";
import { interopDefault } from "./helpers/interop-default.js";

const { transformFromAstSync } = babelCore;

const playgroundPath = path.join(
  process.cwd(),
  "packages/litsx-playground/src/LitsxPlayground.tsx"
);
const playgroundHooksPath = path.join(
  process.cwd(),
  "packages/litsx-playground/src/litsx-playground-hooks.tsx"
);
const playgroundPreviewPath = path.join(
  process.cwd(),
  "packages/litsx-playground/src/litsx-playground-preview.js"
);

let nativePreset;

beforeAll(async () => {
  nativePreset = interopDefault(
    await import("../packages/babel-preset-litsx/src/index.js")
  );
});

function transformDocsComponent(source, filename) {
  const virtualSource = createVirtualLitsxJsxSource(source).code;
  const ast = parser.parse(virtualSource, {
    sourceType: "module",
    plugins: ["typescript"],
  });

  return transformFromAstSync(ast, virtualSource, {
    filename,
    configFile: false,
    babelrc: false,
    presets: [[nativePreset, {
      typeResolutionMode: "in-memory",
      inMemoryFiles: PLAYGROUND_TYPE_FILES,
    }]],
  }).code;
}

describe("LitsxPlayground docs component", () => {
  it("compiles the real playground shell through the docs pipeline", () => {
    const source = fs.readFileSync(playgroundPath, "utf8");
    const code = transformDocsComponent(source, playgroundPath);

    assert.match(code, /import \{ LitsxStaticHoistsMixin \} from "litsx\/runtime-infrastructure";/);
    assert.match(code, /export class LitsxPlayground extends LitsxStaticHoistsMixin\(LitElement\)/);
    assert.match(code, /customElements\.define\("litsx-playground", LitsxPlayground\)/);
    assert.match(code, /prepareEffects\(this\);/);
    assert.match(code, /static get styles\(\)/);
    assert.match(code, /const hostContent = useHostContent\(this, \{\s*trim: true\s*\}\);/);
    assert.match(code, /const slottedSource = hostContent\.text;/);
    assert.match(code, /const \{[\s\S]*cancel: cancelScheduledCompile[\s\S]*schedule: scheduleCompile[\s\S]*\} = useDebouncedAction\(this, 220\);/);
    assert.match(code, /useCallbackRef\(this, \(\) => this\.[_A-Za-z0-9]+Element, node => sourceEditorElement\.current = node\);/);
    assert.match(code, /useCallbackRef\(this, \(\) => this\.[_A-Za-z0-9]+Element, node => emittedEditorElement\.current = node\);/);
    assert.match(code, /useCallbackRef\(this, \(\) => this\.[_A-Za-z0-9]+Element, node => previewFrame\.current = node\);/);
    assert.match(code, /const \[activeEditorPanel, setActiveEditorPanel\] = useState<"source" \| "emitted">\(this, "source"\);/);
    assert.match(code, /usePlaygroundEditorsAndWorker\(this, \{/);
    assert.match(code, /function createPreviewInstanceId\(\) \{/);
    assert.match(code, /const previewInstanceId = useRef\(this, createPreviewInstanceId\(\)\);/);
    assert.match(code, /const previousFullscreenRef = useRef<boolean \| null>\(this, null\);/);
    assert.match(code, /const previewId = `\$\{previewInstanceId\.current\}-preview-\$\{iframeVersion\}`;/);
    assert.match(code, /const isResetDisabled = source === initialSourceRef\.current;/);
    assert.doesNotMatch(code, /ensurePreviewRuntimeUrls\(\)/);
    assert.match(code, /buildPreviewDocument\(emittedCode, this\.exportName, this\.previewTagName, previewId\)/);
    assert.match(code, /usePlaygroundPreviewMessages\(this, previewFrame, previewId, setPreviewHeight, setPreviewWidth, setPreviewError\);/);
    assert.match(code, /usePlaygroundSourceSync\(this, \{/);
    assert.match(code, /const \[previewWidth, setPreviewWidth\] = useState\(this, 420\);/);
    assert.match(code, /const \[isFullscreen, setIsFullscreen\] = useState\(this, false\);/);
    assert.match(code, /document\.startViewTransition/);
    assert.match(code, /useOnConnect\(this, \(\) => \{/);
    assert.match(code, /useAfterUpdate\(this, \(\) => \{/);
    assert.match(code, /if \(previousFullscreenRef\.current && !isFullscreen\) \{/);
    assert.match(code, /setPreviewHeight\(initialHeight\);/);
    assert.match(code, /setIframeVersion\(value => value \+ 1\);/);
    assert.match(code, /document\.addEventListener\("fullscreenchange", handleFullscreenChange\);/);
    assert.match(code, /document\.removeEventListener\("fullscreenchange", handleFullscreenChange\);/);
    assert.match(code, /useStyle\(this, "--litsx-playground-preview-height",/);
    assert.match(code, /useStyle\(this, "--litsx-playground-preview-width",/);
    assert.match(code, /workerRef\.current\.postMessage\(\{\s*id: compileRequestId\.current,\s*source: nextSource,\s*filename: this\.filename,\s*mode\s*\}\);/s);
    assert.match(code, /@click=\$\{handleReset\}/);
    assert.match(code, /data-role="fullscreen-button"/);
    assert.match(code, /aria-pressed="\$\{isFullscreen \? "true" : "false"\}"/);
    assert.match(code, /aria-label="\$\{isFullscreen \? "Exit fullscreen" : "Enter fullscreen"\}"/);
    assert.match(code, /title="\$\{isFullscreen \? "Exit fullscreen" : "Enter fullscreen"\}"/);
    assert.match(code, /data-role="reset-button"/);
    assert.match(code, /\?disabled=\$\{isResetDisabled\}/);
    assert.match(code, /class="litsx-playground__action litsx-playground__action--chrome"/);
    assert.match(code, /title="Reset source"/);
    assert.match(code, />Reset<\/button>/);
    assert.match(code, /@click=\$\{\(\) => setActiveEditorPanel\("source"\)\}/);
    assert.match(code, /@click=\$\{\(\) => setActiveEditorPanel\("emitted"\)\}/);
    assert.match(code, /data-role="source-editor"/);
    assert.match(code, /data-role="emitted-editor"/);
    assert.match(code, /class="litsx-playground__workspace"/);
    assert.doesNotMatch(code, /sandbox=/);
  }, 30000);

  it("keeps projected source content as authored input instead of manual host reads", () => {
    const source = fs.readFileSync(playgroundPath, "utf8");
    const code = transformDocsComponent(source, playgroundPath);

    assert.doesNotMatch(code, /this\.textContent/);
    assert.doesNotMatch(code, /new MutationObserver/);
    assert.match(code, /const initialSource = \(this\.source \?\? slottedSource \?\? ""\)\.trim\(\);/);
    assert.match(code, /const resolvedPanelMaxHeight = normalizePanelMaxHeight\(this\.panelMaxHeight\);/);
    assert.match(code, /const mode = this\.mode === "react-compat" \? "react-compat" : "native";/);
    assert.match(code, /workerRef\.current\.postMessage\(\{\s*id: compileRequestId\.current,\s*source: nextSource,\s*filename: this\.filename,\s*mode\s*\}\);/s);
  });

  it("compiles the extracted playground hooks through the docs pipeline", () => {
    const source = fs.readFileSync(playgroundHooksPath, "utf8");
    const code = transformDocsComponent(source, playgroundHooksPath);

    assert.match(code, /function useDebouncedAction\(_host, delay: number\)/);
    assert.match(code, /useOnConnect\(_host, \(\) => cancel, \[delay\]\);/);
    assert.match(
      code,
      /function usePlaygroundPreviewMessages\(_host, previewFrame(?:: [^,]+)?, previewId(?:: [^,]+)?, setPreviewHeight(?:: [^,]+)?, setPreviewWidth(?:: [^,]+)?, setPreviewError(?:: [^)]+)?\)/
    );
    assert.match(code, /window\.addEventListener\("message", handlePreviewMessage\);/);
    assert.match(code, /window\.removeEventListener\("message", handlePreviewMessage\);/);
    assert.match(code, /function usePlaygroundEditorsAndWorker\(_host, \{/);
    assert.match(code, /const sourceEditorHost = sourceEditorElement\.current;/);
    assert.match(code, /const emittedEditorHost = emittedEditorElement\.current;/);
    assert.match(code, /const previewHost = previewFrame\.current;/);
    assert.match(code, /function usePlaygroundSourceSync\(_host, \{/);
    assert.doesNotMatch(code, /new MutationObserver/);
  }, 15000);

  it("keeps preview height measurement inside the iframe runtime", () => {
    const source = fs.readFileSync(playgroundPreviewPath, "utf8");

    assert.match(source, /"litsx\/runtime-infrastructure":/);
    assert.match(source, /"@litsx\/light-dom-registry":/);
    assert.match(source, /"lit\/directives\/keyed\.js":/);
    assert.match(source, /"lit\/directives\/repeat\.js":/);
    assert.match(source, /"lit\/directives\/when\.js":/);
    assert.match(source, /mountHeight = mount \? mount\.scrollHeight : 0/);
    assert.match(source, /observeHeight\(node\);/);
    assert.match(source, /node\.updateComplete && typeof node\.updateComplete\.then === "function"/);
    assert.match(source, /window\.__litsxPlaygroundReportError = \(message\) => \{/);
    assert.match(source, /type: "litsx-playground-preview-width"/);
    assert.match(source, /const reportWidth = \(\) => \{/);
    assert.match(
      source,
      /if \(Component\.scopedElements && typeof CustomElementRegistry !== "function"\)/
    );
  });

  it("renders compile fallback previews as a message-only document", () => {
    const doc = createFallbackPreviewDocument("Unexpected token (68:16)");

    assert.match(doc, /Unexpected token \(68:16\)/);
    assert.doesNotMatch(doc, /SyntaxError:/);
    assert.doesNotMatch(doc, /at file:/);
  });

  it("exposes the editor max height as a per-instance prop", () => {
    const source = fs.readFileSync(playgroundPath, "utf8");
    const code = transformDocsComponent(source, playgroundPath);

    assert.match(code, /panelMaxHeight:\s*\{\s*type:\s*String\s*\}/);
    assert.match(code, /mode:\s*\{\s*type:\s*String\s*\}/);
    assert.match(code, /function normalizePanelMaxHeight\(value\?: string\)/);
    assert.match(code, /return null;/);
    assert.match(
      code,
      /if \(resolvedPanelMaxHeight != null\) \{\s*useStyle\(this, "--litsx-playground-editor-max-height", resolvedPanelMaxHeight\);\s*\}/s
    );
  });

  it("fully parses authored source examples that use static hoists", () => {
    const state = createSourceEditorState(primitivesExampleSource, () => {});
    const tree = ensureSyntaxTree(state, state.doc.length, 5000);
    const errors = [];

    (tree ?? syntaxTree(state)).cursor().iterate((node) => {
      if (node.type.isError) {
        errors.push({
          from: node.from,
          to: node.to,
          text: state.doc.sliceString(node.from, Math.min(state.doc.length, node.to + 32)),
        });
      }
    });

    assert.deepStrictEqual(errors, []);
  });

  it("fully parses the useEmit demo source example", () => {
    const state = createSourceEditorState(useEmitExampleSource, () => {});
    const tree = ensureSyntaxTree(state, state.doc.length, 5000);
    const errors = [];

    (tree ?? syntaxTree(state)).cursor().iterate((node) => {
      if (node.type.isError) {
        errors.push({
          from: node.from,
          to: node.to,
          text: state.doc.sliceString(node.from, Math.min(state.doc.length, node.to + 32)),
        });
      }
    });

    assert.deepStrictEqual(errors, []);
  });

  it("fully parses the useAsyncState demo source example", () => {
    const state = createSourceEditorState(useAsyncStateExampleSource, () => {});
    const tree = ensureSyntaxTree(state, state.doc.length, 5000);
    const errors = [];

    (tree ?? syntaxTree(state)).cursor().iterate((node) => {
      if (node.type.isError) {
        errors.push({
          from: node.from,
          to: node.to,
          text: state.doc.sliceString(node.from, Math.min(state.doc.length, node.to + 32)),
        });
      }
    });

    assert.deepStrictEqual(errors, []);
  });

  it("fully parses the useOptimistic demo source example", () => {
    const state = createSourceEditorState(useOptimisticExampleSource, () => {});
    const tree = ensureSyntaxTree(state, state.doc.length, 5000);
    const errors = [];

    (tree ?? syntaxTree(state)).cursor().iterate((node) => {
      if (node.type.isError) {
        errors.push({
          from: node.from,
          to: node.to,
          text: state.doc.sliceString(node.from, Math.min(state.doc.length, node.to + 32)),
        });
      }
    });

    assert.deepStrictEqual(errors, []);
  });

  it("fully parses the Lit directives demo source example", () => {
    const state = createSourceEditorState(litDirectivesExampleSource, () => {});
    const tree = ensureSyntaxTree(state, state.doc.length, 5000);
    const errors = [];

    (tree ?? syntaxTree(state)).cursor().iterate((node) => {
      if (node.type.isError) {
        errors.push({
          from: node.from,
          to: node.to,
          text: state.doc.sliceString(node.from, Math.min(state.doc.length, node.to + 32)),
        });
      }
    });

    assert.deepStrictEqual(errors, []);
  });

  it("virtualizes multiline useEmit demo click handlers for the editor parser", () => {
    const { code } = createVirtualLitsxJsxSource(useEmitExampleSource, {
      strategy: "editor",
    });

    assert.match(code, /eclick=\{\(\) => \{/);
    assert.match(code, /echange=\{\(event\) => \{/);
    assert.doesNotMatch(code, /@click=/);
  });

  it("virtualizes multiline useAsyncState demo click handlers for the editor parser", () => {
    const { code } = createVirtualLitsxJsxSource(useAsyncStateExampleSource, {
      strategy: "editor",
    });

    assert.match(code, /eclick=\{\(\) => saveCount\(count \+ 1\)\}/);
    assert.match(code, /eclick=\{\(\) => \{\s*saveCount\(13\)\.catch\(\(\) => \{\}\);\s*\}\}/);
    assert.doesNotMatch(code, /@click=/);
  });

  it("treats multi-line hoists as foldable regions in the source editor", () => {
    const state = createSourceEditorState(primitivesExampleSource, () => {});
    const hoistOffset = primitivesExampleSource.indexOf("^styles(");
    assert.ok(hoistOffset >= 0);

    const line = state.doc.lineAt(hoistOffset);
    const fold = foldable(state, line.from, line.to);

    assert.ok(fold);
    assert.ok(fold.to > fold.from);
    assert.strictEqual(primitivesExampleSource.slice(fold.from - 1, fold.from), "(");
    assert.strictEqual(primitivesExampleSource.slice(fold.to, fold.to + 1), ")");
  });

  it("fully parses the ^expose playground example in the source editor", () => {
    const state = createSourceEditorState(staticExposeExampleSource, () => {});
    const tree = ensureSyntaxTree(state, state.doc.length, 5000);
    const errors = [];

    (tree ?? syntaxTree(state)).cursor().iterate((node) => {
      if (node.type.isError) {
        errors.push({
          from: node.from,
          to: node.to,
          text: state.doc.sliceString(node.from, Math.min(state.doc.length, node.to + 32)),
        });
      }
    });

    assert.deepStrictEqual(errors, []);
  });
});
