import assert from "assert";
import { beforeEach, describe, expect, it, vi } from "vitest";

const hookRuntime = vi.hoisted(() => ({
  connectCallbacks: [],
  afterUpdateCallbacks: [],
  reset() {
    this.connectCallbacks = [];
    this.afterUpdateCallbacks = [];
  },
}));

vi.mock("@litsx/litsx", () => ({
  useRef(initialValue) {
    return { current: initialValue };
  },
  useOnConnect(callback, deps) {
    hookRuntime.connectCallbacks.push({ callback, deps });
  },
  useAfterUpdate(callback, deps) {
    hookRuntime.afterUpdateCallbacks.push({ callback, deps });
  },
}));

let hooksModule;

function createWindowStub() {
  const listeners = new Map();

  return {
    setTimeout(...args) {
      return setTimeout(...args);
    },
    clearTimeout(...args) {
      return clearTimeout(...args);
    },
    addEventListener(type, callback) {
      if (!listeners.has(type)) {
        listeners.set(type, new Set());
      }
      listeners.get(type).add(callback);
    },
    removeEventListener(type, callback) {
      listeners.get(type)?.delete(callback);
    },
    dispatchEvent(event) {
      for (const callback of listeners.get(event.type) || []) {
        callback(event);
      }
    },
  };
}

beforeEach(async () => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.resetModules();
  hookRuntime.reset();
  globalThis.window = createWindowStub();
  hooksModule = await import("../packages/litsx-playground/src/litsx-playground-hooks.tsx");
});

async function importHooksWithEditorMocks() {
  vi.resetModules();
  hookRuntime.reset();

  const createSourceEditorState = vi.fn((doc, onChange) => ({ kind: "source", doc, onChange }));
  const createEmittedEditorState = vi.fn((doc) => ({ kind: "emitted", doc }));
  const foldSourceEditorHoists = vi.fn();
  const setEditorDocument = vi.fn();
  const editorDestroy = vi.fn();
  const editorInstances = [];

  class MockEditorView {
    constructor(options) {
      this.options = options;
      this.destroy = editorDestroy;
      editorInstances.push(this);
    }
  }

  vi.doMock("@codemirror/view", () => ({
    EditorView: MockEditorView,
  }));

  vi.doMock("../packages/litsx-playground/src/litsx-playground-editors.js", () => ({
    createSourceEditorState,
    createEmittedEditorState,
    foldSourceEditorHoists,
    setEditorDocument,
  }));

  const mod = await import("../packages/litsx-playground/src/litsx-playground-hooks.tsx");
  return {
    mod,
    createSourceEditorState,
    createEmittedEditorState,
    foldSourceEditorHoists,
    setEditorDocument,
    editorDestroy,
    editorInstances,
  };
}

