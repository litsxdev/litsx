import { getController } from "./runtime-controller.js";
import { useEvent } from "./effect-hooks.js";
import {
  startTransitionImpl,
  useAsyncStateImpl,
  useDeferredValueImpl,
  useOptimisticImpl,
  useTransitionImpl,
} from "./state-async-hooks.js";
import {
  useCallbackRefImpl,
  useExposeImpl,
  useExternalStoreImpl,
  useIdImpl,
  useRefImpl,
} from "./state-imperative-hooks.js";

/**
 * Read the value from the previous render.
 * Think of usePrevious as the smallest way to compare the current render against the last committed render state.
 * @usage Use usePrevious when a render needs to compare the current value with what the component saw on the previous render.
 * @usage Pass an initialValue when the first render should not receive undefined.
 * @behavior The first render returns the provided initialValue, or undefined when no initialValue is given.
 * @behavior After that, each render receives the value that was passed on the immediately preceding render.
 * @mentalModel usePrevious lets the current render look one frame back without turning that old value into reactive state.
 * @pitfall usePrevious is for comparisons and derived render logic. It does not trigger updates by itself.
 * @example
 * const previousOpen = usePrevious(open);
 *
 * const becameOpen = open && !previousOpen;
 * @param {import('lit').ReactiveControllerHost} host
 * @param {unknown} value Current render value to track.
 * @param {unknown} [initialValue] Value returned on the first render before any previous value exists.
 * @returns {unknown} The previous render's value, or initialValue on the first render.
 */
export function usePrevious(host, value, initialValue) {
  return getController(host).resolvePrevious(value, initialValue);
}

/**
 * Manage local state with a reducer.
 * Think of useReducedState as a way to centralize several related transitions behind explicit actions.
 * @usage Use useReducedState when updates are easier to describe as actions flowing through a reducer than as direct assignments.
 * @usage This is a good fit for state machines, forms, and components with several related state transitions.
 * @usage Prefer useState for isolated values. Reach for useReducedState when several transitions must stay centralized and explicit.
 * @behavior The reducer receives the previous state and the dispatched action and returns the next state.
 * @behavior The optional initializer runs once to derive the initial state from initialArg.
 * @behavior Dispatching an action schedules an update for the current host with the reducer result as the next state.
 * @mentalModel The reducer is the single place that explains how this slice of state changes over time. Actions describe events; the reducer decides the next state.
 * @pitfall If state transitions are simple direct assignments, useState is usually easier to read.
 * @pitfall Keep reducers deterministic and side-effect free. They run as part of deciding the next render state.
 * @example
 * const [panel, dispatch] = useReducedState(panelReducer, {
 *   open: false,
 *   section: "details",
 * });
 *
 * dispatch({ type: "open", section: "activity" });
 * @param {import('lit').ReactiveControllerHost} host
 * @param {(state: any, action: any) => any} reducer Reducer that maps the previous state and an action to the next state.
 * @param {any} initialArg Initial value passed directly to the reducer state or to the initializer.
 * @param {(arg: any) => any} [init] Optional initializer that derives the starting state from initialArg.
 * @returns {[any, (action: any) => void]} The current state and a dispatch function that sends actions to the reducer.
 */
export function useReducedState(host, reducer, initialArg, init) {
  return getController(host).resolveReducer(reducer, initialArg, init);
}

/**
 * Store local component state.
 * Think of useState as the default way to keep component-owned UI state alive across renders.
 * @usage Use useState for straightforward local state such as toggles, counters, or small pieces of component-owned UI data.
 * @usage Pass a function when the initial value should be computed only once for the host instance.
 * @usage Prefer useState when the next value can be described directly. Move to useReducedState when state transitions become coupled or action-shaped.
 * @behavior The setter accepts either the next value or an updater function that receives the previous value.
 * @behavior The initial value is created once per host instance, not on every render.
 * @behavior Calling the setter schedules an update for the current host with the next state value.
 * @mentalModel useState gives a component one remembered value and the function that replaces it. Reach for it first when the UI just needs to remember "what is the current value of X?".
 * @pitfall Do not mirror derived data into useState if it can be recomputed from props or other state during render.
 * @pitfall When the next value depends on the previous one, prefer the updater form so the transition stays explicit.
 * @example
 * const [expanded, setExpanded] = useState(false);
 * const toggle = () => setExpanded((value) => !value);
 * @param {import('lit').ReactiveControllerHost} host
 * @param {any | (() => any)} initialState Initial state value, or a function that lazily computes it once.
 * @returns {[any, (next: any | ((value: any) => any)) => void]} The current state and a setter for the next value.
 */
