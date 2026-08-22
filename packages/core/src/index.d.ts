import type { CSSResultGroup, LitElement, ReactiveElement, TemplateResult } from "lit";
import type { DirectiveResult } from "lit/directive.js";
export { css } from "lit";
export { createRef, ref } from "lit/directives/ref.js";

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
  | TemplateResult
  | DirectiveResult
  | string
  | number
  | boolean
  | null
  | undefined
  | Iterable<unknown>;

/** A Lit-native ref. Assignment uses `.value`; cleanup publishes `undefined`. */
export type LitsxRef<T> =
  | { value: T | undefined }
  | {
      bivarianceHack(value: T | undefined): void;
    }["bivarianceHack"];
export interface ExecutionContextKey<T> {
  readonly __brand?: T;
}
export interface LitsxExecutionContext {
  get<T>(key: ExecutionContextKey<T>): T | undefined;
  set<T>(key: ExecutionContextKey<T>, value: T): void;
  has<T>(key: ExecutionContextKey<T>): boolean;
}
export type JsonSerializable =
  | null
  | boolean
  | number
  | string
  | JsonSerializable[]
  | { [key: string]: JsonSerializable };

export interface SsrResourceSnapshotOptions {
  /** Stable library-owned identity for the global resource cache. */
  key: string;
  /** Read the completed cache after the final SSR render pass. */
  capture: () => JsonSerializable;
  /** Restore the cache synchronously before hydration modules render. */
  restore: (snapshot: JsonSerializable) => void;
}

/**
 * Register or restore a library-owned global SSR resource cache.
 *
 * This hook is inert outside an active LitSX SSR render or hydration payload.
 * Library runtimes should expose higher-level hooks rather than asking
 * applications to call this API or install hydration bootstrap code.
 */
export declare function useSsrResourceSnapshot(
  options: SsrResourceSnapshotOptions,
): void;
export declare const LITSX_HOOK: unique symbol;
export declare const LITSX_COMPONENT: unique symbol;
export declare const LITSX_EVENTS: unique symbol;
export declare const LITSX_HOST_TYPE_ID: unique symbol;
export declare const LITSX_LIGHT_DOM_STYLE_SCOPE: unique symbol;
export declare const LITSX_HYDRATABLE_TAG: unique symbol;
export interface LitsxHook {
  readonly [LITSX_HOOK]: true;
}
export interface LitsxEventMetadata {
  readonly events: readonly string[];
  readonly complete: boolean;
}
export interface LitsxEventDeclaration<
  Events extends Record<string, unknown>,
  Complete extends boolean = boolean,
> extends LitsxEventMetadata {
  readonly complete: Complete;
  readonly __types?: Events;
}
export interface LitsxComponentStatic<Events extends Record<string, unknown> = Record<string, unknown>> {
  readonly [LITSX_COMPONENT]: true;
  readonly [LITSX_EVENTS]?: LitsxEventDeclaration<Events, boolean>;
  readonly events?: LitsxEventDeclaration<Events, boolean>;
}

/**
 * Extension point for compile-time-only Component.styles sources. Packages
 * augment this registry without widening Lit's runtime CSSResultGroup.
 */
export interface LitsxStyleSourceRegistry {}
export type LitsxAuthoringStyle =
  | CSSResultGroup
  | LitsxStyleSourceRegistry[keyof LitsxStyleSourceRegistry]
  | readonly LitsxAuthoringStyle[];
export interface LitsxHydratableComponentStatic extends LitsxComponentStatic {
  readonly [LITSX_HYDRATABLE_TAG]: string;
}
export interface LitsxHostTypeIdStatic extends LitsxComponentStatic {
  readonly [LITSX_HOST_TYPE_ID]: string;
  readonly [LITSX_LIGHT_DOM_STYLE_SCOPE]?: string;
}
export declare function isLitsxHook(value: unknown): value is LitsxHook;
export declare function isLitsxComponentClass(
  value: unknown
): value is LitsxComponentStatic;
export declare function jsxSpreadElement(
  tagName: string,
  sources: ReadonlyArray<Record<string, unknown> | null | undefined>,
  options?: {
    component?: boolean | CustomElementConstructor;
    void?: boolean;
    namespace?: "html" | "svg";
    refAdapter?: (value: unknown) => unknown;
  },
  children?: unknown
): import("lit").TemplateResult;

