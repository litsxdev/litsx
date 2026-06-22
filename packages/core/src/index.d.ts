import type { LitElement, ReactiveElement } from "lit";

export interface LitsxJsxNode {
  $$typeof: symbol;
  type: unknown;
  key: string | number | null;
  props: Record<string, unknown>;
  __source?: unknown;
  __self?: unknown;
}

export type LitsxRenderable =
  | LitsxJsxNode
  | string
  | number
  | boolean
  | null
  | undefined
  | Iterable<unknown>;

export type LitsxRef<T> = T | ((value: T | null) => void) | null;

export interface LitsxBaseAttributes {
  key?: string | number;
  slot?: string;
  class?: string;
  part?: string;
  style?: string | Partial<CSSStyleDeclaration>;
  /**
   * Authored child content passed between component tags.
   * LitSX treats this as projected content for the default slot.
   * In authored component bodies, implicit `children` projection is only supported as
   * a single direct JSX child expression such as `{children}` or `{props.children}`.
   * For named slots, repeated distribution, or other composition patterns, use explicit
   * `<slot>` markup or host-content hooks instead of treating `children` as ordinary data.
   */
  children?: LitsxRenderable;
  ref?: LitsxRef<unknown>;
  [attributeName: `data-${string}`]: unknown;
  [attributeName: `aria-${string}`]: string | number | boolean | undefined;
}

export interface LitsxDomAttributes<Target = EventTarget> {
  /**
   * Reserved for future JSX-authored event typing.
   * LitSX currently treats Lit listener syntax (`@event`) as a parser-level feature,
   * so the public JSX type surface intentionally avoids React-style `onClick` props.
   */
  _currentTarget?: Target | undefined;
  /**
   * Tooling virtualizes authored `@event` bindings to `__litsx_event_*` attributes
   * so TypeScript can parse and typecheck LitSX-authored JSX.
   */
  [attributeName: `__litsx_event_${string}`]: ((event?: Event) => unknown) | undefined;
  /**
   * Tooling virtualizes authored `.prop` bindings to `__litsx_prop_*` attributes
   * while preserving the original source spans for editor features.
   */
  [attributeName: `__litsx_prop_${string}`]: unknown;
  /**
   * Tooling virtualizes authored `?attr` bindings to `__litsx_bool_*` attributes
   * while preserving the original source spans for editor features.
   */
  [attributeName: `__litsx_bool_${string}`]: boolean | undefined;
}

export type LitsxHostElementProps<TElement> = Omit<
  Partial<TElement>,
  "children" | "style" | "part" | "slot" | "className"
>;

export type LitsxElementProps<TElement = HTMLElement> =
  & LitsxBaseAttributes
  & LitsxDomAttributes<TElement>
  & LitsxHostElementProps<TElement>;

export type LitsxCustomElementProps =
  & LitsxBaseAttributes
  & LitsxDomAttributes<EventTarget>
  & {
    [attributeName: string]: unknown;
  };

export type LitsxIntrinsicElements = {
  [TagName in keyof HTMLElementTagNameMap]: LitsxElementProps<
    HTMLElementTagNameMap[TagName]
  >;
} & {
  "error-boundary": LitsxElementProps<ErrorBoundary> & ErrorBoundaryProps;
  "suspense-boundary": LitsxElementProps<SuspenseBoundary> & SuspenseBoundaryProps;
  "suspense-list": LitsxElementProps<SuspenseList> & SuspenseListProps;
  [customElementName: `${string}-${string}`]: LitsxCustomElementProps;
};

export type LitsxComponent<Props = Record<string, unknown>> =
  (props: Props) => LitsxRenderable;

export interface SuspenseBoundaryProps {
  /**
   * Content projected into the boundary when it is ready to reveal.
   */
  children?: LitsxRenderable;
  /**
   * Fallback UI rendered while the boundary is waiting for its content.
   */
  fallback?: LitsxRenderable;
}