export function useState(host, initialState) {
  const hasInitializer = typeof initialState === "function";
  const reducer = (prev, action) =>
    typeof action === "function" ? action(prev) : action;
  const [value, dispatch] = useReducedState(
    host,
    reducer,
    initialState,
    hasInitializer ? (initializer) => initializer() : undefined
  );
  const setValue = (next) => dispatch(next);
  return [value, setValue];
}

/**
 * Manage a value that can be controlled from props or owned locally by the component.
 * Think of useControlledState as the small bridge between component-internal state and design-system APIs that may also be driven from outside.
 * @usage Use useControlledState for patterns such as `value/defaultValue/onChange`, `open/defaultOpen/onOpenChange`, or `checked/defaultChecked/onCheckedChange`.
 * @usage Prefer plain useState when the component always owns the value itself.
 * @behavior When `value` is not undefined, the hook reads from that controlled value and does not update local state.
 * @behavior When `value` is undefined, the hook stores local state initialized from `defaultValue`.
 * @behavior The setter always resolves the next value, updates local state only when uncontrolled, and calls `onChange` when the value actually changes.
 * @mentalModel The hook exposes one current value and one setter, regardless of whether the source of truth lives inside the component or outside it.
 * @pitfall This hook treats `undefined` as the uncontrolled case. Use `null` when the controlled value needs an explicit "empty" state.
 * @pitfall Do not mirror a controlled value into separate component state. This hook already resolves that split.
 * @example
 * const [open, setOpen] = useControlledState({
 *   value: openProp,
 *   defaultValue: false,
 *   onChange: onOpenChange,
 * });
 * @param {import('lit').ReactiveControllerHost} host
 * @param {{ value?: any, defaultValue?: any, onChange?: (value: any) => void }} options
 * @returns {[any, (next: any | ((value: any) => any)) => void]}
 */
export function useControlledState(host, options) {
  const isControlled = options.value !== undefined;
  const [internalValue, setInternalValue] = useState(host, options.defaultValue);
  const currentValue = isControlled ? options.value : internalValue;

  const setValue = useEvent(host, (next) => {
    if (isControlled) {
      const resolvedValue = typeof next === "function"
        ? next(currentValue)
        : next;

      if (!Object.is(currentValue, resolvedValue)) {
        options.onChange?.(resolvedValue);
      }
      return;
    }

    if (typeof next === "function") {
      setInternalValue((previousValue) => {
        const resolvedValue = next(previousValue);
        if (!Object.is(previousValue, resolvedValue)) {
          options.onChange?.(resolvedValue);
        }
        return resolvedValue;
      });
      return;
    }

    if (!Object.is(currentValue, next)) {
      options.onChange?.(next);
    }
    setInternalValue(next);
  });

  return [currentValue, setValue];
}

