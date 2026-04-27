import { EditorView } from "@codemirror/view";
import { useAfterUpdate, useOnConnect, useRef } from "litsx";
import {
  createEmittedEditorState,
  createSourceEditorState,
  foldSourceEditorHoists,
  setEditorDocument,
} from "./litsx-playground-editors.js";
import { readPreviewMessage } from "./litsx-playground-preview.js";

type MutableRef<T> = { current: T };
type StateSetter<T> = (value: T | ((value: T) => T)) => void;
type StringSetter = StateSetter<string>;
type BooleanSetter = StateSetter<boolean>;
type NumberSetter = StateSetter<number>;
type StringListSetter = StateSetter<string[]>;

type PlaygroundWarning = { message?: string } | null | undefined;
type PlaygroundWorkerResponse = {
  id?: number;
  ok?: boolean;
  type?: "compile";
  code?: string;
  error?: string;
  stack?: string;
  warnings?: PlaygroundWarning[];
};

type DebouncedAction = {
  cancel: () => void;
  schedule: (action: () => void) => void;
};

type PreviewFrameRef = MutableRef<HTMLIFrameElement | null>;
type ElementRef = MutableRef<HTMLElement | null>;
type EditorViewRef = MutableRef<EditorView | null>;
type WorkerRef = MutableRef<Worker | null>;
type NumberRef = MutableRef<number>;
type BooleanRef = MutableRef<boolean>;
type StringRef = MutableRef<string>;

type PlaygroundEditorsAndWorkerArgs = {
  source: string;
  emittedOutput: string;
  initialSourceRef: StringRef;
  sourceEditorElement: ElementRef;
  emittedEditorElement: ElementRef;
  previewFrame: PreviewFrameRef;
  sourceEditorView: EditorViewRef;
  emittedEditorView: EditorViewRef;
  workerRef: WorkerRef;
  compileRequestId: NumberRef;
  didInitRef: BooleanRef;
  isMountedRef: BooleanRef;
  cancelScheduledCompile: DebouncedAction["cancel"];
  compileCurrentSource: (nextSource?: string) => void;
  setSource: StringSetter;
  setIsCompiling: BooleanSetter;
  setCompileError: StringSetter;
  setCompileErrorDetails: StringSetter;
  setCompileWarnings: StringListSetter;
  setPreviewError: StringSetter;
  setEmittedCode: StringSetter;
  setIframeVersion: NumberSetter;
};

type PlaygroundSourceSyncArgs = {
  sourceProp?: string;
  mode: "native" | "react-compat";
  source: string;
  emittedOutput: string;
  initialSource: string;
  sourceEditorView: EditorViewRef;
  emittedEditorView: EditorViewRef;
  latestSourceRef: StringRef;
  initialSourceRef: StringRef;
  isMountedRef: BooleanRef;
  scheduleCompile: DebouncedAction["schedule"];
  compileCurrentSource: (nextSource?: string) => void;
  cancelScheduledCompile: DebouncedAction["cancel"];
  setSource: StringSetter;
  setCompileError: StringSetter;
  setCompileErrorDetails: StringSetter;
  setCompileWarnings: StringListSetter;
  setPreviewError: StringSetter;
};

function mapCompileWarnings(warnings: PlaygroundWarning[] | undefined): string[] {
  return Array.isArray(warnings)
    ? warnings
        .map((warning) => warning?.message || "")
        .filter(Boolean)
    : [];
}

export function resetPlaygroundDiagnostics(
  setCompileError: StringSetter,
  setCompileErrorDetails: StringSetter,
  setCompileWarnings: StringListSetter,
  setPreviewError: StringSetter
): void {
  setCompileError("");
  setCompileErrorDetails("");
  setCompileWarnings([]);
  setPreviewError("");
}

export function useDebouncedAction(delay: number): DebouncedAction {
  const timeoutRef = useRef<number | null>(null);

  function cancel() {
    if (timeoutRef.current !== null) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }

  function schedule(action: () => void) {
    cancel();
    timeoutRef.current = window.setTimeout(() => {
      timeoutRef.current = null;
      action();
    }, delay);
  }

  // Custom hooks can compose native hooks to package a recurring behavior.
  useOnConnect(() => cancel, [delay]);

  return { cancel, schedule };
}