export interface ErrorBoundaryProps {
  /**
   * Content projected into the boundary while no error has been captured.
   */
  children?: LitsxRenderable;
  /**
   * Fallback UI rendered after the boundary captures an error.
   */
  fallback?: LitsxRenderable | ((error: unknown) => LitsxRenderable);
  /**
   * Optional callback invoked when the boundary captures an error.
   */
  onError?: (error: unknown) => void;
}

export interface SuspenseListProps {
  /**
   * Suspense boundary content coordinated by the list.
   */
  children?: LitsxRenderable;
  /**
   * Order in which sibling boundaries are allowed to reveal.
   */
  revealOrder?: "forwards" | "backwards" | "together";
  /**
   * Strategy used for boundaries that are still pending behind the current reveal point.
   */
  tail?: "collapsed" | "hidden";
}

/**
 * Show fallback UI when a subtree throws during render.
 */
export declare class ErrorBoundary extends LitElement {
  failed: boolean;
  error: unknown;
  onError: ((error: unknown) => void) | null;
  /**
   * Renderer props declared by a parent keep the parent's authored render context.
   * LitSX may project renderer output through slots when the subtree contains custom elements,
   * and render it inline when the subtree is intrinsic-only.
   */
  fallbackRenderer: ((error: unknown) => unknown) | null;
  /**
   * Renderer props declared by a parent keep the parent's authored render context.
   * LitSX may project renderer output through slots when the subtree contains custom elements,
   * and render it inline when the subtree is intrinsic-only.
   */
  contentRenderer: (() => unknown) | null;
}

/**
 * Show fallback UI while a suspense region is waiting to reveal.
 */
export declare class SuspenseBoundary extends LitElement {
  pending: boolean;
  resolved: boolean;
  showing: string;
  phase: string;
  /**
   * Renderer props declared by a parent keep the parent's authored render context.
   * LitSX may project renderer output through slots when the subtree contains custom elements,
   * and render it inline when the subtree is intrinsic-only.
   */
  fallbackRenderer: (() => unknown) | null;
  /**
   * Renderer props declared by a parent keep the parent's authored render context.
   * LitSX may project renderer output through slots when the subtree contains custom elements,
   * and render it inline when the subtree is intrinsic-only.
   */
  contentRenderer: (() => unknown) | null;
}

/**
 * Coordinate reveal order across sibling suspense boundaries.
 */
export declare class SuspenseList extends ReactiveElement {
  revealOrder: "forwards" | "backwards" | "together";
  tail: "collapsed" | "hidden";
}

export { ErrorBoundary as ErrorBoundaryElement };
export { SuspenseBoundary as SuspenseBoundaryElement };
export { SuspenseList as SuspenseListElement };

/**
 * Run an effect after the component finishes updating.
 */
export declare function useAfterUpdate(
  callback: () => void | (() => void),
  deps?: unknown[]
): void;
/**
 * Run an effect during commit, before the next frame paints.
 */
export declare function useOnCommit(
  callback: () => void | (() => void),
  deps?: unknown[]
): void;
/**
 * Set up work that stays active while the component remains connected.
 */
export declare function useOnConnect(
  callback: () => void | (() => void),
  deps?: unknown[]
): void;
/**
 * Return the current component instance.
 */
export declare function useHost<THost extends object = object>(): THost;
export interface LitsxHostContent {
  text: string;
  nodes: Node[];
  hasContent: boolean;
  slots: Record<string, Node[]> & {
    default: Node[];
  };
}
/**
 * Read reactive light DOM content from the current component.
 */
export declare function useHostContent(
  options?: { trim?: boolean }
): LitsxHostContent;
/**
 * Read reactive text content projected into the current component.
 */
export declare function useTextContent(
  options?: { trim?: boolean }
): string;
/**
 * Read reactive projected nodes for one slot.
 */
export declare function useSlot(slotName?: string): Node[];
/**
 * Memoize a derived value until its dependencies change.
 */
export declare function useMemoValue<T>(
  factory: () => T,
  deps?: unknown[]
): T;
/**
 * Keep a callback stable until its dependencies change.
 */
