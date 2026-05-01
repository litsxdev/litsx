# Framework Reference

This reference is generated from the public Lit<sup>sx</sup> type surface in `packages/litsx/src/*.d.ts`.

It documents the framework API that authors write against. Internal helpers and transform-only support APIs are intentionally left out.

## Language Model

Lit<sup>sx</sup> is a framework for writing Lit-based web components with JSX.

- JSX is the authored language
- Lit is the rendering foundation
- web components are the deployed unit
- React compatibility is optional and exists only for legacy migration

## JSX Surface

Lit<sup>sx</sup> authoring is Lit-flavored:

- event listeners use `@event`
- property bindings use `.prop`
- boolean attributes use `?attr`
- component trees are authored in JSX rather than in tagged template literals

## Core Types

These types describe the public authored language of Lit<sup>sx</sup>: JSX nodes, renderable values, refs, and component signatures.

### `LitsxJsxNode`

```ts
export interface LitsxJsxNode {
    $$typeof: symbol;
    type: unknown;
    key: string | number | null;
    props: Record<string, unknown>;
    __source?: unknown;
    __self?: unknown;
}
```

### `LitsxRenderable`

```ts
export type LitsxRenderable = LitsxJsxNode | string | number | boolean | null | undefined | Iterable<unknown>;
```

### `LitsxRef`

```ts
export type LitsxRef<T> = T | ((value: T | null) => void) | null;
```

### `LitsxComponent`

```ts
export type LitsxComponent<Props = Record<string, unknown>> = (props: Props) => LitsxRenderable;
```

## JSX Surface Types

These types define how Lit<sup>sx</sup> models intrinsic elements, authored attributes, and the JSX-visible host element shape.

### `LitsxBaseAttributes`

```ts
export interface LitsxBaseAttributes {
    key?: string | number;
    slot?: string;
    class?: string;
    part?: string;
    style?: string | Partial<CSSStyleDeclaration>;
    children?: LitsxRenderable;
    ref?: LitsxRef<unknown>;
    [attributeName: `data-${string}`]: unknown;
    [attributeName: `aria-${string}`]: string | number | boolean | undefined;
}
```

### `LitsxDomAttributes`

```ts
export interface LitsxDomAttributes<Target = EventTarget> {
    /**
     * Reserved for future JSX-authored event typing.
     * Litsx currently treats Lit listener syntax (`@event`) as a parser-level feature,
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
```

### `LitsxHostElementProps`

```ts
export type LitsxHostElementProps<TElement> = Omit<Partial<TElement>, "children" | "style" | "part" | "slot" | "className">;
```

### `LitsxElementProps`

```ts
export type LitsxElementProps<TElement = HTMLElement> = LitsxBaseAttributes & LitsxDomAttributes<TElement> & LitsxHostElementProps<TElement>;
```

### `LitsxIntrinsicElements`

```ts
export type LitsxIntrinsicElements = {
    [TagName in keyof HTMLElementTagNameMap]: LitsxElementProps<HTMLElementTagNameMap[TagName]>;
} & {
    "error-boundary": LitsxElementProps<ErrorBoundary> & ErrorBoundaryProps;
    "suspense-boundary": LitsxElementProps<SuspenseBoundary> & SuspenseBoundaryProps;
    "suspense-list": LitsxElementProps<SuspenseList> & SuspenseListProps;
    [customElementName: `${string}-${string}`]: LitsxElementProps<HTMLElement>;
};
```

## Primitives

These are the native primitives that define asynchronous UI coordination and recoverable rendering failures in Lit<sup>sx</sup>.

### `ErrorBoundary`

Show fallback UI when a subtree throws during render.

Detailed reference: [`ErrorBoundary`](../../reference/generated/errorboundary.md)

```ts
/**
 * Show fallback UI when a subtree throws during render.
 */
export declare class ErrorBoundary extends LitElement {
    failed: boolean;
    error: unknown;
    onError: ((error: unknown) => void) | null;
    fallbackRenderer: ((error: unknown) => unknown) | null;
    contentRenderer: (() => unknown) | null;
}
```

### `SuspenseBoundary`

Show fallback UI while a suspense region is waiting to reveal.

