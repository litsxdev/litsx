// `css` is the canonical LitSX component-style authoring primitive. Re-export
// the original Lit binding so component modules can keep their common imports
// on one line without introducing a parallel styling abstraction.
export { css } from "lit";

/**
 * Mark a component stylesheet as a complete replacement for inherited styles.
 * The compiler consumes this marker while the runtime behavior stays an
 * ordinary CSSResultGroup identity.
 */
export function replaceStyles(styles) {
  return styles;
}

export {
  ErrorBoundary,
  ErrorBoundaryElement,
} from "./error-boundary.js";
export {
  SuspenseBoundary,
  SuspenseBoundaryElement,
} from "./suspense-boundary.js";
export {
  SuspenseList,
  SuspenseListElement,
} from "./suspense-list.js";

export { EffectsController } from "./effects-controller.js";
export {
  collectSoftSuspenseThenables,
  renderWithHooks,
} from "./runtime-suspense.js";
export {
  __getLitsxNoscriptFactory,
  __litsxNoscript,
} from "./noscript.js";
export {
  createExecutionContextKey,
  getCurrentExecutionContext,
} from "./execution-context.js";
export { useSsrResourceSnapshot } from "./ssr-resource-snapshot.js";
export {
  LITSX_HOOK,
  isLitsxHook,
} from "./hook-metadata.js";
export {
  LITSX_COMPONENT,
  LITSX_HYDRATABLE_TAG,
  LITSX_EVENTS,
  LITSX_HOST_TYPE_ID,
  LITSX_LIGHT_DOM_STYLE_SCOPE,
  isLitsxComponentClass,
} from "./elements/index.js";
export {
  applyStructuralHooks,
  defineHook,
  readStructuralHook,
} from "./structural-hooks-runtime.js";
export {
  useElementInternals,
  useFormValidity,
  useFormValue,
} from "./form-hooks.js";

export {
  ensureLazyElement,
  lazy,
  useAfterUpdate,
  useOnCommit,
  useOnConnect,
  useMemoValue,
  useStableCallback,
  useEvent,
  useEmit,
} from "./effect-hooks.js";

export {
  useHost,
  useHostTypeId,
  useHostContent,
  useTextContent,
  useSlot,
  useStyle,
} from "./host-hooks.js";

export {
  usePrevious,
  useReducedState,
  useState,
  useControlledState,
  useAsyncState,
  useOptimistic,
  useTransition,
  startTransition,
  useDeferredValue,
  useRef,
  useId,
  useStableId,
  useCallbackRef,
  useExpose,
  useExternalStore,
} from "./state-hooks.js";

export { jsxSpreadElement } from "./jsx-spread.js";
export { createRef, ref } from "lit/directives/ref.js";