export declare function useStableCallback<T extends (...args: never[]) => unknown>(
  callback: T,
  deps?: unknown[]
): T;
/**
 * Keep an event callback identity stable while always calling the latest logic.
 */
export declare function useEvent<T extends (...args: never[]) => unknown>(
  callback: T
): T;
/**
 * Emit a CustomEvent from the current host.
 */
export declare function useEmit(): <T = undefined>(
  type: string,
  detail?: T,
  options?: {
    bubbles?: boolean;
    composed?: boolean;
    cancelable?: boolean;
  }
) => boolean;
/**
 * Read the value from the previous render.
 */
export declare function usePrevious<T>(
  value: T,
  initialValue?: T
): T | undefined;
/**
 * Manage local state with a reducer.
 */
export declare function useReducedState<TState, TAction, TInitArg = TState>(
  reducer: (state: TState, action: TAction) => TState,
  initialArg: TInitArg,
  init?: (arg: TInitArg) => TState
): [TState, (action: TAction | ((value: TState) => TState)) => void];
/**
 * Store local component state.
 */
export declare function useState<T>(
  initial: T | (() => T)
): [T, (next: T | ((value: T) => T)) => void];
/**
 * Manage a value that can be controlled from props or owned locally by the component.
 */
export declare function useControlledState<T>(options: {
  value?: T;
  defaultValue?: T | (() => T);
  onChange?: (value: T) => void;
}): [T | undefined, (next: T | ((value: T | undefined) => T)) => void];
/**
 * Manage async state transitions behind a single run function.
 */
export declare function useAsyncState<TState, TArgs extends unknown[] = []>(
  initialState: TState | (() => TState),
  action: (state: TState, ...args: TArgs) => TState | Promise<TState>
): [
  TState,
  (...args: TArgs) => Promise<TState>,
  {
    pending: boolean;
    error: unknown | null;
    reset: () => void;
  }
];
/**
 * Apply an optimistic overlay on top of authoritative state.
 */
export declare function useOptimistic<TState>(
  state: TState
): [TState, (value: TState) => void, () => void];
export declare function useOptimistic<TState, TInput>(
  state: TState,
  updateFn: (currentState: TState, optimisticValue: TInput) => TState
): [TState, (value: TInput) => void, () => void];
/**
 * Schedule non-urgent updates and track whether they are pending.
 */
export declare function useTransition(): [boolean, <T>(callback: () => T) => T];
/**
 * Schedule non-urgent updates using the same transition machinery as useTransition.
 */
export declare function startTransition<T>(callback: () => T): T;
/**
 * Let expensive consumers lag behind a fast-changing value.
 */
export declare function useDeferredValue<T>(
  value: T,
  options?: { timeout?: number }
): T;
type LitsxStyleValue = string | number | null | undefined | false;
type LitsxStyleFactory = () => LitsxStyleValue;
/**
 * Apply a dynamic style property to the current component host.
 */
export declare function useStyle(
  propertyName: string,
  ...args:
    | [value: LitsxStyleValue]
    | [compute: LitsxStyleFactory]
    | [compute: LitsxStyleFactory, deps: unknown[]]
): void;
/**
 * Store a mutable value across renders without causing updates.
 */
export declare function useRef<T>(
  initialValue?: T
): { current: T | undefined };
/**
 * Generate a stable id for the current component instance.
 */
export declare function useId(): string;
/**
 * Run a callback ref through the component lifecycle.
 */
export declare function useCallbackRef(
  getTarget: () => Element | null,
  callback: (node: Element | null) => void,
  deps?: unknown[]
): void;
/**
 * Expose a small imperative API through a ref.
 */
export declare function useExpose<T>(
  ref: { current: T | null } | ((value: T | null) => void),
  createHandle: () => T,
  deps?: unknown[]
): void;
/**
 * Subscribe to external state and read its current snapshot.
 */
export declare function useExternalStore<T>(
  subscribe: (listener: () => void) => () => void,
  getSnapshot: () => T,
  getServerSnapshot?: () => T
): T;
export declare function ensureLazyElement(
  host: object,
  tagName: string,
  value: unknown
): void;