export function usePlaygroundPreviewMessages(
  previewFrame: PreviewFrameRef,
  previewId: string,
  setPreviewHeight: NumberSetter,
  setPreviewWidth: NumberSetter,
  setPreviewError: StringSetter
): void {
  // useOnConnect() is the right hook for global listeners tied to host connection.
  useOnConnect(() => {
    const handlePreviewMessage = (event: MessageEvent) => {
      const payload = readPreviewMessage(event, previewId);
      if (!payload) return;

      if (payload.type === "litsx-playground-preview-height") {
        setPreviewHeight(payload.height!);
        return;
      }

      if (payload.type === "litsx-playground-preview-width") {
        setPreviewWidth(payload.width!);
        return;
      }

      if (payload.type === "litsx-playground-preview-error") {
        setPreviewError(payload.message);
      }
    };

    window.addEventListener("message", handlePreviewMessage);

    return () => {
      window.removeEventListener("message", handlePreviewMessage);
    };
  }, [previewFrame.current, previewId]);
}

export function usePlaygroundEditorsAndWorker({
  source,
  emittedOutput,
  initialSourceRef,
  sourceEditorElement,
  emittedEditorElement,
  previewFrame,
  sourceEditorView,
  emittedEditorView,
  workerRef,
  compileRequestId,
  didInitRef,
  isMountedRef,
  cancelScheduledCompile,
  compileCurrentSource,
  setSource,
  setIsCompiling,
  setCompileError,
  setCompileErrorDetails,
  setCompileWarnings,
  setPreviewError,
  setEmittedCode,
  setIframeVersion,
}: PlaygroundEditorsAndWorkerArgs): void {
  // useAfterUpdate(..., []) is the one-time setup point for browser-only resources.
  useAfterUpdate(() => {
    if (didInitRef.current) return;

    const sourceEditorHost = sourceEditorElement.current;
    const emittedEditorHost = emittedEditorElement.current;
    const previewHost = previewFrame.current;
    if (!sourceEditorHost || !emittedEditorHost || !previewHost) return;

    didInitRef.current = true;

    sourceEditorView.current = new EditorView({
      state: createSourceEditorState(source, (nextSource: string) => {
        setSource(nextSource);
      }),
      parent: sourceEditorHost,
    });
    foldSourceEditorHoists(sourceEditorView.current);

    emittedEditorView.current = new EditorView({
      state: createEmittedEditorState(emittedOutput),
      parent: emittedEditorHost,
    });

    workerRef.current = new Worker(new URL("./litsx-playground.worker.js", import.meta.url), {
      type: "module",
    });

    workerRef.current.onmessage = (event: MessageEvent<PlaygroundWorkerResponse>) => {
      const { id, ok, code, error, stack, warnings } = event.data || {};

      if (id !== compileRequestId.current) return;

      setIsCompiling(false);

      if (!ok) {
        setCompileError(error || "Unknown playground compiler error.");
        setCompileErrorDetails(stack || "");
        setCompileWarnings([]);
        setPreviewError("");
        setEmittedCode("");
        setIframeVersion((value) => value + 1);
        return;
      }

      setCompileError("");
      setCompileErrorDetails("");
      setCompileWarnings(mapCompileWarnings(warnings));
      setPreviewError("");
      setEmittedCode(code || "");
      setIframeVersion((value) => value + 1);
    };

    isMountedRef.current = true;
    compileCurrentSource(initialSourceRef.current);

    return () => {
      didInitRef.current = false;
      isMountedRef.current = false;
      cancelScheduledCompile();
      workerRef.current?.terminate();
      sourceEditorView.current?.destroy();
      emittedEditorView.current?.destroy();
      sourceEditorView.current = null;
      emittedEditorView.current = null;
      workerRef.current = null;
    };
  }, []);
}

export function usePlaygroundSourceSync({
  sourceProp,
  mode,
  source,
  emittedOutput,
  initialSource,
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
}: PlaygroundSourceSyncArgs): void {
  // When authored source changes, keep the editor and compiler in sync.
  useAfterUpdate(() => {
    latestSourceRef.current = source;
    setEditorDocument(sourceEditorView.current, source);

    if (!isMountedRef.current) return;
    scheduleCompile(() => {
      compileCurrentSource(source);
    });
  }, [source]);

  useAfterUpdate(() => {
    setEditorDocument(emittedEditorView.current, emittedOutput);
  }, [emittedOutput]);

  // Keep external prop updates or projected content changes flowing back into local editor state.
  useAfterUpdate(() => {
    if (initialSource === initialSourceRef.current) return;

    initialSourceRef.current = initialSource;
    cancelScheduledCompile();
    resetPlaygroundDiagnostics(
      setCompileError,
      setCompileErrorDetails,
      setCompileWarnings,
      setPreviewError
    );

    if (latestSourceRef.current !== initialSource) {
      setSource(initialSource);
    }
  }, [initialSource, sourceProp]);

  useAfterUpdate(() => {
    if (!isMountedRef.current) return;

    cancelScheduledCompile();
    resetPlaygroundDiagnostics(
      setCompileError,
      setCompileErrorDetails,
      setCompileWarnings,
      setPreviewError
    );
    compileCurrentSource(latestSourceRef.current);
  }, [mode]);
}
