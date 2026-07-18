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
export declare const LITSX_HOOK: unique symbol;
export declare const LITSX_COMPONENT: unique symbol;
export declare const LITSX_HOST_TYPE_ID: unique symbol;
export declare const STRUCTURAL_HOOK_ENTRIES: unique symbol;
export interface LitsxHook {
  readonly [LITSX_HOOK]: true;
}
export interface LitsxComponentStatic {
  readonly [LITSX_COMPONENT]: true;
}
export interface LitsxHostTypeIdStatic extends LitsxComponentStatic {
  readonly [LITSX_HOST_TYPE_ID]: string;
}
export declare function isLitsxHook(value: unknown): value is LitsxHook;
export declare function isLitsxComponentClass(
  value: unknown
): value is LitsxComponentStatic;

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

export type LitsxEventHandler<TEvent extends Event = Event> = {
  bivarianceHack(event: TEvent): unknown;
}["bivarianceHack"];

export type LitsxKnownDomEventAttributes<Target = EventTarget> = {
  [EventName in keyof GlobalEventHandlersEventMap as `__litsx_event_${EventName & string}`]?: LitsxEventHandler<
    GlobalEventHandlersEventMap[EventName] & CustomEvent<any> & { currentTarget: Target }
  >;
};

export type LitsxFormEventAttributes<Target = EventTarget> =
  Target extends HTMLFormElement
    ? {
        __litsx_event_reset?: LitsxEventHandler<Event & { currentTarget: Target }>;
        __litsx_event_formdata?: LitsxEventHandler<FormDataEvent & { currentTarget: Target }>;
      }
    : {};

export type LitsxCustomEventAttributes = {
  [attributeName: `__litsx_event_${string}-${string}`]: LitsxEventHandler<CustomEvent<any>> | undefined;
};

export type LitsxAnyEventAttributes = {
  /**
   * Last-resort fallback for authored event names that do not have a reliable DOM event map entry.
   * All authored events also accept CustomEvent handlers; this escape stays intentionally
   * broad so the catch-all index does not over-constrain known DOM or custom events when
   * intersected with narrower maps.
   */
  [attributeName: `__litsx_event_${string}`]: LitsxEventHandler<any> | undefined;
};

export type LitsxDomAttributes<Target = EventTarget> =
  & LitsxKnownDomEventAttributes<Target>
  & LitsxFormEventAttributes<Target>
  & LitsxCustomEventAttributes
  & LitsxAnyEventAttributes
  & {
    /**
     * Reserved for future JSX-authored event typing.
     * LitSX currently treats Lit listener syntax (`@event`) as a parser-level feature,
     * so the public JSX type surface intentionally avoids React-style `onClick` props.
     */
    _currentTarget?: Target | undefined;
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
  };

export type LitsxHostElementProps<TElement> = Omit<
  Partial<TElement>,
  "children" | "style" | "part" | "slot" | "className"
>;

export type LitsxNativeAttributeAliases<TElement> =
  TElement extends HTMLLabelElement | HTMLOutputElement
    ? {
        /**
         * Native `for` attribute spelling for intrinsic `<label>` and `<output>` elements.
         * LitSX prefers native DOM-aligned attribute names in authored JSX even when the
         * corresponding DOM property is exposed as `htmlFor`.
         */
        for?: string;
      }
    : {};

export type LitsxElementProps<TElement = HTMLElement> =
  & LitsxBaseAttributes
  & LitsxDomAttributes<TElement>
  & LitsxNativeAttributeAliases<TElement>
  & LitsxHostElementProps<TElement>;

export type LitsxErrorBoundaryElementProps =
  & LitsxBaseAttributes
  & LitsxDomAttributes<ErrorBoundary>
  & Omit<LitsxHostElementProps<ErrorBoundary>, "fallback" | "content">
  & ErrorBoundaryProps;

export type LitsxSuspenseBoundaryElementProps =
  & LitsxBaseAttributes
  & LitsxDomAttributes<SuspenseBoundary>
  & Omit<LitsxHostElementProps<SuspenseBoundary>, "fallback" | "content">
  & SuspenseBoundaryProps;

export type LitsxCustomElementProps =
  & LitsxBaseAttributes
  & LitsxDomAttributes<EventTarget>
  & {
    [attributeName: string]: unknown;
  };

