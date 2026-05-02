import { prepareEffects, getController } from "./runtime-controller.js";
import { ensureLazyElement } from "./runtime-lazy-elements.js";

export { prepareEffects, ensureLazyElement };

/**
 * Run side effects after the host has committed its update.
 * Use this for subscriptions, timers, or synchronizing with systems outside the component tree.
 * Think of useAfterUpdate as the place for work that should happen after Lit<sup>sx</sup> has already committed the latest UI.
 * @usage Call useAfterUpdate when work should happen after the DOM is updated, not during rendering.
 * @usage Return a cleanup function when the effect creates a subscription or any other disposable resource.
 * @behavior The effect runs after the host update cycle completes.
 * @behavior If dependencies change, Lit<sup>sx</sup> runs the previous cleanup before running the next effect.
 * @mentalModel useAfterUpdate is for side effects that observe or connect to the outside world after render has finished. It is not part of the render calculation itself.
 * @pitfall Do not use useAfterUpdate to derive values that the component could compute during render.
 * @pitfall If the effect allocates subscriptions, timers, or handles, return a cleanup function so the host can dispose of them cleanly.
 * @example
 * useAfterUpdate(() => {
 *   const handle = connectToSocket(roomId);
 *   return () => handle.disconnect();
 * }, [roomId]);
 * @param {import('lit').ReactiveControllerHost} host
 * @param {() => void | (() => void)} callback Effect logic to run after commit. May return a cleanup function.
 * @param {ReadonlyArray<unknown>} [deps] Reactive values that control when the effect is re-run.
 */
export function useAfterUpdate(host, callback, deps) {
  getController(host).register(
    callback,
    Array.isArray(deps) ? deps : deps ?? null,
    false
  );
}

/**
 * Run synchronous commit-phase work before the browser paints the next frame.
 * Use this when the effect must read layout or apply imperative DOM work immediately after commit.
 * Think of useOnCommit as the place for DOM work that is part of committing the frame, not for general side effects.
 * @usage Call useOnCommit for measurement, focus management, or DOM synchronization that should not wait for a later frame.
 * @usage Prefer useAfterUpdate for non-visual side effects so commit work stays small.
 * @usage Keep the callback short and focused on DOM work that must happen immediately after commit.
 * @behavior The effect runs during the host commit phase, before passive effects are flushed.
 * @behavior Cleanup runs before the next committed version of the effect and when the host disconnects.
 * @behavior Expensive work in useOnCommit lengthens the commit path for the current host, so reserve it for work that cannot wait.
 * @mentalModel useOnCommit sits on the critical path between "the DOM just updated" and "the browser can paint". Use it when timing matters.
 * @pitfall Avoid network work, heavy computation, or long-running tasks in useOnCommit. They delay visual updates for the current host.
 * @pitfall Prefer useAfterUpdate if the effect can happen a little later without affecting what the user sees in the current frame.
 * @example
 * useOnCommit(() => {
 *   if (shouldFocus) {
 *     inputRef.current?.focus();
 *   }
 * }, []);
 * @param {import('lit').ReactiveControllerHost} host
 * @param {() => void | (() => void)} callback Commit-phase logic to run immediately after the DOM update.
 * @param {ReadonlyArray<unknown>} [deps] Reactive values that control when the effect is re-run.
 */
export function useOnCommit(host, callback, deps) {
  getController(host).register(
    callback,
    Array.isArray(deps) ? deps : deps ?? null,
    true
  );
}

/**
 * Run setup when the host is connected to the DOM, and dispose it when the host disconnects.
 * Use this for global event listeners, subscriptions, observers, or resources that should only exist while the host is mounted.
 * Think of useOnConnect as the lifecycle-aware place for work that follows the host's connection to the DOM, not its render timing.
 * @usage Call useOnConnect for resources tied to being connected, such as `window` listeners or store subscriptions.
 * @usage Return a cleanup function to release the resource when the host disconnects, is adopted into a new document, or re-arms due to dependency changes.
 * @behavior The callback runs once when the host becomes active and re-runs only when dependencies change while connected.
 * @behavior Cleanup runs before a dependency-driven re-arm, on disconnect, and when the host is adopted into a new document.
 * @mentalModel useOnConnect is about mount lifetime. It is not for DOM measurement and it is not part of the render/commit path.
 * @pitfall Prefer useOnCommit when the work must happen immediately after the DOM commits, and prefer useAfterUpdate for passive post-update effects.
 * @example
 * useOnConnect(() => {
 *   window.addEventListener("message", onMessage);
 *   return () => window.removeEventListener("message", onMessage);
 * }, []);
 * @param {import('lit').ReactiveControllerHost} host
 * @param {() => void | (() => void)} callback Setup logic to run while the host is connected.
 * @param {ReadonlyArray<unknown>} [deps] Reactive values that control when the setup should be re-armed.
 */
export function useOnConnect(host, callback, deps) {
  getController(host).registerConnected(
    callback,
    Array.isArray(deps) ? deps : deps ?? []
  );
}