Detailed reference: [`SuspenseBoundary`](../../reference/generated/suspenseboundary.md)

```ts
/**
 * Show fallback UI while a suspense region is waiting to reveal.
 */
export declare class SuspenseBoundary extends LitElement {
    pending: boolean;
    resolved: boolean;
    showing: string;
    phase: string;
    fallbackRenderer: (() => unknown) | null;
    contentRenderer: (() => unknown) | null;
}
```

### `SuspenseList`

Coordinate reveal order across sibling suspense boundaries.

Detailed reference: [`SuspenseList`](../../reference/generated/suspenselist.md)

```ts
/**
 * Coordinate reveal order across sibling suspense boundaries.
 */
export declare class SuspenseList extends ReactiveElement {
    revealOrder: "forwards" | "backwards" | "together";
    tail: "collapsed" | "hidden";
}
```

## Primitive Props

These interfaces describe the public authored props of the native primitives.

### `ErrorBoundaryProps`

```ts
export interface ErrorBoundaryProps {
    /**
     * Content rendered inside the boundary while no error has been captured.
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
```

### `SuspenseBoundaryProps`

```ts
export interface SuspenseBoundaryProps {
    /**
     * Content rendered inside the boundary when it is ready to reveal.
     */
    children?: LitsxRenderable;
    /**
     * Fallback UI rendered while the boundary is waiting for its content.
     */
    fallback?: LitsxRenderable;
}
```

### `SuspenseListProps`

```ts
export interface SuspenseListProps {
    /**
     * Suspense boundaries coordinated by the list.
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
```

## Lifecycle And Events

These hooks connect authored components to lifecycle timing, stable event callbacks, and DOM event emission.

### `useAfterUpdate`

Run an effect after the component finishes updating.

Detailed reference: [`useAfterUpdate`](../../reference/generated/useafterupdate.md)

```ts
/**
 * Run an effect after the component finishes updating.
 */
export declare function useAfterUpdate(callback: () => void | (() => void), deps?: unknown[]): void;
```

### `useOnCommit`

Run an effect during commit, before the next frame paints.

Detailed reference: [`useOnCommit`](../../reference/generated/useoncommit.md)

```ts
/**
 * Run an effect during commit, before the next frame paints.
 */
export declare function useOnCommit(callback: () => void | (() => void), deps?: unknown[]): void;
```

### `useOnConnect`

Set up work that stays active while the component remains connected.

Detailed reference: [`useOnConnect`](../../reference/generated/useonconnect.md)

```ts
/**
 * Set up work that stays active while the component remains connected.
 */
export declare function useOnConnect(callback: () => void | (() => void), deps?: unknown[]): void;
```

### `useEvent`

Keep an event callback identity stable while always calling the latest logic.

Detailed reference: [`useEvent`](../../reference/generated/useevent.md)

```ts
/**
 * Keep an event callback identity stable while always calling the latest logic.
 */
export declare function useEvent<T extends (...args: never[]) => unknown>(callback: T): T;
```

### `useEmit`

Emit a CustomEvent from the current host.

Detailed reference: [`useEmit`](../../reference/generated/useemit.md)

```ts
/**
 * Emit a CustomEvent from the current host.
 */
export declare function useEmit<T = undefined>(type: string, detail?: T, options?: {
    bubbles?: boolean;
    composed?: boolean;
    cancelable?: boolean;
}): boolean;
```

## State And Concurrency

These hooks own local state, controlled state, async state, optimistic overlays, and deferred rendering work.

### `useState`

Store local component state.

Detailed reference: [`useState`](../../reference/generated/usestate.md)

```ts
/**
 * Store local component state.
 */
export declare function useState<T>(initial: T | (() => T)): [
    T,
    (next: T | ((value: T) => T)) => void
];
```

### `useReducedState`

Manage local state with a reducer.

Detailed reference: [`useReducedState`](../../reference/generated/usereducedstate.md)

```ts
/**
 * Manage local state with a reducer.
 */
export declare function useReducedState<TState, TAction, TInitArg = TState>(reducer: (state: TState, action: TAction) => TState, initialArg: TInitArg, init?: (arg: TInitArg) => TState): [
    TState,
    (action: TAction | ((value: TState) => TState)) => void
];
```