export type LitsxReservedIntrinsicElementName =
  | "error-boundary"
  | "suspense-boundary"
  | "suspense-list";

export type LitsxCustomIntrinsicElements = {
  [TagName in `${string}-${string}` as TagName extends LitsxReservedIntrinsicElementName
    ? never
    : TagName]: LitsxCustomElementProps;
};

export type LitsxIntrinsicElements = {
  [TagName in keyof HTMLElementTagNameMap]: LitsxElementProps<
    HTMLElementTagNameMap[TagName]
  >;
} & LitsxCustomIntrinsicElements & {
  "error-boundary": LitsxErrorBoundaryElementProps;
  "suspense-boundary": LitsxSuspenseBoundaryElementProps;
  "suspense-list": LitsxElementProps<SuspenseList> & SuspenseListProps;
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
  static readonly [LITSX_COMPONENT]: true;
  failed: boolean;
  error: unknown;
  onError: ((error: unknown) => void) | null;
  /**
   * Internal renderer generated from the authored fallback prop.
   */
  fallback: ((error: unknown) => unknown) | null;
  /**
   * Internal renderer generated from authored children.
   */
  content: (() => unknown) | null;
}

/**
 * Show fallback UI while a suspense region is waiting to reveal.
 */
export declare class SuspenseBoundary extends LitElement {
  static readonly [LITSX_COMPONENT]: true;
  pending: boolean;
  resolved: boolean;
  showing: string;
  phase: string;
  /**
   * Internal renderer generated from the authored fallback prop.
   */
  fallback: (() => unknown) | null;
  /**
   * Internal renderer generated from authored children.
   */
  content: (() => unknown) | null;
}

/**
 * Coordinate reveal order across sibling suspense boundaries.
 */
export declare class SuspenseList extends ReactiveElement {
  static readonly [LITSX_COMPONENT]: true;
  revealOrder: "forwards" | "backwards" | "together";
  tail: "collapsed" | "hidden";
}

export { ErrorBoundary as ErrorBoundaryElement };
export { SuspenseBoundary as SuspenseBoundaryElement };
export { SuspenseList as SuspenseListElement };

export declare function renderWithSoftSuspense<T>(
  host: object,
  render: () => T
): T;

export declare function collectSoftSuspenseThenables<T>(
  collector: { add(thenable: Promise<unknown>): void },
  render: () => T
): T;

export type LitsxHostMiddlewareLifecycleMethod =
  | "connectedCallback"
  | "disconnectedCallback"
  | "attributeChangedCallback"
  | "formAssociatedCallback"
  | "formDisabledCallback"
  | "formResetCallback"
  | "formStateRestoreCallback"
  | "scheduleUpdate"
  | "shouldUpdate"
  | "willUpdate"
  | "update"
  | "updated"
  | "firstUpdated"
  | "getUpdateComplete";

export type LitsxHostMiddlewareNext<TResult = unknown> = () => TResult;

/**
 * Compiler-provided metadata for one authored structural-hook callsite.
 *
 * `callsitePath` is the stable public field. It can be used for resource
 * identity, diagnostics, SSR records, and debug tooling. Other fields are
 * informational unless documented by LitSX.
 */
export interface LitsxStructuralMeta {
  /**
   * Stable authored expansion path for this structural callsite.
   */
  callsitePath: string[];
  [key: string]: unknown;
}

/**
 * Lifecycle middleware for a structural hook.
 *
 * Middleware wraps the host lifecycle method in structural entry order.
 * `next()` invokes the next middleware and eventually the host base
 * implementation. Middleware may run logic before `next()`, after `next()`,
 * or both. Calling `next()` more than once is an error.
 */
export interface LitsxStructuralState<TStaticState = undefined, TInstanceState = undefined> {
  /**
   * Class/type-phase state produced by `static(...)`.
   */
  static: TStaticState;
  /**
   * Per-host-instance state produced by `setup(...)`.
   */
  instance: TInstanceState;
}

export type LitsxHostMiddleware<
  TResult = unknown,
  TStaticState = undefined,
  TInstanceState = undefined
> = (
  host: unknown,
  state: LitsxStructuralState<TStaticState, TInstanceState>,
  next: LitsxHostMiddlewareNext<TResult>,
  args: unknown[],
  meta: LitsxStructuralMeta,
  entry: LitsxStructuralEntry
) => TResult;