/**
 * Memoize a derived value until its dependencies change.
 * Think of useMemoValue as a render-time memo for expensive derived values.
 * @usage Use useMemoValue when a derived value is expensive enough that recalculating it every render would add noise or cost.
 * @usage Keep the factory pure and derive the value only from the dependencies you pass in.
 * @usage Reach for useMemoValue when a value is derived from props or state, not when you need to persist mutable state between renders.
 * @behavior Lit<sup>sx</sup> compares dependencies with Object.is semantics.
 * @behavior If no dependency array is provided, the value is recomputed on every render.
 * @behavior The factory runs during render, so it should stay synchronous and free of side effects.
 * @mentalModel useMemoValue does not store new state. It remembers the last derived result for the current dependency set.
 * @pitfall Do not use useMemoValue for side effects or asynchronous work. The factory belongs to render and should stay pure.
 * @pitfall If the value is cheap to compute, adding caching can make the component harder to read without delivering much benefit.
 * @example
 * const visibleRows = useMemoValue(
 *   () => rows.filter((row) => row.matches(query)),
 *   [rows, query]
 * );
 * @param {import('lit').ReactiveControllerHost} host
 * @param {() => unknown} factory Function that computes the cached value.
 * @param {ReadonlyArray<unknown>} [deps] Reactive values that decide when the cached value becomes stale.
 * @returns {unknown} The cached value for the current dependency set.
 */
export function useMemoValue(host, factory, deps) {
  return getController(host).resolveMemo(factory, deps);
}

/**
 * Keep a callback stable until its dependencies change.
 * Think of useStableCallback as a stable function reference for places where callback identity matters.
 * @usage Use useStableCallback when you want a callback value to stay referentially stable across renders.
 * @usage This is most useful when the callback is passed to another hook, an imperative API, or a child component that keys off identity.
 * @usage Prefer useStableCallback when identity stability matters. If a callback is only used inline in the same render path, a plain function is often enough.
 * @behavior The returned function keeps the same identity until one of the listed dependencies changes.
 * @behavior Use this to avoid downstream work caused by unstable callback references.
 * @behavior The callback body is still recreated from the current render when dependencies change, so include every reactive value the callback reads.
 * @mentalModel useStableCallback is about preserving callback identity, not caching results. Use it when changing function references would cause other parts of the UI to do unnecessary work.
 * @pitfall Do not wrap every callback in useStableCallback by default. If nothing observes callback identity, a plain inline function is usually clearer.
 * @pitfall Dependencies still matter. If the callback reads reactive values, include them so the stable callback does not observe stale data.
 * @example
 * const handleSelect = useStableCallback((id) => {
 *   setSelectedId(id);
 *   trackSelection(id);
 * }, [setSelectedId, trackSelection]);
 * @param {import('lit').ReactiveControllerHost} host
 * @param {Function} callback Callback whose identity should remain stable between renders.
 * @param {ReadonlyArray<unknown>} [deps] Reactive values that decide when a new callback should be produced.
 * @returns {Function} A callback with stable identity for the current dependency set.
 */
export function useStableCallback(host, callback, deps) {
  return getController(host).resolveCallback(callback, deps);
}

/**
 * Keep an event callback identity stable while always calling the latest logic.
 * Think of useEvent as the bridge between connected imperative listeners and the latest render state.
 * @usage Use useEvent when a callback is registered once with an external API but still needs fresh props or state.
 * @usage This is most useful together with useOnConnect for window listeners, observers, timers, or other imperative subscriptions.
 * @behavior The returned function keeps the same identity across renders.
 * @behavior Each call delegates to the latest callback from the current render.
 * @mentalModel useEvent gives outside code a stable function handle, while Lit<sup>sx</sup> keeps swapping the implementation behind it as renders happen.
 * @pitfall useEvent does not register or clean up anything by itself. Pair it with useOnConnect or another lifecycle hook when you need subscription management.
 * @example
 * const onKeyDown = useEvent((event) => {
 *   if (event.key === "Escape" && open) {
 *     setOpen(false);
 *   }
 * });
 *
 * useOnConnect(() => {
 *   window.addEventListener("keydown", onKeyDown);
 *   return () => window.removeEventListener("keydown", onKeyDown);
 * }, []);
 * @param {import('lit').ReactiveControllerHost} host
 * @param {Function} callback Event callback whose body should stay fresh.
 * @returns {Function} A stable callback reference that always delegates to the latest callback.
 */
export function useEvent(host, callback) {
  return getController(host).resolveEvent(callback);
}

/**
 * Emit a CustomEvent from the current host without reaching for this.dispatchEvent(...).
 * Think of useEmit as the small authored bridge between component logic and public DOM events.
 * @usage Use useEmit when a component needs to publish a DOM event as part of its public API.
 * @usage This is a good fit for input-like controls, disclosure widgets, and selection components.
 * @behavior The returned function keeps a stable identity across renders.
 * @behavior Events default to `{ bubbles: true, composed: true, cancelable: false }`.
 * @behavior Passing options overrides those defaults without replacing the rest of the event init object.
 * @mentalModel useEmit keeps event emission explicit in authored code while still lowering directly to the native CustomEvent model.
 * @pitfall useEmit publishes events; it does not make internal values reactive for parents by itself.
 * @example
 * const emit = useEmit();
 *
 * emit("change", value);
 * emit("submit", value, { cancelable: true });
 * @param {import('lit').ReactiveControllerHost & EventTarget} host
 * @returns {(type: string, detail?: unknown, options?: { bubbles?: boolean; composed?: boolean; cancelable?: boolean }) => boolean}
 */
export function useEmit(host) {
  return useEvent(host, (type, detail, options = {}) =>
    host.dispatchEvent(
      new CustomEvent(type, {
        detail,
        bubbles: options.bubbles ?? true,
        composed: options.composed ?? true,
        cancelable: options.cancelable ?? false,
      })
    )
  );
}
