import { createRuntimeHooksTransform } from "@litsx/babel-plugin-shared-hooks";

const RUNTIME_MODULE = "@litsx/core";
const IMPORT_SOURCES = [RUNTIME_MODULE];

const RUNTIME_HELPERS = [
  "useOnConnect",
  "useAfterUpdate",
  "useOnCommit",
  "useMemoValue",
  "useStableCallback",
  "useEvent",
  "useEmit",
  "usePrevious",
  "useReducedState",
  "useState",
  "useControlledState",
  "useAsyncState",
  "useOptimistic",
  "useExpose",
  "useExternalStore",
  "useHost",
  "useHostContent",
  "useSlot",
  "useTextContent",
  "useTransition",
  "useDeferredValue",
  "useStyle",
  "useRef",
  "useCallbackRef",
  "useStableId",
];

function normalizePath(value) {
  return String(value || "").replace(/\\/g, "/");
}

function hashStableId(value) {
  let hash = 2166136261;
  const text = String(value);
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function createStableIdCallsiteMetadata(callPath, state, t) {
  const filename =
    state.file?.opts?.sourceFileName ||
    state.file?.opts?.filename ||
    state.filename ||
    "";
  const normalizedFilename = normalizePath(filename);
  const loc = callPath.node.loc?.start ?? null;
  const start = typeof callPath.node.start === "number"
    ? callPath.node.start
    : 0;
  const line = loc?.line ?? 0;
  const column = loc?.column ?? 0;
  const seed = `${normalizedFilename}:${line}:${column}:${start}`;
  return t.stringLiteral(`litsx-stable-${hashStableId(seed)}`);
}

export default createRuntimeHooksTransform({
  pluginName: "transform-litsx-hooks",
  runtimeModule: RUNTIME_MODULE,
  importSources: IMPORT_SOURCES,
  helperNames: RUNTIME_HELPERS,
  callMetadataByHelper: {
    useStableId: createStableIdCallsiteMetadata,
  },
});