export type LitsxHostMiddlewareMap<TStaticState = undefined, TInstanceState = undefined> = Partial<
  Record<LitsxHostMiddlewareLifecycleMethod, LitsxHostMiddleware<unknown, TStaticState, TInstanceState>>
>;

export interface LitsxHostAccessorDescriptor<TValue = unknown> {
  get?: () => TValue;
  set?: {
    bivarianceHack(value: TValue): void;
  }["bivarianceHack"];
}

export type LitsxHostAccessorMap = Record<string, LitsxHostAccessorDescriptor<unknown>>;
export type LitsxStructuralPropMap = Record<string, unknown>;

/**
 * Public structural-hook definition.
 *
 * Structural hooks are consumed like ordinary hooks:
 *
 * ```tsx
 * const value = useSomething(args);
 * ```
 *
 * The LitSX compiler rewrites that authored callsite to the host middleware
 * runtime. Component authors do not manually register structural entries.
 *
 * `setup(host, args, staticState, meta, entry)` creates persistent mutable
 * instance state for one structural callsite in one host instance. The state
 * is retained across updates and is exposed as `state.instance` to `use`,
 * accessors, and lifecycle middleware. Use it for cached resources,
 * host-linked handles, lifecycle coordination, or derived persistent data.
 *
 * `use(host, state, args, meta, entry)` is the render-time hook reader. It may call normal hooks and
 * structural hooks transitively, subject to the same static hook-order rules as
 * ordinary hooks. Dynamic structural-hook lookup is not supported: aliases,
 * object/array containers, runtime selection, and computed namespace access are
 * build-time errors.
 *
 * `middlewares` wraps host lifecycle methods through `next()`. The host
 * middleware runtime intentionally does not deduplicate entries: every authored
 * callsite gets its own state and middleware entry. Resource dedupe belongs in
 * hook-specific runtimes.
 *
 * `props(args, meta, entry)` publishes structural host property metadata into
 * the component's merged `static properties` surface.
 *
 * `accessors(host, state, meta, entry)` publishes host instance accessors such
 * as readonly platform-facing getters or low-level form/control properties.
 * These accessors are installed on the host instance itself as part of the
 * structural runtime, not through the imperative `useExpose()` method surface.
 */
export interface LitsxStructuralDefinition<
  TArgs extends unknown[] = unknown[],
  TResult = unknown,
  TStaticState = undefined,
  TInstanceState = undefined
> {
  /**
   * Class/type structural phase. It does not participate in host instance
   * lifecycle and is not wired through lifecycle middleware.
   */
  static?: (
    ...argsAndMeta: [...TArgs, meta: LitsxStructuralMeta, entry: LitsxStructuralEntry]
  ) => TStaticState;
  props?: LitsxStructuralPropMap | ((
    args: TArgs,
    meta: LitsxStructuralMeta,
    entry: LitsxStructuralEntry
  ) => LitsxStructuralPropMap | null | undefined);
  use?: (
    host: unknown,
    state: LitsxStructuralState<TStaticState, TInstanceState>,
    args: TArgs,
    meta: LitsxStructuralMeta,
    entry: LitsxStructuralEntry
  ) => TResult;
  createState?: (
    host: unknown,
    args: TArgs,
    staticState: TStaticState,
    meta: LitsxStructuralMeta,
    entry: LitsxStructuralEntry
  ) => TInstanceState;
  setup?: (
    host: unknown,
    args: TArgs,
    staticState: TStaticState,
    meta: LitsxStructuralMeta,
    entry: LitsxStructuralEntry
  ) => TInstanceState;
  middlewares?: LitsxHostMiddlewareMap<TStaticState, TInstanceState>;
  accessors?: (
    host: unknown,
    state: LitsxStructuralState<TStaticState, TInstanceState>,
    meta: LitsxStructuralMeta,
    entry: LitsxStructuralEntry
  ) => LitsxHostAccessorMap;
}

/**
 * Callable hook value returned by `defineHook`.
 *
 * The value is a normal callable hook from the author's point of view. LitSX
 * attaches hidden compiler/runtime metadata to the function; that metadata is
 * not public API. Calling this function without the LitSX transform is an error
 * because structural hooks require compiled host wiring.
 */