/**
 * Manage async state transitions behind a single run function.
 * Think of useAsyncState as the native Lit<sup>sx</sup> primitive for async mutations that need state, pending, and error tracking together.
 * @usage Use useAsyncState when a user action triggers synchronous or asynchronous work that should eventually commit the next state.
 * @usage The action receives the latest committed state and any arguments passed to run(...).
 * @usage Keep optimistic UI separate. useAsyncState models authoritative async state, not temporary optimistic overlays.
 * @behavior run(...) always returns a Promise, even when the action is synchronous.
 * @behavior pending is derived from the host-scoped transition machinery.
 * @behavior Only the latest started run may commit state or error changes. Older completions are ignored for hook state.
 * @behavior reset() restores the initial state, clears the latest error, and invalidates any in-flight completions.
 * @mentalModel useAsyncState is a small async state machine: run work, reflect pending, commit the latest result, surface the latest error.
 * @pitfall useAsyncState does not cancel the underlying async work. It only prevents stale completions from mutating hook state.
 * @pitfall Keep action pure with respect to state transitions. Side effects that should run on success can happen after awaiting run(...).
 * @example
 * const [profile, saveProfile, meta] = useAsyncState(initialProfile, async (current, draft) => {
 *   const saved = await saveProfileToServer(draft);
 *   return { ...current, ...saved };
 * });
 *
 * await saveProfile(draft);
 * @param {import('lit').ReactiveControllerHost} host
 * @param {any | (() => any)} initialState
 * @param {(state: any, ...args: any[]) => any | Promise<any>} action
 * @returns {[any, (...args: any[]) => Promise<any>, { pending: boolean, error: unknown | null, reset: () => void }]}
 */
export function useAsyncState(host, initialState, action) {
  return useAsyncStateImpl(
    host,
    initialState,
    action,
    useState,
    useTransition,
    useRef
  );
}

/**
 * Apply an optimistic overlay on top of authoritative state.
 * Think of useOptimistic as the native Lit<sup>sx</sup> primitive for showing temporary optimistic UI while authoritative state catches up.
 * @usage Use useOptimistic when the UI should immediately reflect an expected outcome before the authoritative state changes.
 * @usage Pass an update function when optimistic inputs should be reduced over the current state instead of simply replacing it.
 * @usage Call resetOptimistic() when the optimistic overlay should be discarded explicitly, such as after a failed mutation or a retry.
 * @behavior The first argument is always the authoritative base state.
 * @behavior addOptimistic(...) queues optimistic inputs and recomputes the overlay by replaying them over the current base state.
 * @behavior If the base state changes by Object.is, the optimistic queue is cleared and the hook re-anchors to the new base state.
 * @mentalModel useOptimistic layers temporary expectations over real state. The base stays authoritative; the overlay stays disposable.
 * @pitfall useOptimistic does not persist the optimistic queue across authoritative state changes.
 * @pitfall Keep updateFn deterministic. The optimistic overlay is recomputed by replaying queued inputs during render.
 * @example
 * const [optimisticTodos, addTodoOptimistic, resetOptimisticTodos] = useOptimistic(
 *   todos,
 *   (currentTodos, optimisticTodo) => [...currentTodos, optimisticTodo]
 * );
 *
 * addTodoOptimistic({ id: "temp-1", title: draftTitle });
 * @param {import('lit').ReactiveControllerHost} host
 * @param {any} state
 * @param {(state: any, optimisticValue: any) => any} [updateFn]
 * @returns {[any, (value: any) => void, () => void]}
 */
export function useOptimistic(host, state, updateFn) {
  return useOptimisticImpl(host, state, updateFn, useRef, useState);
}

/**
 * Schedule non-urgent updates and track whether they are pending.
 * Think of useTransition as a way to split an interaction into urgent work now and heavier work that can follow without blocking responsiveness.
 * @usage Use useTransition when a UI interaction should stay responsive while heavier follow-up work completes in the background.
 * @usage The returned boolean tells you whether the transition is still pending so the component can reflect that in the UI.
 * @usage Keep urgent state updates outside the transition and move only the expensive follow-up work into the transition callback.
 * @behavior The returned start function schedules work through the host transition machinery.
 * @behavior The pending flag stays true while transition work is still unresolved.
 * @behavior Transitions are host-scoped. A pending transition only reflects non-urgent work scheduled for the current component host.
 * @mentalModel A transition is not a different kind of state. It is a different priority for updating the UI.
 * @pitfall Do not wrap every update in a transition. Use it when keeping input or interaction responsiveness matters more than reflecting every expensive change immediately.
 * @pitfall The pending flag only tells you about transition work started by the current host, not about the whole application.
 * @example
 * const [isPending, startTransition] = useTransition();
 * startTransition(() => {
 *   setSearchQuery(nextQuery);
 * });
 * @param {import('lit').ReactiveControllerHost} host
 * @returns {[boolean, (callback: () => any) => any]} A pending flag and a function that schedules non-urgent work.
 */
