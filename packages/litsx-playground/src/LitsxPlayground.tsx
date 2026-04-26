import {
  useAfterUpdate,
  useHostContent,
  useHost,
  useOnConnect,
  useRef,
  useState,
  useStyle,
} from "litsx";
import {
  buildPreviewDocument,
  createFallbackPreviewDocument,
  currentEmittedOutput,
} from "./litsx-playground-preview.js";
import {
  resetPlaygroundDiagnostics,
  useDebouncedAction,
  usePlaygroundEditorsAndWorker,
  usePlaygroundPreviewMessages,
  usePlaygroundSourceSync,
} from "./litsx-playground-hooks.tsx";
import { playgroundStyles } from "./litsx-playground-styles.js";

type LitsxPlaygroundProps = {
  source?: string;
  exportName: string;
  previewTagName: string;
  filename: string;
  mode?: "native" | "react-compat";
  height?: number;
  panelMaxHeight?: string;
};

function normalizePanelMaxHeight(value?: string) {
  if (typeof value === "string" && value.trim() !== "") {
    return value.trim();
  }

  return null;
}

function createPreviewInstanceId() {
  return `litsx-playground-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function toggleFullscreenWithTransition(
  setIsFullscreen: (value: boolean | ((value: boolean) => boolean)) => void
) {
  const startViewTransition = document.startViewTransition?.bind(document);
  if (typeof startViewTransition === "function") {
    startViewTransition(() => {
      setIsFullscreen((value) => !value);
    });
    return;
  }

  setIsFullscreen((value) => !value);
}

async function toggleHostFullscreen(
  host: Element | null | undefined,
  setIsFullscreen: (value: boolean | ((value: boolean) => boolean)) => void
) {
  if (typeof document === "undefined") {
    toggleFullscreenWithTransition(setIsFullscreen);
    return;
  }

  const fullscreenHost = document.fullscreenElement;
  if (fullscreenHost && host && fullscreenHost === host) {
    if (typeof document.exitFullscreen === "function") {
      await document.exitFullscreen();
      return;
    }
  }

  if (host && typeof host.requestFullscreen === "function") {
    try {
      await host.requestFullscreen();
      return;
    } catch {
      // Fall back to the local overlay when fullscreen is unavailable or rejected.
    }
  }

  toggleFullscreenWithTransition(setIsFullscreen);
}

export function LitsxPlayground({
  source: sourceProp,
  exportName,
  previewTagName,
  filename: filenameProp,
  mode: modeProp,
  height,
  panelMaxHeight,
}: LitsxPlaygroundProps) {
  // ^styles(...) attaches stylesheet metadata to the component type.
  ^styles(playgroundStyles);
  const host = useHost();

  // useHostContent() turns projected light DOM content into reactive component input.
  const hostContent = useHostContent({ trim: true });
  const slottedSource = hostContent.text;
  const initialSource = (sourceProp ?? slottedSource ?? "").trim();
  const initialHeight = Number.isFinite(height) && height > 0 ? height : 1;
  const resolvedPanelMaxHeight = normalizePanelMaxHeight(panelMaxHeight);
  const filename = filenameProp;
  const mode = modeProp === "react-compat" ? "react-compat" : "native";

  const sourceEditorView = useRef(null);
  const emittedEditorView = useRef(null);
  const workerRef = useRef(null);
  const compileRequestId = useRef(0);
  const previewInstanceId = useRef(createPreviewInstanceId());
  const latestSourceRef = useRef(initialSource);
  const initialSourceRef = useRef(initialSource);
  const isMountedRef = useRef(false);
  const didInitRef = useRef(false);
  const previousFullscreenRef = useRef<boolean | null>(null);
  const { cancel: cancelScheduledCompile, schedule: scheduleCompile } = useDebouncedAction(220);
  // useRef() also binds to DOM nodes when attached to JSX ref=...
  const sourceEditorElement = useRef(null);
  const emittedEditorElement = useRef(null);
  const previewFrame = useRef(null);

  // useState() drives the rendered shell and the compiler/preview lifecycle.
  const [source, setSource] = useState(initialSource);
  const [emittedCode, setEmittedCode] = useState("");
  const [compileError, setCompileError] = useState("");
  const [compileErrorDetails, setCompileErrorDetails] = useState("");
  const [compileWarnings, setCompileWarnings] = useState<string[]>([]);
  const [previewError, setPreviewError] = useState("");
  const [isCompiling, setIsCompiling] = useState(false);
  const [iframeVersion, setIframeVersion] = useState(0);
  const [previewHeight, setPreviewHeight] = useState(initialHeight);
  const [previewWidth, setPreviewWidth] = useState(420);
  const [activeEditorPanel, setActiveEditorPanel] = useState<"source" | "emitted">("source");
  const [isFullscreen, setIsFullscreen] = useState(false);

  // useStyle() is the dynamic counterpart to ^styles(...).
  useStyle("--litsx-playground-preview-height", `${Math.max(previewHeight, 1)}px`);
  useStyle("--litsx-playground-preview-width", `${Math.max(previewWidth, 320)}px`);
  if (resolvedPanelMaxHeight != null) {
    useStyle("--litsx-playground-editor-max-height", resolvedPanelMaxHeight);
  }

  useOnConnect(() => {
    if (typeof document === "undefined") {
      return;
    }

    const handleFullscreenChange = () => {
      const active = document.fullscreenElement === host;
      setIsFullscreen((value) => (value === active ? value : active));
    };

    document.addEventListener("fullscreenchange", handleFullscreenChange);

    return () => {
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
    };
  }, [host]);

  useAfterUpdate(() => {
    if (previousFullscreenRef.current === null) {
      previousFullscreenRef.current = isFullscreen;
      return;
    }

    if (previousFullscreenRef.current && !isFullscreen) {
      setPreviewHeight(initialHeight);
      setIframeVersion((value) => value + 1);
    }

    previousFullscreenRef.current = isFullscreen;
  }, [isFullscreen]);

  const emittedOutput = currentEmittedOutput(
    compileError,
    compileErrorDetails,
    previewError,
    emittedCode
  );
  const previewId = `${previewInstanceId.current}-preview-${iframeVersion}`;
  const isResetDisabled = source === initialSourceRef.current;

  const previewSrcdoc =
    compileError || !emittedCode
      ? createFallbackPreviewDocument(compileError || "Compiling...")
      : buildPreviewDocument(emittedCode, exportName, previewTagName, previewId);

  const compileCurrentSource = (nextSource = latestSourceRef.current) => {
    if (!workerRef.current) return;
    compileRequestId.current += 1;
    setIsCompiling(true);
    workerRef.current.postMessage({
      id: compileRequestId.current,
      source: nextSource,
      filename,
      mode,
    });
  };

  const handleReset = () => {
    cancelScheduledCompile();
    resetPlaygroundDiagnostics(
      setCompileError,
      setCompileErrorDetails,
      setCompileWarnings,
      setPreviewError
    );

    if (latestSourceRef.current === initialSourceRef.current) {
      compileCurrentSource(initialSourceRef.current);
      return;
    }

    setSource(initialSourceRef.current);
  };
  usePlaygroundEditorsAndWorker({
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
  });

  usePlaygroundPreviewMessages(
    previewFrame,
    previewId,
    setPreviewHeight,
    setPreviewWidth,
    setPreviewError
  );

  usePlaygroundSourceSync({
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
  });

  return (
    <div class={`litsx-playground${isFullscreen ? " is-fullscreen" : ""}`}>
      <div class="litsx-playground__panel">
        <div class="litsx-playground__toolbar">
          <div class="litsx-playground__segmented" role="tablist" aria-label="Playground editor panel">
            <button
              type="button"
              class={`litsx-playground__segment${
                activeEditorPanel === "source" ? " is-active" : ""
              }`}
              role="tab"
              aria-selected={activeEditorPanel === "source" ? "true" : "false"}
              @click={() => setActiveEditorPanel("source")}
            >
              Source
            </button>
            <button
              type="button"
              class={`litsx-playground__segment${
                activeEditorPanel === "emitted" ? " is-active" : ""
              }`}
              role="tab"
              aria-selected={activeEditorPanel === "emitted" ? "true" : "false"}
              @click={() => setActiveEditorPanel("emitted")}
            >
              Emitted Module
            </button>
          </div>
          <div class="litsx-playground__toolbar-actions">
            <button
              data-role="reset-button"
              type="button"
              class="litsx-playground__action litsx-playground__action--chrome"
              ?disabled={isResetDisabled}
              title="Reset source"
              // @click uses Lit-style event binding in authored JSX.
              @click={handleReset}
            >
              Reset
            </button>
            <button
              data-role="fullscreen-button"
              type="button"
              class={`litsx-playground__action litsx-playground__action--icon${
                isFullscreen ? " is-active" : ""
              }`}
              aria-pressed={isFullscreen ? "true" : "false"}
              aria-label={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
              title={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
              @click={() => toggleHostFullscreen(host, setIsFullscreen)}
            >
              ⛶
            </button>
          </div>
        </div>
        <div class="litsx-playground__workspace">
          <div class="litsx-playground__editor-stage">
            <div
              ref={sourceEditorElement}
              data-role="source-editor"
              class={`litsx-playground__editor-panel${
                activeEditorPanel === "source" ? " is-active" : ""
              }`}
            />
            <div
              ref={emittedEditorElement}
              data-role="emitted-editor"
              class={`litsx-playground__editor-panel litsx-playground__output${
                activeEditorPanel === "emitted" ? " is-active" : ""
              }`}
            />
          </div>
          <div class="litsx-playground__subsection">
            <div class="litsx-playground__toolbar litsx-playground__toolbar--subtle">
              <div class="litsx-playground__label litsx-playground__label--subtle">Preview</div>
              <div class="litsx-playground__status">
                {isCompiling
                  ? "Compiling..."
                  : compileError
                    ? "Error"
                    : previewError
                      ? "Preview error"
                      : compileWarnings.length > 0
                        ? "Warning"
                        : "Ready"}
              </div>
            </div>
            <iframe
              ref={previewFrame}
              data-role="preview-frame"
              key={String(iframeVersion)}
              class="litsx-playground__preview"
              srcdoc={previewSrcdoc}
            />
            {previewError ? (
              <div class="litsx-playground__runtime-error">{previewError}</div>
            ) : null}
            {compileWarnings.length > 0 ? (
              <div class="litsx-playground__warnings">
                {compileWarnings.map((warning) => (
                  <div class="litsx-playground__warning">{warning}</div>
                ))}
              </div>
            ) : null}
          </div>
        </div>
      </div>

      <div class={`litsx-playground__signature${isFullscreen ? " is-hidden" : ""}`}>
        Made with <span class="litsx-playground__signature-heart">♥</span> using{" "}
        <a
          class="litsx-playground__signature-link"
          href="https://github.com/litsx/litsx/tree/main/packages/litsx-playground"
          target="_blank"
          rel="noreferrer"
        >
          Lit<sup>sx</sup>
        </a>
      </div>
    </div>
  );
}

if (typeof customElements !== "undefined" && !customElements.get("litsx-playground")) {
  customElements.define("litsx-playground", LitsxPlayground);
}