export type LitsxStructuralHook<TArgs extends unknown[] = unknown[], TResult = unknown> = (
  ...args: TArgs
) => TResult;

export interface LitsxStructuralEntry {
  /**
   * Backwards-compatible stable identifier for this authored callsite.
   * Prefer `callsiteId` in newly generated code.
   */
  id: string;
  /**
   * Stable local index for runtime reads such as `runtime.read(index)`.
   */
  callsiteIndex: number;
  /**
   * Stable serializable identifier for diagnostics, SSR metadata, or hook-level
   * resource runtimes. Entries are not deduplicated by this id.
   */
  callsiteId: string;
  /**
   * Stable authored expansion path for nested structural hook usage.
   */
  callsitePath: string[];
  definition: LitsxStructuralDefinition | unknown;
  args: unknown[];
  meta: LitsxStructuralMeta;
  state: unknown;
  staticState?: unknown;
  middlewares?: LitsxHostMiddlewareMap | null;
}

export interface LitsxStructuralEntryInput {
  id?: string;
  callsiteIndex?: number;
  callsiteId?: string;
  callsitePath?: string[];
  path?: string[];
  definition?: LitsxStructuralDefinition | unknown;
  args?: unknown[];
  meta?: Record<string, unknown>;
  state?: unknown;
  staticState?: unknown;
  middlewares?: LitsxHostMiddlewareMap | null;
}

export declare class HostMiddlewareRuntime {
  constructor(
    host: unknown,
    entries?: LitsxStructuralEntryInput[] | ((host: unknown) => LitsxStructuralEntryInput[])
  );
  readonly host: unknown;
  readonly entries: LitsxStructuralEntry[];
  getEntry(index: number): LitsxStructuralEntry | null;
  ensureEntry(index: number, entry: LitsxStructuralEntryInput): LitsxStructuralEntry;
  read(index: number, args?: unknown[] | null, meta?: Record<string, unknown> | null): unknown;
  run(methodName: LitsxHostMiddlewareLifecycleMethod, base: () => unknown): unknown;
  run(methodName: LitsxHostMiddlewareLifecycleMethod, args: unknown[], base: () => unknown): unknown;
  connectedCallback(base: () => unknown): unknown;
  connectedCallback(args: unknown[], base: () => unknown): unknown;
  disconnectedCallback(base: () => unknown): unknown;
  disconnectedCallback(args: unknown[], base: () => unknown): unknown;
  attributeChangedCallback(args: unknown[], base: () => unknown): unknown;
  formAssociatedCallback(args: unknown[], base: () => unknown): unknown;
  formDisabledCallback(args: unknown[], base: () => unknown): unknown;
  formResetCallback(base: () => unknown): unknown;
  formResetCallback(args: unknown[], base: () => unknown): unknown;
  formStateRestoreCallback(args: unknown[], base: () => unknown): unknown;
  scheduleUpdate(base: () => unknown): unknown;
  scheduleUpdate(args: unknown[], base: () => unknown): unknown;
  shouldUpdate(args: unknown[], base: () => unknown): unknown;
  willUpdate(args: unknown[], base: () => unknown): unknown;
  update(args: unknown[], base: () => unknown): unknown;
  updated(args: unknown[], base: () => unknown): unknown;
  firstUpdated(args: unknown[], base: () => unknown): unknown;
  getUpdateComplete(base: () => unknown): unknown;
  getUpdateComplete(args: unknown[], base: () => unknown): unknown;
}

export type LitsxStructuralHostConstructor<TInstance = object> = abstract new (
  ...args: any[]
) => TInstance;

export interface LitsxStructuralHostInstance {
  __litsxHostMiddlewareRuntime: HostMiddlewareRuntime;
  __litsxReadStructuralEntry(
    index: number,
    args?: unknown[] | null,
    meta?: Record<string, unknown> | null
  ): unknown;
}

/**
 * Define a structural hook.
 *
 * The locked public authoring surface is `defineHook({ static, setup,
 * middlewares, accessors, use })`. The returned value remains callable like a
 * normal hook, while the compiler/runtime metadata bridge is carried
 * internally on the function.
 */
export declare function defineHook<
  TArgs extends unknown[] = unknown[],
  TResult = unknown,
  TStaticState = undefined,
  TInstanceState = undefined