export function useTransition(host) {
  return useTransitionImpl(host);
}

/**
 * Schedule non-urgent updates using the same transition machinery as useTransition.
 * @param {import('lit').ReactiveControllerHost} host
 * @param {() => any} callback
 * @returns {any}
 */
export function startTransition(host, callback) {
  return startTransitionImpl(host, callback);
}

/**
 * Let expensive consumers lag behind a fast-changing value.
 * Think of useDeferredValue as a way to let expensive consumers lag behind a fast-changing value without freezing the rest of the interaction.
 * @usage Use useDeferredValue when a derived subtree is expensive and should lag slightly behind more urgent updates.
 * @usage This is useful for search results, filtered lists, and other views that are expensive to recompute on every keystroke.
 * @usage Use the deferred value downstream, not upstream. Read urgent input state directly and pass the deferred value into expensive calculations.
 * @behavior Lit<sup>sx</sup> may keep returning an older value temporarily while the deferred update is still pending.
 * @behavior This helps expensive UI stay responsive without blocking urgent interactions.
 * @behavior useDeferredValue does not debounce updates. Every value still flows through; Lit<sup>sx</sup> simply lets expensive consumers lag behind.
 * @mentalModel The source value changes immediately, but expensive readers can temporarily stay on the previous value until the deferred update catches up.
 * @pitfall useDeferredValue does not reduce the number of updates. It changes when expensive consumers observe them.
 * @pitfall Keep reading the urgent source directly where immediacy matters, and only pass the deferred value into slower subtrees or calculations.
 * @example
 * const deferredQuery = useDeferredValue(searchQuery);
 * const results = useMemoValue(() => search(items, deferredQuery), [items, deferredQuery]);
 * @param {import('lit').ReactiveControllerHost} host
 * @param {any} value Value that may change more frequently than the UI should immediately reflect.
 * @param {{ timeout?: number }} [options] Optional timing hints for how long the deferred value may lag behind.
 * @returns {any} The deferred value currently exposed to render logic.
 */
export function useDeferredValue(host, value, options) {
  return useDeferredValueImpl(host, value, options);
}

/**
 * Store a mutable value across renders without causing updates.
 * @usage Use useRef for stable mutable cells such as timers, previous snapshots, and imperative handles.
 * @usage Attach a ref created by useRef to JSX `ref=...` when it should point at a rendered element or component instance.
 * @behavior The ref object exposes a mutable current property.
 * @behavior When attached to an intrinsic element, the Lit<sup>sx</sup> transform layer keeps current synchronized with that rendered element.
 * @behavior When attached to a component tag, the ref resolves to the component instance by default.
 * @behavior Components can override that default target by explicitly forwarding the incoming ref to another element or child component.
 * @behavior When used as plain mutable storage, the ref persists across renders without causing updates on writes.
 * @mentalModel useRef is the single mutable ref primitive in Lit<sup>sx</sup>, whether the ref stores arbitrary data, tracks a rendered DOM node, or points at a component instance.
 * @pitfall Do not read ref.current as a source of truth for render decisions if that value can change outside the current render pass.
 * @pitfall Prefer state hooks when a change should trigger an update. Refs are for persistence and imperative coordination.
 * @example
 * const inputRef = useRef(null);
 *
 * useOnCommit(() => {
 *   inputRef.current?.focus();
 * }, []);
 * @param {import('lit').ReactiveControllerHost} host
 * @param {any} [initialValue]
 */
export function useRef(host, initialValue) {
  return useRefImpl(host, initialValue);
}

/**
 * Generate a stable id for the current component instance.
 * Note: this currently guarantees client-side stability only. SSR/hydration
 * compatibility will require a deterministic prefixing strategy shared across
 * server and client renders.
 * @param {import('lit').ReactiveControllerHost} host
 * @returns {string}
 */
export function useId(host) {
  return useIdImpl(host);
}

/**
 * Run a callback ref through the component lifecycle.
 * @param {import('lit').ReactiveControllerHost} host
 * @param {() => Element | null} getTarget
 * @param {(node: Element | null) => void} callback
 * @param {ReadonlyArray<unknown>} [deps]
 */