describe("@litsx/playground hooks", () => {
  it("resets compile and preview diagnostics together", () => {
    const setCompileError = vi.fn();
    const setCompileErrorDetails = vi.fn();
    const setCompileWarnings = vi.fn();
    const setPreviewError = vi.fn();

    hooksModule.resetPlaygroundDiagnostics(
      setCompileError,
      setCompileErrorDetails,
      setCompileWarnings,
      setPreviewError
    );

    expect(setCompileError).toHaveBeenCalledWith("");
    expect(setCompileErrorDetails).toHaveBeenCalledWith("");
    expect(setCompileWarnings).toHaveBeenCalledWith([]);
    expect(setPreviewError).toHaveBeenCalledWith("");
  });

  it("debounces actions and exposes a cleanup callback", () => {
    vi.useFakeTimers();
    const actionA = vi.fn();
    const actionB = vi.fn();

    const debounced = hooksModule.useDebouncedAction(25);
    expect(hookRuntime.connectCallbacks).toHaveLength(1);
    assert.deepStrictEqual(hookRuntime.connectCallbacks[0].deps, [25]);

    debounced.schedule(actionA);
    vi.advanceTimersByTime(20);
    expect(actionA).not.toHaveBeenCalled();

    debounced.schedule(actionB);
    vi.advanceTimersByTime(24);
    expect(actionA).not.toHaveBeenCalled();
    expect(actionB).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(actionA).not.toHaveBeenCalled();
    expect(actionB).toHaveBeenCalledTimes(1);

    debounced.schedule(actionA);
    const cleanup = hookRuntime.connectCallbacks[0].callback();
    cleanup();
    vi.runAllTimers();
    expect(actionA).not.toHaveBeenCalled();
  });

  it("maps preview iframe messages to state setters and unregisters listeners", () => {
    const setPreviewHeight = vi.fn();
    const setPreviewWidth = vi.fn();
    const setPreviewError = vi.fn();

    hooksModule.usePlaygroundPreviewMessages(
      { current: null },
      "preview-1",
      setPreviewHeight,
      setPreviewWidth,
      setPreviewError
    );

    expect(hookRuntime.connectCallbacks).toHaveLength(1);
    assert.deepStrictEqual(hookRuntime.connectCallbacks[0].deps, [null, "preview-1"]);

    const cleanup = hookRuntime.connectCallbacks[0].callback();

    window.dispatchEvent({
      type: "message",
      data: {
        previewId: "preview-1",
        type: "litsx-playground-preview-height",
        height: 0,
      },
    });
    window.dispatchEvent({
      type: "message",
      data: {
        previewId: "preview-1",
        type: "litsx-playground-preview-width",
        width: 480,
      },
    });
    window.dispatchEvent({
      type: "message",
      data: {
        previewId: "preview-1",
        type: "litsx-playground-preview-error",
        message: "Preview blew up",
      },
    });
    window.dispatchEvent({
      type: "message",
      data: {
        previewId: "other",
        type: "litsx-playground-preview-height",
        height: 99,
      },
    });

    expect(setPreviewHeight).toHaveBeenCalledWith(1);
    expect(setPreviewWidth).toHaveBeenCalledWith(480);
    expect(setPreviewError).toHaveBeenCalledWith("Preview blew up");

    cleanup();
    window.dispatchEvent({
      type: "message",
      data: {
        previewId: "preview-1",
        type: "litsx-playground-preview-width",
        width: 640,
      },
    });
    expect(setPreviewWidth).toHaveBeenCalledTimes(1);
  });

  it("keeps source, emitted code, diagnostics, and mode transitions in sync", () => {
    const sourceEditorDispatch = vi.fn();
    const emittedEditorDispatch = vi.fn();
    const scheduleCompile = vi.fn((callback) => callback());
    const compileCurrentSource = vi.fn();
    const cancelScheduledCompile = vi.fn();
    const setSource = vi.fn();
    const setCompileError = vi.fn();
    const setCompileErrorDetails = vi.fn();
    const setCompileWarnings = vi.fn();
    const setPreviewError = vi.fn();

    const sourceEditorView = {
      current: {
        state: { doc: { toString: () => "old source" } },
        dispatch: sourceEditorDispatch,
      },
    };
    const emittedEditorView = {
      current: {
        state: { doc: { toString: () => "old emitted" } },
        dispatch: emittedEditorDispatch,
      },
    };
    const latestSourceRef = { current: "old source" };
    const initialSourceRef = { current: "initial source" };
    const isMountedRef = { current: true };

    hooksModule.usePlaygroundSourceSync({
      sourceProp: "external source",
      mode: "react-compat",
      source: "new source",
      emittedOutput: "new emitted",
      initialSource: "replacement source",
      sourceEditorView,
      emittedEditorView,
      latestSourceRef,
      initialSourceRef,
      isMountedRef,
      scheduleCompile,
      compileCurrentSource,
      cancelScheduledCompile,
      setSource,
      setCompileError,
      setCompileErrorDetails,
      setCompileWarnings,
      setPreviewError,
    });

    expect(hookRuntime.afterUpdateCallbacks).toHaveLength(4);

    hookRuntime.afterUpdateCallbacks[0].callback();
    assert.strictEqual(latestSourceRef.current, "new source");
    expect(sourceEditorDispatch).toHaveBeenCalledTimes(1);
    expect(scheduleCompile).toHaveBeenCalledTimes(1);
    expect(compileCurrentSource).toHaveBeenCalledWith("new source");

    hookRuntime.afterUpdateCallbacks[1].callback();
    expect(emittedEditorDispatch).toHaveBeenCalledTimes(1);

    hookRuntime.afterUpdateCallbacks[2].callback();
    assert.strictEqual(initialSourceRef.current, "replacement source");
    expect(cancelScheduledCompile).toHaveBeenCalled();
    expect(setCompileError).toHaveBeenCalledWith("");
    expect(setCompileErrorDetails).toHaveBeenCalledWith("");
    expect(setCompileWarnings).toHaveBeenCalledWith([]);
    expect(setPreviewError).toHaveBeenCalledWith("");
    expect(setSource).toHaveBeenCalledWith("replacement source");

    hookRuntime.afterUpdateCallbacks[3].callback();
    expect(compileCurrentSource).toHaveBeenLastCalledWith("new source");
  });

  it("skips editor setup when already initialized or when hosts are missing", async () => {
    const { mod, createSourceEditorState, createEmittedEditorState } =
      await importHooksWithEditorMocks();

    const baseArgs = {
      source: "source",
      emittedOutput: "emitted",
      initialSourceRef: { current: "initial" },
      sourceEditorElement: { current: null },
      emittedEditorElement: { current: null },
      previewFrame: { current: null },
      sourceEditorView: { current: null },
      emittedEditorView: { current: null },
      workerRef: { current: null },
      compileRequestId: { current: 0 },
      didInitRef: { current: true },
      isMountedRef: { current: false },
      cancelScheduledCompile: vi.fn(),
      compileCurrentSource: vi.fn(),
      setSource: vi.fn(),
      setIsCompiling: vi.fn(),
      setCompileError: vi.fn(),
      setCompileErrorDetails: vi.fn(),
      setCompileWarnings: vi.fn(),
      setPreviewError: vi.fn(),
      setEmittedCode: vi.fn(),
      setIframeVersion: vi.fn(),
    };

    mod.usePlaygroundEditorsAndWorker(baseArgs);
    expect(hookRuntime.afterUpdateCallbacks).toHaveLength(1);
    hookRuntime.afterUpdateCallbacks[0].callback();
    expect(createSourceEditorState).not.toHaveBeenCalled();
    expect(createEmittedEditorState).not.toHaveBeenCalled();

    hookRuntime.reset();
    baseArgs.didInitRef.current = false;
    mod.usePlaygroundEditorsAndWorker(baseArgs);
    hookRuntime.afterUpdateCallbacks[0].callback();
    expect(createSourceEditorState).not.toHaveBeenCalled();
    expect(createEmittedEditorState).not.toHaveBeenCalled();
  });

  it("initializes editors and worker, handles worker messages, and cleans up", async () => {
    const {
      mod,
      createSourceEditorState,
      createEmittedEditorState,
      foldSourceEditorHoists,
      editorDestroy,
      editorInstances,
    } = await importHooksWithEditorMocks();

    const terminate = vi.fn();
    const workerMessages = [];
    let workerInstance = null;

    globalThis.Worker = vi.fn(function Worker(url, options) {
      workerInstance = this;
      this.url = url;
      this.options = options;
      this.terminate = terminate;
      this.postMessage = vi.fn((payload) => {
        workerMessages.push(payload);
      });
    });

    const args = {
      source: "source",
      emittedOutput: "emitted output",
      initialSourceRef: { current: "initial source" },
      sourceEditorElement: { current: { id: "source-host" } },
      emittedEditorElement: { current: { id: "emitted-host" } },
      previewFrame: { current: { id: "preview-host" } },
      sourceEditorView: { current: null },
      emittedEditorView: { current: null },
      workerRef: { current: null },
      compileRequestId: { current: 1 },
      didInitRef: { current: false },
      isMountedRef: { current: false },
      cancelScheduledCompile: vi.fn(),
      compileCurrentSource: vi.fn(),
      setSource: vi.fn(),
      setIsCompiling: vi.fn(),
      setCompileError: vi.fn(),
      setCompileErrorDetails: vi.fn(),
      setCompileWarnings: vi.fn(),
      setPreviewError: vi.fn(),
      setEmittedCode: vi.fn(),
      setIframeVersion: vi.fn(),
    };

    mod.usePlaygroundEditorsAndWorker(args);
    const cleanup = hookRuntime.afterUpdateCallbacks[0].callback();

    expect(createSourceEditorState).toHaveBeenCalledWith("source", expect.any(Function));
    expect(createEmittedEditorState).toHaveBeenCalledWith("emitted output");
    expect(foldSourceEditorHoists).toHaveBeenCalledTimes(1);
    expect(editorInstances).toHaveLength(2);
    expect(globalThis.Worker).toHaveBeenCalledTimes(1);
    expect(args.isMountedRef.current).toBe(true);
    expect(args.compileCurrentSource).toHaveBeenCalledWith("initial source");

    workerInstance.onmessage({ data: { id: 999, ok: true, code: "ignored" } });
    expect(args.setIsCompiling).not.toHaveBeenCalled();

    args.compileRequestId.current = 4;
    workerInstance.onmessage({
      data: {
        id: 4,
        ok: false,
        error: "",
        stack: "",
      },
    });
    expect(args.setIsCompiling).toHaveBeenCalledWith(false);
    expect(args.setCompileError).toHaveBeenCalledWith("Unknown playground compiler error.");
    expect(args.setCompileErrorDetails).toHaveBeenCalledWith("");
    expect(args.setCompileWarnings).toHaveBeenCalledWith([]);
    expect(args.setPreviewError).toHaveBeenCalledWith("");
    expect(args.setEmittedCode).toHaveBeenCalledWith("");
    expect(args.setIframeVersion).toHaveBeenCalled();

    workerInstance.onmessage({
      data: {
        id: 4,
        ok: true,
        code: "export const Demo = true;",
        warnings: [{ message: "warn" }, null, { message: "" }],
      },
    });
    expect(args.setCompileError).toHaveBeenCalledWith("");
    expect(args.setCompileErrorDetails).toHaveBeenCalledWith("");
    expect(args.setCompileWarnings).toHaveBeenCalledWith(["warn"]);
    expect(args.setEmittedCode).toHaveBeenCalledWith("export const Demo = true;");

    cleanup();
    expect(args.didInitRef.current).toBe(false);
    expect(args.isMountedRef.current).toBe(false);
    expect(args.cancelScheduledCompile).toHaveBeenCalled();
    expect(terminate).toHaveBeenCalled();
    expect(editorDestroy).toHaveBeenCalledTimes(2);
    expect(args.sourceEditorView.current).toBe(null);
    expect(args.emittedEditorView.current).toBe(null);
    expect(args.workerRef.current).toBe(null);
    expect(workerMessages).toEqual([]);
  });

  it("avoids recompilation work when source or mode changes before mount", () => {
    const sourceEditorDispatch = vi.fn();
    const emittedEditorDispatch = vi.fn();
    const scheduleCompile = vi.fn();
    const compileCurrentSource = vi.fn();
    const cancelScheduledCompile = vi.fn();
    const setSource = vi.fn();
    const setCompileError = vi.fn();
    const setCompileErrorDetails = vi.fn();
    const setCompileWarnings = vi.fn();
    const setPreviewError = vi.fn();

    const sourceEditorView = {
      current: {
        state: { doc: { toString: () => "same source" } },
        dispatch: sourceEditorDispatch,
      },
    };
    const emittedEditorView = {
      current: {
        state: { doc: { toString: () => "same emitted" } },
        dispatch: emittedEditorDispatch,
      },
    };
    const latestSourceRef = { current: "same source" };
    const initialSourceRef = { current: "same source" };
    const isMountedRef = { current: false };

    hooksModule.usePlaygroundSourceSync({
      sourceProp: "same source",
      mode: "native",
      source: "same source",
      emittedOutput: "same emitted",
      initialSource: "same source",
      sourceEditorView,
      emittedEditorView,
      latestSourceRef,
      initialSourceRef,
      isMountedRef,
      scheduleCompile,
      compileCurrentSource,
      cancelScheduledCompile,
      setSource,
      setCompileError,
      setCompileErrorDetails,
      setCompileWarnings,
      setPreviewError,
    });

    hookRuntime.afterUpdateCallbacks[0].callback();
    hookRuntime.afterUpdateCallbacks[1].callback();
    hookRuntime.afterUpdateCallbacks[2].callback();
    hookRuntime.afterUpdateCallbacks[3].callback();

    expect(scheduleCompile).not.toHaveBeenCalled();
    expect(compileCurrentSource).not.toHaveBeenCalled();
    expect(cancelScheduledCompile).not.toHaveBeenCalled();
    expect(setSource).not.toHaveBeenCalled();
    expect(setCompileError).not.toHaveBeenCalled();
    expect(setCompileErrorDetails).not.toHaveBeenCalled();
    expect(setCompileWarnings).not.toHaveBeenCalled();
    expect(setPreviewError).not.toHaveBeenCalled();
  });
});