>(
  definition: LitsxStructuralDefinition<TArgs, TResult, TStaticState, TInstanceState>
): LitsxStructuralHook<TArgs, TResult>;

export declare function isStructuralHook(value: unknown): value is LitsxStructuralHook;
export declare function resolveStructuralProps(
  owner: unknown,
  base?: Record<PropertyKey, unknown> | null
): Record<PropertyKey, unknown>;

export declare function resolveStructuralEntry(
  host: unknown,
  callsiteIndex: number,
  callsiteId: string,
  definition: unknown,
  args?: unknown[],
  meta?: Record<string, unknown>
): unknown;

export declare function resolveStructuralStaticEntry(
  owner: unknown,
  callsiteIndex: number,
  callsiteId: string,
  definition: unknown,
  args?: unknown[],
  meta?: Record<string, unknown>
): unknown;

export declare function HostMiddlewareMixin<TBase extends LitsxStructuralHostConstructor>(
  Base: TBase
): LitsxStructuralHostConstructor<InstanceType<TBase> & LitsxStructuralHostInstance>;

export declare function createHostMiddlewareRuntime(
  host: unknown,
  entries?: LitsxStructuralEntryInput[] | ((host: unknown) => LitsxStructuralEntryInput[])
): HostMiddlewareRuntime;

export type LitsxFormSubmitValue = string | File | FormData | null;

export interface LitsxElementInternalsHandle {
  supported: boolean;
  internals: ElementInternals | null;
}

export interface LitsxFormValue<TValue = LitsxFormSubmitValue> {
  form: HTMLFormElement | null;
  disabled: boolean;
  value: TValue;
  defaultValue: TValue;
  restoreState: TValue | null;
  restoreMode: string | null;
  setValue(next: TValue | ((value: TValue) => TValue)): TValue;
  setDefaultValue(next: TValue | ((value: TValue) => TValue)): TValue;
  setFormValue(value: LitsxFormSubmitValue, restoreState?: TValue): void;
}

export interface LitsxValiditySnapshot {
  badInput: boolean;
  customError: boolean;
  patternMismatch: boolean;
  rangeOverflow: boolean;
  rangeUnderflow: boolean;
  stepMismatch: boolean;
  tooLong: boolean;
  tooShort: boolean;
  typeMismatch: boolean;
  valid: boolean;
  valueMissing: boolean;
}

export interface LitsxFormValidity {
  supported: boolean;
  willValidate: boolean;
  validity: LitsxValiditySnapshot;
  validationMessage: string;
  setValidity(
    flags?: ValidityStateFlags | null,
    message?: string,
    anchor?: HTMLElement | null
  ): void;
  checkValidity(): boolean;
  reportValidity(): boolean;
}

export declare const useElementInternals: () => LitsxElementInternalsHandle;
export declare const useFormValue: <TValue = string | null>(
  defaultValue?: TValue
) => LitsxFormValue<TValue>;
export declare const useFormValidity: () => LitsxFormValidity;

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
 * Return a stable identifier for the current LitSX component type.
 *
 * All instances of the same compiled component share this value. Use it for
 * cache keys, SSR resource identity, or hydration metadata that should follow
 * the component definition rather than the instance or a single hook callsite.
 */
export declare function useHostTypeId(): string;
/**
 * Return a stable identifier for this authored callsite.
 *
 * LitSX tooling injects callsite metadata so this value is stable across SSR
 * and client hydration and does not depend on render order or instance order.
 * Use it for callsite-scoped resource/preload identity, not for unique DOM ids.
 * When cache identity should follow the component definition, prefer
 * `useHostTypeId()`.
 */
export declare function useStableId(): string;
/**
 * Run a callback ref through the component lifecycle.
 */
export declare function useCallbackRef(
  getTarget: () => Element | null,
  callback: (node: Element | null) => void,
  deps?: unknown[]
): void;
/**
 * Publish a small imperative method surface on the component instance or through a ref.
 * When the same target receives the same method name more than once, the last publisher wins.
 */
export declare function useExpose<T extends Record<string, (...args: any[]) => unknown>>(
  createHandle: () => T,
  deps?: unknown[]
): void;
export declare function useExpose<T extends Record<string, (...args: any[]) => unknown>>(
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