export function useCallbackRef(host, getTarget, callback, deps) {
  return useCallbackRefImpl(host, getTarget, callback, deps);
}

/**
 * Expose a small imperative API through a ref.
 * Think of useExpose as the way a component publishes a deliberately small imperative API to its parent.
 * @usage Use useExpose when a component should publish a small imperative API such as focus(), open(), or reset().
 * @usage Keep the handle narrow and stable so callers depend on explicit capabilities rather than on the whole element instance.
 * @usage Pair useExpose with useRef when the handle should forward a few imperative methods to owned DOM nodes.
 * @behavior Lit<sup>sx</sup> assigns the created handle to the provided ref during the host lifecycle.
 * @behavior Recompute the handle only when one of the listed dependencies changes.
 * @behavior Prefer exposing a small command surface instead of leaking the underlying element instance.
 * @mentalModel useExpose draws a boundary between what the component does internally and the few commands it chooses to make public.
 * @pitfall Do not expose the whole element instance unless that really is the public API you want to support.
 * @pitfall Keep the handle stable and intention-revealing. A small set of named commands is easier to maintain than a grab-bag of internals.
 * @example
 * useExpose(ref, () => ({
 *   focus() {
 *     inputRef.current?.focus();
 *   },
 *   clear() {
 *     setValue("");
 *   },
 * }), [inputRef, setValue]);
 * @param {import('lit').ReactiveControllerHost} host
 * @param {{ current: any } | ((value: any) => void)} ref Ref object or callback ref that should receive the exposed handle.
 * @param {() => any} createHandle Function that returns the imperative handle to expose.
 * @param {ReadonlyArray<unknown>} [deps] Reactive values that control when the handle should be recreated.
 */
export function useExpose(host, ref, createHandle, deps) {
  return useExposeImpl(host, ref, createHandle, deps);
}

/**
 * Subscribe to external state and read its current snapshot.
 * Think of useExternalStore as the bridge between Lit<sup>sx</sup> render logic and state that already lives somewhere else.
 * @usage Use useExternalStore when state is owned outside the component tree and the host should re-render when that store changes.
 * @usage Prefer this over ad-hoc subscriptions when you want a consistent render-time snapshot model.
 * @usage Keep getSnapshot cheap and synchronous, because Lit<sup>sx</sup> calls it during render to decide what the component should show.
 * @usage Reach for useExternalStore when the source of truth already lives outside Lit<sup>sx</sup>, such as a shared store, browser API, or external cache.
 * @behavior Lit<sup>sx</sup> subscribes during the host lifecycle and requests updates when the snapshot changes.
 * @behavior The value returned during render is always the latest snapshot from getSnapshot().
 * @behavior subscribe should register the listener and return an unsubscribe function. Avoid performing asynchronous reads inside getSnapshot.
 * @behavior A store update only affects hosts that currently subscribe to that store through useExternalStore.
 * @mentalModel The external store remains the source of truth. Lit<sup>sx</sup> only asks for the current snapshot and schedules a render when that snapshot changes.
 * @pitfall Keep getSnapshot synchronous and cheap. If it performs asynchronous work or expensive derivations, render performance will suffer.
 * @pitfall Avoid shaping the store contract around a single component. Stable store APIs are easier to reuse across several hosts.
 * @example
 * const online = useExternalStore(
 *   subscribeToConnectivity,
 *   getConnectivitySnapshot
 * );
 * @param {import('lit').ReactiveControllerHost} host
 * @param {(listener: () => void) => () => void} subscribe Function that subscribes a listener and returns an unsubscribe function.
 * @param {() => any} getSnapshot Function that returns the current store snapshot during render.
 * @param {() => any} [getServerSnapshot] Optional snapshot getter for server rendering scenarios.
 * @returns {any} The latest snapshot currently exposed by the external store.
 */
export function useExternalStore(host, subscribe, getSnapshot, getServerSnapshot) {
  return useExternalStoreImpl(host, subscribe, getSnapshot, getServerSnapshot);
}