/** @internal Compiler/runtime bridge for dynamic <noscript> fallback markup. */
export declare function __litsxNoscript(
  factory: () => unknown,
  elements?: Record<string, unknown> | null,
): unknown;
/** @internal SSR-only accessor for __litsxNoscript records. */
export declare function __getLitsxNoscriptFactory(value: unknown): {
  factory: () => unknown;
  elements: Record<string, unknown> | null;
} | null;

export interface LitsxBaseAttributes {
  id?: string;
  slot?: string;
  class?: string;
  accesskey?: string;
  autocapitalize?: string;
  autofocus?: boolean;
  contenteditable?: boolean | "true" | "false" | "plaintext-only";
  dir?: "ltr" | "rtl" | "auto";
  draggable?: boolean;
  enterkeyhint?: string;
  hidden?: boolean | "until-found";
  inert?: boolean;
  inputmode?: string;
  is?: string;
  itemid?: string;
  itemprop?: string;
  itemref?: string;
  itemscope?: boolean;
  itemtype?: string;
  lang?: string;
  nonce?: string;
  popover?: boolean | "" | "auto" | "manual" | "hint";
  role?: string;
  tabindex?: string | number;
  title?: string;
  translate?: boolean | "yes" | "no";
  virtualkeyboardpolicy?: "auto" | "manual";
  writingsuggestions?: boolean | "true" | "false";
  autoFocus?: boolean;
  spellCheck?: boolean;
  spellcheck?: boolean;
  part?: string;
  exportparts?: string;
  /**
   * Inline style attribute text.
   * LitSX does not support React-style object bindings such as `style={{ color: "red" }}` in authored JSX/TSX.
   * Use a serialized string value here, or `useStyle(...)` for dynamic host style properties.
   */
  style?: string;
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

export type LitsxEventListener<TEvent extends Event = Event> =
  | LitsxEventHandler<TEvent>
  | {
      handleEvent: LitsxEventHandler<TEvent>;
      capture?: boolean;
      once?: boolean;
      passive?: boolean;
    };

/** React-style DOM event props used by the optional compatibility surface. */
export type LitsxStandardDomEventAttributes<Target = EventTarget> = {
  [EventName in keyof GlobalEventHandlersEventMap as `on${Capitalize<EventName & string>}`]?: LitsxEventHandler<
    GlobalEventHandlersEventMap[EventName] & { currentTarget: Target }
  >;
} & {
  [EventName in keyof GlobalEventHandlersEventMap as `on${Capitalize<EventName & string>}Capture`]?: LitsxEventHandler<
    GlobalEventHandlersEventMap[EventName] & { currentTarget: Target }
  >;
} & {
  onDoubleClick?: LitsxEventHandler<MouseEvent & { currentTarget: Target }>;
  onDoubleClickCapture?: LitsxEventHandler<MouseEvent & { currentTarget: Target }>;
  onMouseDown?: LitsxEventHandler<MouseEvent & { currentTarget: Target }>;
  onMouseDownCapture?: LitsxEventHandler<MouseEvent & { currentTarget: Target }>;
  onMouseUp?: LitsxEventHandler<MouseEvent & { currentTarget: Target }>;
  onMouseUpCapture?: LitsxEventHandler<MouseEvent & { currentTarget: Target }>;
  onMouseMove?: LitsxEventHandler<MouseEvent & { currentTarget: Target }>;
  onMouseMoveCapture?: LitsxEventHandler<MouseEvent & { currentTarget: Target }>;
  onMouseEnter?: LitsxEventHandler<MouseEvent & { currentTarget: Target }>;
  onMouseLeave?: LitsxEventHandler<MouseEvent & { currentTarget: Target }>;
  onPointerDown?: LitsxEventHandler<PointerEvent & { currentTarget: Target }>;
  onPointerDownCapture?: LitsxEventHandler<PointerEvent & { currentTarget: Target }>;
  onPointerUp?: LitsxEventHandler<PointerEvent & { currentTarget: Target }>;
  onPointerUpCapture?: LitsxEventHandler<PointerEvent & { currentTarget: Target }>;
  onPointerMove?: LitsxEventHandler<PointerEvent & { currentTarget: Target }>;
  onPointerMoveCapture?: LitsxEventHandler<PointerEvent & { currentTarget: Target }>;
  onPointerEnter?: LitsxEventHandler<PointerEvent & { currentTarget: Target }>;
  onPointerLeave?: LitsxEventHandler<PointerEvent & { currentTarget: Target }>;
  onPointerCancel?: LitsxEventHandler<PointerEvent & { currentTarget: Target }>;
  onKeyDown?: LitsxEventHandler<KeyboardEvent & { currentTarget: Target }>;
  onKeyDownCapture?: LitsxEventHandler<KeyboardEvent & { currentTarget: Target }>;
  onKeyUp?: LitsxEventHandler<KeyboardEvent & { currentTarget: Target }>;
  onKeyUpCapture?: LitsxEventHandler<KeyboardEvent & { currentTarget: Target }>;
  onTouchStart?: LitsxEventHandler<TouchEvent & { currentTarget: Target }>;
  onTouchStartCapture?: LitsxEventHandler<TouchEvent & { currentTarget: Target }>;
  onTouchMove?: LitsxEventHandler<TouchEvent & { currentTarget: Target }>;
  onTouchMoveCapture?: LitsxEventHandler<TouchEvent & { currentTarget: Target }>;
  onTouchEnd?: LitsxEventHandler<TouchEvent & { currentTarget: Target }>;
  onTouchEndCapture?: LitsxEventHandler<TouchEvent & { currentTarget: Target }>;
  onDragStart?: LitsxEventHandler<DragEvent & { currentTarget: Target }>;
  onDragEnd?: LitsxEventHandler<DragEvent & { currentTarget: Target }>;
  onDragEnter?: LitsxEventHandler<DragEvent & { currentTarget: Target }>;
  onDragLeave?: LitsxEventHandler<DragEvent & { currentTarget: Target }>;
  onDragOver?: LitsxEventHandler<DragEvent & { currentTarget: Target }>;
  onAnimationStart?: LitsxEventHandler<AnimationEvent & { currentTarget: Target }>;
  onAnimationEnd?: LitsxEventHandler<AnimationEvent & { currentTarget: Target }>;
  onAnimationIteration?: LitsxEventHandler<AnimationEvent & { currentTarget: Target }>;
  onTransitionEnd?: LitsxEventHandler<TransitionEvent & { currentTarget: Target }>;
};

export type LitsxExplicitDomEventAttributes<Target = EventTarget> = {
  [EventName in keyof GlobalEventHandlersEventMap as `on:${EventName & string}`]?: LitsxEventListener<
    GlobalEventHandlersEventMap[EventName] & { currentTarget: Target }
  >;
};

/** Explicit JSX event channel for custom-element events. */
export type LitsxExplicitCustomEventAttributes = {
  [Name in `on:${string}`]?: LitsxEventListener<any>;
};

/** @deprecated Use LitsxExplicitCustomEventAttributes. */
export type LitsxStandardCustomEventAttributes<Props = {}> = LitsxExplicitCustomEventAttributes;

type LitsxStandardRepresentableEventName<Name extends string> =
  Name extends Lowercase<Name>
    ? Name extends `${string}:${string}` | `${string}.${string}`
      ? never
      : Name
    : never;

export type LitsxTypedCustomEventAttributes<
  Events extends Record<string, unknown>,
  Target = EventTarget,
> = {
  [Name in Extract<keyof Events, string> as LitsxStandardRepresentableEventName<Name> extends never
    ? never
    : `on:${Name}`]?: LitsxEventListener<
    CustomEvent<Events[Name]> & { currentTarget: Target }
  >;
};

export type LitsxDomAttributes<Target = EventTarget> =
  & LitsxExplicitDomEventAttributes<Target>
  & {
    _currentTarget?: Target | undefined;
  };

export type LitsxHostElementProps<TElement> = Omit<
  Partial<TElement>,
  "children" | "style" | "part" | "slot" | "className" | "htmlFor"
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
  & {
    [attributeName: string]: unknown;
  };

export type LitsxReservedIntrinsicElementName =
  | "error-boundary"
  | "suspense-boundary"
  | "suspense-list";

export type LitsxCustomIntrinsicElements = {
  [TagName in `${string}-${string}`]:
    TagName extends "error-boundary" ? LitsxErrorBoundaryElementProps :
    TagName extends "suspense-boundary" ? LitsxSuspenseBoundaryElementProps :
    TagName extends "suspense-list" ? LitsxElementProps<SuspenseList> & SuspenseListProps :
    LitsxCustomElementProps;
};

export type LitsxIntrinsicElements = {
  [TagName in keyof HTMLElementTagNameMap]: LitsxElementProps<
    HTMLElementTagNameMap[TagName]
  >;
} & LitsxCustomIntrinsicElements;

export type LitsxComponent<
  Props = Record<string, unknown>,
  Events extends Record<string, unknown> = Record<string, unknown>,
> = ((props: Props) => LitsxRenderable) & {
  readonly events?: LitsxEventDeclaration<Events, boolean>;
  styles?: LitsxAuthoringStyle;
};

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

export declare function renderWithHooks<T>(
  host: object,
  render: () => T
): T;

export declare function collectSoftSuspenseThenables<T>(
  collector: { add(thenable: Promise<unknown>): void },
  render: () => T
): T;

/** Return a CSSResultGroup that replaces, rather than extends, inherited styles. */
export declare function replaceStyles(styles: CSSResultGroup): CSSResultGroup;

export declare function createExecutionContextKey<T>(
  description?: string
): ExecutionContextKey<T>;

export declare function getCurrentExecutionContext():
  | LitsxExecutionContext
  | null;

export declare class SsrEffectsController {
  constructor(
    host: object,
    ssrContext?: { idPrefix?: string; currentInstanceId?: string },
  );
  prepare(): void;
}

export type LitsxStructuralHook<
  TArgs extends unknown[] = unknown[],
  TResult = unknown,
> = (...args: TArgs) => TResult;

export type LitsxStructuralMixin<THost extends object = object> = (
  Base: any,
) => abstract new (...args: any[]) => THost;

export interface LitsxStructuralDefinition<
  THost extends object = object,
  TArgs extends unknown[] = unknown[],
  TResult = unknown,
> {
  /** Host capability installed once per distinct mixin. */
  mixin?: LitsxStructuralMixin<THost>;
  /** Render-time reader. Call useHost() when the capability needs its host. */
  use(...args: TArgs): TResult;
}

export interface LitsxStructuralMixinDefinition<
  THost extends object = object,
> {
  /** Host capability installed once per distinct mixin. */
  mixin: LitsxStructuralMixin<THost>;
  /** Omit the reader for an installation-only structural hook. */
  use?: never;
}

/** Define an installation-only hook that requests a host capability. */
export declare function defineHook<THost extends object = object>(
  definition: LitsxStructuralMixinDefinition<THost>,
): LitsxStructuralHook<[], void>;

/** Define a hook that requests and reads a host capability. */
export declare function defineHook<
  THost extends object = object,
  TArgs extends unknown[] = unknown[],
  TResult = unknown,
>(
  definition: LitsxStructuralDefinition<THost, TArgs, TResult>,
): LitsxStructuralHook<TArgs, TResult>;

export declare function readStructuralHook<TArgs extends unknown[], TResult>(
  hook: LitsxStructuralHook<TArgs, TResult>,
  args?: TArgs,
): TResult;

export declare function applyStructuralHooks<
  TBase extends abstract new (...args: any[]) => object,
>(Base: TBase, hooks?: readonly LitsxStructuralHook[]): TBase;

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
export type LitsxEmitOptions = {
  bubbles?: boolean;
  composed?: boolean;
  cancelable?: boolean;
};

export type LitsxEmit = <T = undefined>(
  type: string,
  detail?: T,
  options?: LitsxEmitOptions
) => boolean;

export type LitsxTypedEmit<Events extends Record<string, unknown>> = <
  Name extends Extract<keyof Events, string>,
>(
  type: Name,
  ...args: undefined extends Events[Name]
    ? [detail?: Events[Name], options?: LitsxEmitOptions]
    : [detail: Events[Name], options?: LitsxEmitOptions]
) => boolean;

export declare function useEmit<
  Events extends Record<string, unknown> | undefined = undefined,
>(): Events extends Record<string, unknown> ? LitsxTypedEmit<Events> : LitsxEmit;
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
 * Store a Lit-native mutable value across renders without causing updates.
 * The returned object exposes `.value`; an attached JSX ref is cleared with
 * `undefined` when its target disconnects.
 */
export declare function useRef<T>(
  initialValue?: T
): { value: T | undefined };
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
  getTarget: () => Element | undefined,
  callback: (node: Element | undefined) => void,
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
  ref: { value: T | undefined } | ((value: T | undefined) => void),
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
/**
 * Declare a lazily imported LitSX component. The compiler lowers usages to a
 * scoped ensureLazyElement registration and preserves the component's props.
 */
export declare function lazy<
  TComponent extends (...args: any[]) => unknown,
>(
  loader: () => Promise<TComponent | { default: TComponent }>,
): TComponent;