### `useControlledState`

Manage a value that can be controlled from props or owned locally by the component.

Detailed reference: [`useControlledState`](../../reference/generated/usecontrolledstate.md)

```ts
/**
 * Manage a value that can be controlled from props or owned locally by the component.
 */
export declare function useControlledState<T>(options: {
    value?: T;
    defaultValue?: T | (() => T);
    onChange?: (value: T) => void;
}): [
    T | undefined,
    (next: T | ((value: T | undefined) => T)) => void
];
```

### `useAsyncState`

Manage async state transitions behind a single run function.

Detailed reference: [`useAsyncState`](../../reference/generated/useasyncstate.md)

```ts
/**
 * Manage async state transitions behind a single run function.
 */
export declare function useAsyncState<TState, TArgs extends unknown[] = [
]>(initialState: TState | (() => TState), action: (state: TState, ...args: TArgs) => TState | Promise<TState>): [
    TState,
    (...args: TArgs) => Promise<TState>,
    {
        pending: boolean;
        error: unknown | null;
        reset: () => void;
    }
];
```

### `useOptimistic`

Detailed reference: [`useOptimistic`](../../reference/generated/useoptimistic.md)

```ts
export declare function useOptimistic<TState, TInput>(state: TState, updateFn: (currentState: TState, optimisticValue: TInput) => TState): [
    TState,
    (value: TInput) => void,
    () => void
];
```

### `useTransition`

Schedule non-urgent updates and track whether they are pending.

Detailed reference: [`useTransition`](../../reference/generated/usetransition.md)

```ts
/**
 * Schedule non-urgent updates and track whether they are pending.
 */
export declare function useTransition(): [
    boolean,
    (callback: () => void) => void
];
```

### `useDeferredValue`

Let expensive consumers lag behind a fast-changing value.

Detailed reference: [`useDeferredValue`](../../reference/generated/usedeferredvalue.md)

```ts
/**
 * Let expensive consumers lag behind a fast-changing value.
 */
export declare function useDeferredValue<T>(value: T, options?: {
    timeout?: number;
}): T;
```

### `useMemoValue`

Memoize a derived value until its dependencies change.

Detailed reference: [`useMemoValue`](../../reference/generated/usememovalue.md)

```ts
/**
 * Memoize a derived value until its dependencies change.
 */
export declare function useMemoValue<T>(factory: () => T, deps?: unknown[]): T;
```

### `usePrevious`

Read the value from the previous render.

Detailed reference: [`usePrevious`](../../reference/generated/useprevious.md)

```ts
/**
 * Read the value from the previous render.
 */
export declare function usePrevious<T>(value: T, initialValue?: T): T | undefined;
```

## Refs And Imperative APIs

These hooks model host access, mutable refs, callback refs, slot content, projected content, and imperative handles.

### `LitsxHostContent`

```ts
export interface LitsxHostContent {
    text: string;
    nodes: Node[];
    hasContent: boolean;
    slots: Record<string, Node[]> & {
        default: Node[];
    };
}
```

### `useHost`

Return the current component instance.

Detailed reference: [`useHost`](../../reference/generated/usehost.md)

```ts
/**
 * Return the current component instance.
 */
export declare function useHost<THost extends object = object>(): THost;
```

### `useHostContent`

Read reactive light DOM content from the current component.

Detailed reference: [`useHostContent`](../../reference/generated/usehostcontent.md)

```ts
/**
 * Read reactive light DOM content from the current component.
 */
export declare function useHostContent(options?: {
    trim?: boolean;
}): LitsxHostContent;
```

### `useTextContent`

Read reactive text content projected into the current component.

Detailed reference: [`useTextContent`](../../reference/generated/usetextcontent.md)

```ts
/**
 * Read reactive text content projected into the current component.
 */
export declare function useTextContent(options?: {
    trim?: boolean;
}): string;
```

### `useSlot`

Read reactive projected nodes for one slot.

Detailed reference: [`useSlot`](../../reference/generated/useslot.md)

```ts
/**
 * Read reactive projected nodes for one slot.
 */
export declare function useSlot(slotName?: string): Node[];
```

### `useRef`

Store a mutable value across renders without causing updates.

