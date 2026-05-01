import { createRuntimeHooksTransform } from "../../../babel-plugin-shared-hooks/src/index.js";

const RUNTIME_MODULE = "litsx";
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
];

export default createRuntimeHooksTransform({
  pluginName: "transform-litsx-hooks",
  runtimeModule: RUNTIME_MODULE,
  importSources: IMPORT_SOURCES,
  helperNames: RUNTIME_HELPERS,
});