Detailed reference: [`useRef`](../../reference/generated/useref.md)

```ts
/**
 * Store a mutable value across renders without causing updates.
 */
export declare function useRef<T>(initialValue?: T): {
    current: T | undefined;
};
```

### `useId`

Generate a stable id for the current component instance.

```ts
/**
 * Generate a stable id for the current component instance.
 */
export declare function useId(): string;
```

### `useCallbackRef`

Run a callback ref through the component lifecycle.

Detailed reference: [`useCallbackRef`](../../reference/generated/usecallbackref.md)

```ts
/**
 * Run a callback ref through the component lifecycle.
 */
export declare function useCallbackRef(getTarget: () => Element | null, callback: (node: Element | null) => void, deps?: unknown[]): void;
```

### `useExpose`

Expose a small imperative API through a ref.

Detailed reference: [`useExpose`](../../reference/generated/useexpose.md)

```ts
/**
 * Expose a small imperative API through a ref.
 */
export declare function useExpose<T>(ref: {
    current: T | null;
} | ((value: T | null) => void), createHandle: () => T, deps?: unknown[]): void;
```

### `useStableCallback`

Keep a callback stable until its dependencies change.

Detailed reference: [`useStableCallback`](../../reference/generated/usestablecallback.md)

```ts
/**
 * Keep a callback stable until its dependencies change.
 */
export declare function useStableCallback<T extends (...args: never[]) => unknown>(callback: T, deps?: unknown[]): T;
```

## External Integration

These APIs bridge Lit<sup>sx</sup> components to external state and dynamic host styling.

### `useExternalStore`

Subscribe to external state and read its current snapshot.

Detailed reference: [`useExternalStore`](../../reference/generated/useexternalstore.md)

```ts
/**
 * Subscribe to external state and read its current snapshot.
 */
export declare function useExternalStore<T>(subscribe: (listener: () => void) => () => void, getSnapshot: () => T, getServerSnapshot?: () => T): T;
```

### `useStyle`

Apply a dynamic style property to the current component host.

Detailed reference: [`useStyle`](../../reference/generated/usestyle.md)

```ts
/**
 * Apply a dynamic style property to the current component host.
 */
export declare function useStyle(propertyName: string, ...args: [
    value: LitsxStyleValue
] | [
    compute: LitsxStyleFactory
] | [
    compute: LitsxStyleFactory,
    deps: unknown[]
]): void;
```

## JSX Runtime

The JSX runtime is what lets editors, TypeScript, and compilers treat Lit<sup>sx</sup> as a first-class JSX framework.

### `jsx`

JSX factory for single-child LitSX nodes.

```ts
/**
 * JSX factory for single-child LitSX nodes.
 */
export declare function jsx(type: unknown, props: Record<string, unknown> | null, key?: string): LitsxJsxNode;
```

### `jsxs`

JSX factory for multi-child LitSX nodes.

```ts
/**
 * JSX factory for multi-child LitSX nodes.
 */
export declare function jsxs(type: unknown, props: Record<string, unknown> | null, key?: string): LitsxJsxNode;
```

### `JSX`

```ts
export namespace JSX {
    interface Element extends LitsxJsxNode {
    }
    interface ElementClass {
    }
    interface ElementChildrenAttribute {
        children: {};
    }
    interface IntrinsicAttributes {
        key?: string | number;
    }
    interface IntrinsicElements extends LitsxIntrinsicElements {
    }
    interface IntrinsicClassAttributes<T> {
        ref?: LitsxRef<T>;
    }
    type LibraryManagedAttributes<Component, Props> = Component extends typeof ErrorBoundary ? ErrorBoundaryProps : Component extends typeof SuspenseBoundary ? SuspenseBoundaryProps : Component extends typeof SuspenseList ? SuspenseListProps : Component extends LitsxComponent<infer InferredProps> ? InferredProps : Props;
}
```

### `LitsxComponentProps`

```ts
export type LitsxComponentProps<T> = T extends typeof ErrorBoundary ? ErrorBoundaryProps : T extends typeof SuspenseBoundary ? SuspenseBoundaryProps : T extends typeof SuspenseList ? SuspenseListProps : Record<string, unknown>;
```
