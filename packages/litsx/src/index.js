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

const HOST_ADOPTED_CONTROLLERS = Symbol("litsx.adoptedControllers");
const HOST_ADOPTED_WRAPPED = Symbol("litsx.adoptedWrapped");
const INITIAL_ASYNC_STATE = Symbol("litsx.initialAsyncState");

function ensureAdoptedControllerHook(host) {
  if (!host || typeof host !== "object") {
    return;
  }

  if (!host[HOST_ADOPTED_CONTROLLERS]) {
    host[HOST_ADOPTED_CONTROLLERS] = new Set();
  }

  if (host[HOST_ADOPTED_WRAPPED]) {
    return;
  }

  const originalAdoptedCallback = host.adoptedCallback;

  host.adoptedCallback = function adoptedCallback(...args) {
    if (typeof originalAdoptedCallback === "function") {
      originalAdoptedCallback.apply(this, args);
    }

    const controllers = this[HOST_ADOPTED_CONTROLLERS];
    if (!controllers) {
      return;
    }

    for (const controller of controllers) {
      if (controller && typeof controller.hostAdopted === "function") {
        controller.hostAdopted(...args);
      }
    }
  };

  host[HOST_ADOPTED_WRAPPED] = true;
}

/**
 * @internal
 */
export class EffectsController {
  constructor(host) {
    this.host = host;
    this.effects = [];
    this.cursor = 0;
    this.connectedEffects = [];
    this.connectedCursor = 0;
    this.hostIsConnected = Boolean(host?.isConnected);

    this.memos = [];
    this.memoCursor = 0;

    this.callbacks = [];
    this.callbackCursor = 0;
    this.events = [];
    this.eventCursor = 0;
    this.previousValues = [];
    this.previousCursor = 0;

    this.reducers = [];
    this.reducerCursor = 0;

    this.mutableRefs = [];
    this.mutableRefCursor = 0;

    this.ids = [];
    this.idCursor = 0;

    this.imperatives = [];
    this.imperativeCursor = 0;

    this.externalStores = [];
    this.externalStoreCursor = 0;
    this.prevExternalStoreCount = 0;

    this.transitionState = createTransitionState(this);
    this.pendingSuspenseSlots = new Set();
    this.deferredValues = [];
    this.deferredCursor = 0;
    this.priorityQueue = new PriorityScheduler(host);

    this.layoutQueue = null;
    this.passiveQueue = null;
    this.passiveScheduled = false;

    ensureAdoptedControllerHook(host);
    host[HOST_ADOPTED_CONTROLLERS].add(this);
    host.addController(this);
  }

  /** Must be called at the start of render() */
  prepare() {
    this.cursor = 0;
    this.connectedCursor = 0;
    this.memoCursor = 0;
    this.callbackCursor = 0;
    this.eventCursor = 0;
    this.previousCursor = 0;
    this.reducerCursor = 0;
    this.mutableRefCursor = 0;
    this.idCursor = 0;
    this.imperativeCursor = 0;
    this.prevExternalStoreCount = this.externalStoreCursor;
    this.externalStoreCursor = 0;
    this.deferredCursor = 0;
    this.priorityQueue.resetFrame();
  }

  /** Register an effect (layout=false) or layout-effect (layout=true) */
  register(callback, deps, layout) {
    const index = this.cursor;
    const nextDeps = Array.isArray(deps) ? deps.slice() : null;
    let rec = this.effects[index];

    if (!rec) {
      rec = this.effects[index] = {
        callback,
        deps: nextDeps,
        cleanup: undefined,
        hasRun: false,
        layout,
        needsRun: true,
      };
    } else {
      const prevDeps = rec.deps;
      rec.callback = callback;
      rec.layout = layout;
      rec.deps = nextDeps;

      let needsRun = false;
      if (nextDeps === null) {
        needsRun = true; // always run
      } else if (!rec.hasRun || !Array.isArray(prevDeps)) {
        needsRun = true;
      } else if (prevDeps.length !== nextDeps.length) {
        needsRun = true;
      } else if (prevDeps.some((v, i) => !Object.is(v, nextDeps[i]))) {
        needsRun = true;
      }

      rec.needsRun = needsRun;
      if (needsRun) rec.hasRun = false;
    }

    this.cursor = index + 1;
    return index;
  }

  registerConnected(callback, deps) {
    const index = this.connectedCursor;
    const nextDeps = Array.isArray(deps) ? deps.slice() : [];
    let rec = this.connectedEffects[index];

    if (!rec) {
      rec = this.connectedEffects[index] = {
        callback,
        deps: nextDeps,
        cleanup: undefined,
        active: false,
        needsRun: true,
      };
    } else {
      const prevDeps = rec.deps;
      rec.callback = callback;
      rec.deps = nextDeps;

      let needsRun = false;
      if (!rec.active) {
        needsRun = true;
      } else if (!Array.isArray(prevDeps)) {
        needsRun = true;
      } else if (prevDeps.length !== nextDeps.length) {
        needsRun = true;
      } else if (prevDeps.some((value, offset) => !Object.is(value, nextDeps[offset]))) {
        needsRun = true;
      }

      rec.needsRun = needsRun;
    }

    this.connectedCursor = index + 1;
    return index;
  }

  /** Build queues and trim old effects */
  buildQueues() {
    const count = Math.min(this.effects.length, this.cursor);

    const layoutQueue = [];
    const passiveQueue = [];

    for (let i = 0; i < count; i++) {
      const rec = this.effects[i];
      if (!rec) continue;
      const shouldRun = rec.needsRun || !rec.hasRun || rec.deps === null;
      if (!shouldRun) continue;
      (rec.layout ? layoutQueue : passiveQueue).push(rec);
    }

    // cleanup removed hooks
    if (this.effects.length > count) {
      for (let i = count; i < this.effects.length; i++) {
        const r = this.effects[i];
        if (r && typeof r.cleanup === "function") {
          try {
            r.cleanup.call(this.host);
          } finally {
            r.cleanup = undefined;
          }
        }
      }
      this.effects.length = count;
    }

    this.layoutQueue = layoutQueue;
    this.passiveQueue = passiveQueue;
    this.cursor = 0;
  }

  finalizeConnectedEffects() {
    const count = Math.min(this.connectedEffects.length, this.connectedCursor);

    if (this.connectedEffects.length > count) {
      for (let index = count; index < this.connectedEffects.length; index += 1) {
        const rec = this.connectedEffects[index];
        if (rec?.active && typeof rec.cleanup === "function") {
          try {
            rec.cleanup.call(this.host);
          } finally {
            rec.cleanup = undefined;
          }
        }
      }
      this.connectedEffects.length = count;
    }

    this.connectedCursor = 0;
  }

  runQueue(queue) {
    const run = (rec) => {
      if (rec.cleanup) {
        try {
          rec.cleanup.call(this.host);
        } finally {
          rec.cleanup = undefined;
        }
      }
      const cleanup = rec.callback.call(this.host);
      rec.cleanup = typeof cleanup === "function" ? cleanup : undefined;
      rec.hasRun = true;
      rec.needsRun = false;
    };
    for (const r of queue) run(r);
  }

  runLayoutNow() {
    if (this.layoutQueue?.length) {
      this.runQueue(this.layoutQueue);
      this.layoutQueue = null;
    }
  }

  schedulePassive() {
    if (this.passiveScheduled || !this.passiveQueue?.length) return;
    this.passiveScheduled = true;
    requestAnimationFrame(() => {
      try {
        if (this.passiveQueue?.length) this.runQueue(this.passiveQueue);
      } finally {
        this.passiveQueue = null;
        this.passiveScheduled = false;
      }
    });
  }

  runConnectedEffects(force = false) {
    for (const rec of this.connectedEffects) {
      if (!rec) continue;
      const shouldRun = force || rec.needsRun || !rec.active;
      if (!shouldRun) continue;

      if (typeof rec.cleanup === "function") {
        try {
          rec.cleanup.call(this.host);
        } finally {
          rec.cleanup = undefined;
        }
      }

      const cleanup = rec.callback.call(this.host);
      rec.cleanup = typeof cleanup === "function" ? cleanup : undefined;
      rec.active = true;
      rec.needsRun = false;
    }
  }

  // Lit ReactiveController lifecycle

  hostUpdate() {
    // no-op
  }

  hostUpdated() {
    this.buildQueues();
    this.finalizeConnectedEffects();
    this.runLayoutNow();
    this.schedulePassive();
    if (this.hostIsConnected) {
      this.runConnectedEffects();
    }
    this.cleanupUnusedExternalStores();
    this.resolvePendingTransitions();
    this.flushSuspenseQueues();
    this.priorityQueue.flush();
  }

  hostConnected() {
    this.hostIsConnected = true;
    this.runConnectedEffects();
  }

  hostDisconnected() {
    this.hostIsConnected = false;
    for (const r of this.effects) {
      if (r?.cleanup) {
        try {
          r.cleanup.call(this.host);
        } finally {
          r.cleanup = undefined;
        }
      }
      if (r) r.hasRun = false;
    }

    for (const rec of this.connectedEffects) {
      if (rec?.active && typeof rec.cleanup === "function") {
        try {
          rec.cleanup.call(this.host);
        } finally {
          rec.cleanup = undefined;
        }
      }
      if (rec) {
        rec.active = false;
        rec.needsRun = true;
      }
    }

    this.layoutQueue = null;
    this.passiveQueue = null;
    this.passiveScheduled = false;

    resetTransitionState(this.transitionState);

    this.pendingSuspenseSlots.clear();
    for (const imperative of this.imperatives) {
      if (!imperative) continue;
      cleanupRef(imperative.ref);
    }

    for (const store of this.externalStores) {
      if (store?.unsubscribe) {
        try {
          store.unsubscribe();
        } finally {
          store.unsubscribe = null;
        }
      }
    }
    this.externalStores.length = 0;
    this.externalStoreCursor = 0;
    this.prevExternalStoreCount = 0;
    this.clearDeferredValues();
    this.priorityQueue.clear();
  }

  hostAdopted() {
    if (!this.hostIsConnected) {
      return;
    }

    for (const rec of this.connectedEffects) {
      if (rec?.active && typeof rec.cleanup === "function") {
        try {
          rec.cleanup.call(this.host);
        } finally {
          rec.cleanup = undefined;
        }
      }
      if (rec) {
        rec.active = false;
        rec.needsRun = true;
      }
    }

    this.runConnectedEffects(true);
  }

  resolveMemo(factory, deps) {
    const index = this.memoCursor;
    const normalized = normalizeDeps(deps);
    let slot = this.memos[index];

    if (!slot) {
      const value = factory();
      slot = this.memos[index] = {
        deps: normalized,
        value,
      };
    } else {
      const shouldCompare = Array.isArray(normalized);
      const depsChanged = shouldCompare
        ? haveDepsChanged(slot.deps, normalized)
        : true;

      if (depsChanged) {
        slot.value = factory();
      }

      slot.deps = normalized;
    }
    this.memoCursor = index + 1;
    return slot.value;
  }

  resolveCallback(callback, deps) {
    const index = this.callbackCursor;
    const normalized = normalizeDeps(deps);
    let slot = this.callbacks[index];

    if (!slot) {
      slot = this.callbacks[index] = {
        deps: normalized,
        value: callback,
      };
    } else {
      const shouldCompare = Array.isArray(normalized);
      const depsChanged = shouldCompare
        ? haveDepsChanged(slot.deps, normalized)
        : true;

      if (depsChanged) {
        slot.value = callback;
      }

      slot.deps = normalized;
    }

    this.callbackCursor = index + 1;
    return slot.value;
  }

  resolveEvent(callback) {
    const index = this.eventCursor;
    let slot = this.events[index];

    if (!slot) {
      slot = this.events[index] = {
        callback,
        value: function stableEventCallback(...args) {
          return slot.callback.apply(this, args);
        },
      };
    } else {
      slot.callback = callback;
    }

    this.eventCursor = index + 1;
    return slot.value;
  }

  resolvePrevious(value, initialValue) {
    const index = this.previousCursor;
    let slot = this.previousValues[index];

    if (!slot) {
      slot = this.previousValues[index] = {
        value,
      };
      this.previousCursor = index + 1;
      return initialValue;
    }

    const previousValue = slot.value;
    slot.value = value;
    this.previousCursor = index + 1;
    return previousValue;
  }

  resolveTransition() {
    const state = this.transitionState ||= createTransitionState(this);
    return [state.isPending, state.startTransition];
  }

  startTransition(callback) {
    const state = this.transitionState ||= createTransitionState(this);
    return state.startTransition(callback);
  }

  hasPendingTransition() {
    return !!(this.transitionState && this.transitionState.pendingCount > 0);
  }

  registerSuspenseSlot(slot) {
    this.pendingSuspenseSlots.add(slot);
  }

  flushSuspenseQueues() {
    if (!this.pendingSuspenseSlots.size) return;
    for (const slot of this.pendingSuspenseSlots) {
      if (slot && typeof slot.flush === "function") {
        slot.flush(this);
      }
    }
    this.pendingSuspenseSlots.clear();
  }

  resolveReducer(reducer, initialArg, init) {
    const index = this.reducerCursor;
    let slot = this.reducers[index];

    if (!slot) {
      const initialState = typeof init === "function"
        ? init(initialArg)
        : initialArg;

      slot = {
        state: initialState,
        reducer,
        dispatch: null,
      };

      slot.dispatch = (action) => {
        const prevState = slot.state;
        const nextState = slot.reducer(slot.state, action);
        if (!Object.is(prevState, nextState)) {
          slot.state = nextState;
          if (typeof this.host.requestUpdate === "function") {
            this.host.requestUpdate();
          }
        }
        return slot.state;
      };

      this.reducers[index] = slot;
    }

    slot.reducer = reducer;
    this.reducerCursor = index + 1;
    return [slot.state, slot.dispatch];
  }

  resolveMutableRef(initialValue) {
    const index = this.mutableRefCursor;
    let slot = this.mutableRefs[index];

    if (!slot) {
      slot = this.mutableRefs[index] = {
        ref: { current: initialValue },
      };
    }

    this.mutableRefCursor = index + 1;
    return slot.ref;
  }

  resolveId() {
    const index = this.idCursor;
    let slot = this.ids[index];

    if (!slot) {
      slot = this.ids[index] = {
        value: createStableId(),
      };
    }

    this.idCursor = index + 1;
    return slot.value;
  }

  registerImperative(ref, createHandle, deps) {
    const index = this.imperativeCursor;
    const normalized = normalizeDeps(deps);

    const callback = () => {
      const handle = typeof createHandle === "function"
        ? createHandle()
        : createHandle;
      assignRef(ref, handle);
      return () => {
        cleanupRef(ref);
      };
    };

    const recordIndex = this.register(callback, normalized, true);
    this.imperatives[index] = { ref, recordIndex };
    this.imperativeCursor = index + 1;
  }

  resolvePendingTransitions() {
    const state = this.transitionState;
    if (!state) return;
    if (state.pendingCount <= 0 && state.isPending) {
      state.pendingCount = 0;
      state.isPending = false;
    }
  }

  resolveExternalStore(subscribe, getSnapshot, getServerSnapshot) {
    const index = this.externalStoreCursor;
    let slot = this.externalStores[index];

    if (!slot) {
      slot = this.externalStores[index] = {
        subscribe,
        getSnapshot,
        getServerSnapshot: typeof getServerSnapshot === "function"
          ? getServerSnapshot
          : null,
        unsubscribe: null,
        value: undefined,
      };
    } else {
      slot.subscribe = subscribe;
      slot.getSnapshot = getSnapshot;
      slot.getServerSnapshot = typeof getServerSnapshot === "function"
        ? getServerSnapshot
        : null;
    }

    slot.value = readExternalSnapshot(slot);

    const deps = [subscribe, getSnapshot];
    if (slot.getServerSnapshot) {
      deps.push(slot.getServerSnapshot);
    }

    const effect = () => {
      if (slot.unsubscribe) {
        try {
          slot.unsubscribe();
        } finally {
          slot.unsubscribe = null;
        }
      }

      const latestSnapshot = readExternalSnapshot(slot);
      if (!Object.is(slot.value, latestSnapshot)) {
        slot.value = latestSnapshot;
        if (typeof this.host.requestUpdate === "function") {
          this.host.requestUpdate();
        }
      }

      const unsubscribe = slot.subscribe(() => {
        const nextValue = readExternalSnapshot(slot);
        if (!Object.is(slot.value, nextValue)) {
          slot.value = nextValue;
          if (typeof this.host.requestUpdate === "function") {
            this.host.requestUpdate();
          }
        }
      });

      slot.unsubscribe = typeof unsubscribe === "function" ? unsubscribe : null;

      return () => {
        if (slot.unsubscribe) {
          try {
            slot.unsubscribe();
          } finally {
            slot.unsubscribe = null;
          }
        }
      };
    };

    this.register(effect, deps, true);

    this.externalStoreCursor = index + 1;
    return slot.value;
  }

  cleanupUnusedExternalStores() {
    if (this.prevExternalStoreCount <= this.externalStoreCursor) {
      this.prevExternalStoreCount = this.externalStoreCursor;
      return;
    }

    for (let index = this.externalStoreCursor; index < this.prevExternalStoreCount; index += 1) {
      const slot = this.externalStores[index];
      if (slot?.unsubscribe) {
        try {
          slot.unsubscribe();
        } finally {
          slot.unsubscribe = null;
        }
      }
    }

    this.externalStores.length = this.externalStoreCursor;
    this.prevExternalStoreCount = this.externalStoreCursor;
  }

  resolveDeferredValue(value, options) {
    const index = this.deferredCursor || 0;
    this.deferredCursor = index + 1;
    let slot = this.deferredValues[index];

    if (!slot) {
      slot = this.deferredValues[index] = {
        source: value,
        current: value,
        pending: false,
        timer: null,
        version: 0,
        options: null,
      };
      return slot;
    }

    const hasChanged = !Object.is(slot.source, value);
    slot.options = options || null;

    if (hasChanged) {
      slot.source = value;
      slot.version += 1;
      this.scheduleDeferredFlush(slot);
    }

    return slot;
  }

  scheduleDeferredFlush(slot) {
    if (slot.timer != null) {
      clearTimeout(slot.timer);
      slot.timer = null;
    }

    const timeout =
      slot.options && typeof slot.options.timeout === "number"
        ? Math.max(0, slot.options.timeout)
        : 0;

    const token = slot.version;
    slot.pending = true;

    slot.timer = setTimeout(() => {
      slot.timer = null;
      if (slot.version !== token) {
        return;
      }
      slot.current = slot.source;
      slot.pending = false;
      this.priorityQueue.enqueue({
        priority: Priority.TRANSITION,
        flush: () => this.host?.requestUpdate?.(),
      });
    }, timeout);
  }

  clearDeferredValues() {
    if (!this.deferredValues?.length) return;
    for (const slot of this.deferredValues) {
      if (!slot) continue;
      if (slot.timer != null) {
        clearTimeout(slot.timer);
        slot.timer = null;
      }
      slot.pending = false;
    }
  }
}

// --- Helpers ---

const controllers = new WeakMap();
const lazyElementCache = new WeakMap();
let globalIdCounter = 0;
let currentHookHost = null;

function createStableId() {
  globalIdCounter += 1;
  return `litsx-${globalIdCounter}`;
}

function resolveRuntimeHost(host) {
  if (host && typeof host === "object") {
    return host;
  }

  if (currentHookHost && typeof currentHookHost === "object") {
    return currentHookHost;
  }

  return null;
}

function isReactiveControllerHostLike(value) {
  return !!value
    && typeof value === "object"
    && typeof value.addController === "function";
}

function readHostSlotName(node) {
  if (!node || typeof node !== "object") {
    return "default";
  }

  if (typeof node.slot === "string" && node.slot) {
    return node.slot;
  }

  if (typeof node.getAttribute === "function") {
    const slotName = node.getAttribute("slot");
    if (typeof slotName === "string" && slotName) {
      return slotName;
    }
  }

  return "default";
}

function readHostTextContent(host) {
  if (typeof host?.textContent === "string") {
    return host.textContent;
  }

  const nodes = Array.isArray(host?.childNodes) ? host.childNodes : Array.from(host?.childNodes ?? []);
  return nodes.map((node) => node?.textContent ?? "").join("");
}

function createHostContentSnapshot(host, options = {}) {
  const nodes = Array.from(host?.childNodes ?? []);
  const rawText = readHostTextContent(host);
  const text = options.trim ? rawText.trim() : rawText;
  const slots = { default: [] };

  for (const node of nodes) {
    const slotName = readHostSlotName(node);
    if (!slots[slotName]) {
      slots[slotName] = [];
    }
    slots[slotName].push(node);
  }

  const hasContent = nodes.some((node) => {
    if (!node || typeof node !== "object") {
      return false;
    }

    if (node.nodeType === 3) {
      return String(node.textContent ?? "").trim().length > 0;
    }

    return true;
  });

  return {
    text,
    nodes,
    hasContent,
    slots,
  };
}

function isSameHostContentSnapshot(prev, next) {
  if (prev === next) {
    return true;
  }

  if (!prev || !next) {
    return false;
  }

  if (prev.text !== next.text || prev.hasContent !== next.hasContent) {
    return false;
  }

  if (prev.nodes.length !== next.nodes.length) {
    return false;
  }

  for (let index = 0; index < prev.nodes.length; index += 1) {
    if (prev.nodes[index] !== next.nodes[index]) {
      return false;
    }
  }

  const prevSlotNames = Object.keys(prev.slots);
  const nextSlotNames = Object.keys(next.slots);
  if (prevSlotNames.length !== nextSlotNames.length) {
    return false;
  }

  for (const slotName of prevSlotNames) {
    if (!next.slots[slotName]) {
      return false;
    }

    const prevNodes = prev.slots[slotName];
    const nextNodes = next.slots[slotName];
    if (prevNodes.length !== nextNodes.length) {
      return false;
    }

    for (let index = 0; index < prevNodes.length; index += 1) {
      if (prevNodes[index] !== nextNodes[index]) {
        return false;
      }
    }
  }

  return true;
}

function getController(host) {
  const resolvedHost = resolveRuntimeHost(host);
  if (!resolvedHost) {
    throw new TypeError(
      "Lit<sup>sx</sup> hooks require an active ReactiveControllerHost during render."
    );
  }

  let c = controllers.get(resolvedHost);
  if (!c) {
    c = new EffectsController(resolvedHost);
    controllers.set(resolvedHost, c);
  }
  return c;
}

function getElementRegistry(host) {
  if (!host || typeof host !== "object") {
    return null;
  }
  const registry = host.registry;
  if (
    !registry ||
    typeof registry.define !== "function" ||
    typeof registry.get !== "function"
  ) {
    return null;
  }
  return registry;
}

function isCustomElementConstructor(value) {
  if (typeof value !== "function") {
    return false;
  }

  const HTMLElementCtor = globalThis.HTMLElement;
  if (typeof HTMLElementCtor === "function") {
    return value === HTMLElementCtor || value.prototype instanceof HTMLElementCtor;
  }

  return /^class\s/.test(Function.prototype.toString.call(value));
}

function defineScopedElement(registry, tag, ctor) {
  if (!registry || !tag || !ctor) {
    return ctor ?? null;
  }

  const existing = registry.get(tag);
  if (existing) {
    return existing;
  }

  registry.define(tag, ctor);
  return ctor;
}

function resolveLazyLoaderResult(host, registry, tag, result) {
  if (result == null) {
    return null;
  }

  if (!isCustomElementConstructor(result)) {
    throw new TypeError(
      `ensureLazyElement expected "${tag}" to resolve to a custom element constructor.`
    );
  }

  return defineScopedElement(registry, tag, result);
}

/**
 * Reset hook cursors at the beginning of render().
 * @param {import('lit').ReactiveControllerHost} host
 */
/**
 * @internal
 */
export function prepareEffects(host) {
  const resolvedHost = resolveRuntimeHost(host);
  if (!resolvedHost) {
    throw new TypeError(
      "prepareEffects() requires a ReactiveControllerHost."
    );
  }
  currentHookHost = resolvedHost;
  getController(resolvedHost).prepare();
}

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
 * Return the current component instance.
 * Use this when a component or custom hook needs direct access to instance-level platform APIs.
 * @usage Call useHost inside a Lit<sup>sx</sup> component or custom hook during render.
 * @usage Prefer more specific hooks like useRef when you need a rendered DOM node instead of the host instance itself.
 * @behavior Returns the active component instance for the current render pass.
 * @behavior Throws if called without an active host, just like other Lit<sup>sx</sup> hooks.
 * @mentalModel useHost gives authored code access to the current component instance as host-level platform context, not as render data.
 * @pitfall Prefer more specific hooks like useRef, useHostContent, or useSlot when they describe the intent more clearly than direct host access.
 * @pitfall Do not turn useHost into the default path for every DOM interaction. Reach for it when the component genuinely needs host-level platform APIs.
 * @example
 * const host = useHost();
 *
 * useOnConnect(() => {
 *   const observer = new MutationObserver(() => {
 *     console.log(host.textContent);
 *   });
 *   observer.observe(host, { childList: true, subtree: true });
 *   return () => observer.disconnect();
 * }, []);
 * @param {import('lit').ReactiveControllerHost} host
 * @returns {import('lit').ReactiveControllerHost}
 */
export function useHost(host) {
  const resolvedHost = resolveRuntimeHost(host);
  if (!resolvedHost) {
    throw new TypeError(
      "Lit<sup>sx</sup> hooks require an active ReactiveControllerHost during render."
    );
  }
  return resolvedHost;
}

/**
 * Read reactive light DOM content from the current component.
 * Use this when authored code needs projected text or nodes as input, while staying aligned with the web-component model.
 * @usage Call useHostContent when a component derives behavior from the content placed inside its own tag.
 * @usage Prefer this over manual MutationObserver wiring when the goal is to react to host content changes declaratively.
 * @usage Use the returned `text` for textual inputs, `nodes` for generic projected content, and `slots` when content should be grouped by slot name.
 * @behavior Returns a reactive snapshot of the current host content.
 * @behavior The snapshot updates when light DOM children, text nodes, or slot attributes change.
 * @behavior `slots.default` contains nodes without an explicit slot name.
 * @mentalModel useHostContent treats the host's light DOM as input data owned by the component boundary, not as an implementation detail hidden behind `this.textContent`.
 * @pitfall This reads projected host content, not children as an abstract virtual data structure.
 * @example
 * const content = useHostContent({ trim: true });
 * const source = content.text;
 *
 * return <pre>{source}</pre>;
 * @param {import('lit').ReactiveControllerHost} host
 * @param {{ trim?: boolean }} [options]
 * @returns {{ text: string, nodes: Node[], hasContent: boolean, slots: Record<string, Node[]> & { default: Node[] } }}
 */
export function useHostContent(host, options) {
  let runtimeHost = host;
  let normalizedOptions = options;

  if (!isReactiveControllerHostLike(host)) {
    runtimeHost = undefined;
    normalizedOptions = host;
  }

  const resolvedHost = useHost(runtimeHost);
  normalizedOptions = normalizedOptions && typeof normalizedOptions === "object"
    ? normalizedOptions
    : {};
  const [snapshot, setSnapshot] = useState(
    resolvedHost,
    () => createHostContentSnapshot(resolvedHost, normalizedOptions)
  );

  useOnConnect(resolvedHost, () => {
    if (typeof MutationObserver !== "function") {
      return;
    }

    const syncSnapshot = () => {
      const nextSnapshot = createHostContentSnapshot(resolvedHost, normalizedOptions);
      setSnapshot((prevSnapshot) =>
        isSameHostContentSnapshot(prevSnapshot, nextSnapshot)
          ? prevSnapshot
          : nextSnapshot
      );
    };

    const observer = new MutationObserver(() => {
      syncSnapshot();
    });

    observer.observe(resolvedHost, {
      childList: true,
      characterData: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["slot"],
    });

    syncSnapshot();

    return () => {
      observer.disconnect();
    };
  }, [normalizedOptions.trim]);

  return snapshot;
}

/**
 * Read reactive text content projected into the current component.
 * Use this when the component consumes light DOM text as input data.
 * @usage Call useTextContent when content inside the host should be treated as text, such as markdown, SQL, or authored source code.
 * @usage Prefer useHostContent when the component also needs direct access to projected nodes or slot groupings.
 * @behavior Returns a reactive text snapshot derived from the current host content.
 * @behavior The returned string updates when host text nodes or child content change.
 * @mentalModel useTextContent treats the host's projected content as a text input stream for the component, not as node-level structure.
 * @pitfall useTextContent flattens projected content to text. If the component cares about node boundaries or named slots, useHostContent or useSlot instead.
 * @pitfall Text snapshots may include formatting whitespace from authored markup unless `trim` is enabled or the caller normalizes the content.
 * @example
 * const source = useTextContent({ trim: true });
 * @param {import('lit').ReactiveControllerHost} host
 * @param {{ trim?: boolean }} [options]
 * @returns {string}
 */
export function useTextContent(host, options) {
  let runtimeHost = host;
  let normalizedOptions = options;

  if (!isReactiveControllerHostLike(host)) {
    runtimeHost = undefined;
    normalizedOptions = host;
  }

  return runtimeHost === undefined
    ? useHostContent(normalizedOptions).text
    : useHostContent(runtimeHost, normalizedOptions).text;
}

/**
 * Read reactive projected nodes for one slot.
 * Use this when authored code needs projected content grouped by slot name in a web-component-native way.
 * @usage Call useSlot() for default content and useSlot("name") for named projected content.
 * @usage Prefer useHostContent when the component needs the full host-content snapshot instead of just one slot.
 * @behavior Returns a reactive array of nodes assigned to the requested slot.
 * @behavior The returned array updates when projected nodes are added, removed, or moved between slots.
 * @mentalModel useSlot gives authored code a reactive view of projected light DOM for one slot. It does not render, clone, or virtualize children as framework-level data.
 * @pitfall useSlot reads host-projected content, not JSX children as an abstract data structure.
 * @example
 * const defaultNodes = useSlot();
 * const actions = useSlot("actions");
 * @param {import('lit').ReactiveControllerHost} host
 * @param {string} [slotName]
 * @returns {Node[]}
 */
export function useSlot(host, slotName) {
  let runtimeHost = host;
  let requestedSlot = slotName;

  if (!isReactiveControllerHostLike(host)) {
    runtimeHost = undefined;
    requestedSlot = host;
  }

  const resolvedSlotName = typeof requestedSlot === "string" && requestedSlot
    ? requestedSlot
    : "default";

  return useHostContent(runtimeHost).slots[resolvedSlotName] ?? [];
}

/**
 * @internal
 * Run side effects after the host has committed its update.
 * Use useEffect for subscriptions, timers, logging, and other passive work that should follow a render.
 * @usage Return a cleanup function when the effect allocates resources that must be released.
 * @usage Pass a dependency array to control when the effect is re-run.
 * @behavior The effect runs after the host update cycle completes.
 * @example
 * useEffect(() => {
 *   const handle = setInterval(() => refresh(), 1000);
 *   return () => clearInterval(handle);
 * }, []);
 * @param {import('lit').ReactiveControllerHost} host
 * @param {() => void | (() => void)} callback
 * @param {ReadonlyArray<unknown>} [deps]
 */
export function useEffect(host, callback, deps) {
  return useAfterUpdate(host, callback, deps);
}

/**
 * @internal
 * Run synchronous commit-phase work before the browser paints the next frame.
 * Use useLayoutEffect when an effect must read or write layout-critical state during commit.
 * @usage Keep the work small and synchronous so it does not block rendering more than necessary.
 * @usage Return a cleanup function when the effect installs commit-scoped resources.
 * @behavior The effect runs during the host commit phase.
 * @example
 * useLayoutEffect(() => {
 *   inputRef.current?.focus();
 * }, []);
 * @param {import('lit').ReactiveControllerHost} host
 * @param {() => void | (() => void)} callback
 * @param {ReadonlyArray<unknown>} [deps]
 */
export function useLayoutEffect(host, callback, deps) {
  return useOnCommit(host, callback, deps);
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
  if (typeof action !== "function") {
    throw new TypeError("useAsyncState expects an action function");
  }

  const [state, setState] = useState(host, initialState);
  const [error, setError] = useState(host, null);
  const [pending, beginTransition] = useTransition(host);
  const initialStateRef = useRef(host, INITIAL_ASYNC_STATE);
  const stateRef = useRef(host, state);
  const latestRunRef = useRef(host, 0);

  if (initialStateRef.current === INITIAL_ASYNC_STATE) {
    initialStateRef.current = state;
  }

  stateRef.current = state;

  const run = useEvent(host, (...args) => {
    const runId = latestRunRef.current + 1;
    latestRunRef.current = runId;
    setError(null);

    let result;
    try {
      result = beginTransition(() => action(stateRef.current, ...args));
    } catch (nextError) {
      if (runId === latestRunRef.current) {
        setError(nextError);
      }
      return Promise.reject(nextError);
    }

    return Promise.resolve(result).then(
      (nextState) => {
        if (runId === latestRunRef.current) {
          stateRef.current = nextState;
          setError(null);
          setState(nextState);
        }
        return nextState;
      },
      (nextError) => {
        if (runId === latestRunRef.current) {
          setError(nextError);
        }
        return Promise.reject(nextError);
      }
    );
  });

  const reset = useEvent(host, () => {
    latestRunRef.current += 1;
    stateRef.current = initialStateRef.current;
    setError(null);
    setState(initialStateRef.current);
  });

  return [state, run, { pending, error, reset }];
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
  const reducer = typeof updateFn === "function"
    ? updateFn
    : (_currentState, optimisticValue) => optimisticValue;
  const baseStateRef = useRef(host, state);
  const queueRef = useRef(host, []);
  const [, forceRender] = useState(host, 0);

  if (!Object.is(baseStateRef.current, state)) {
    baseStateRef.current = state;
    queueRef.current = [];
  }

  const addOptimistic = useEvent(host, (optimisticValue) => {
    queueRef.current = [...queueRef.current, optimisticValue];
    forceRender((version) => version + 1);
  });

  const resetOptimistic = useEvent(host, () => {
    if (queueRef.current.length === 0) {
      return;
    }
    queueRef.current = [];
    forceRender((version) => version + 1);
  });

  const optimisticState = queueRef.current.reduce(
    (currentState, optimisticValue) => reducer(currentState, optimisticValue),
    state
  );

  return [optimisticState, addOptimistic, resetOptimistic];
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
  const controller = getController(host);
  return controller.resolveTransition();
}

/**
 * Schedule non-urgent updates using the same transition machinery as useTransition.
 * @param {import('lit').ReactiveControllerHost} host
 * @param {() => any} callback
 * @returns {any}
 */
export function startTransition(host, callback) {
  return getController(host).startTransition(callback);
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
  const controller = getController(host);
  const slot = controller.resolveDeferredValue(value, options);
  return slot.pending ? slot.current : slot.source;
}

/**
 * Apply a dynamic style property to the current component host.
 * Think of useStyle as the authored way to drive CSS custom properties or individual host style values from component state.
 * @usage Use useStyle for dynamic theme values, layout measurements, or other single style properties that change with state.
 * @usage This is especially useful for CSS custom properties such as `--accent-color` that your stylesheet consumes.
 * @usage Prefer useStyle over rebuilding a full stylesheet string when only one or two host-level style values are dynamic.
 * @usage Pass a compute function when the style value should be derived after commit. Add a dependency array only when that derived value should be recalculated for specific reactive inputs instead of every commit.
 * @behavior Lit<sup>sx</sup> applies the style property to the host element after commit.
 * @behavior Passing `null`, `undefined`, or `false` removes the property from the host.
 * @behavior The property is applied through the host's inline style object, making it a good fit for CSS variables and host-level overrides.
 * @mentalModel useStyle lets JavaScript decide a value while CSS keeps ownership of how that value is consumed.
 * @pitfall Do not use useStyle to move large amounts of visual styling into JavaScript. Keep most presentation in CSS rules and use this hook only for the dynamic edge.
 * @pitfall When the value naturally belongs on a child element rather than the host, prefer a normal JSX `style` binding or a class/attribute-based selector.
 * @pitfall Keep compute functions pure. Omitting the dependency array means the compute function runs after every commit.
 * @example
 * useStyle("--accent-color", accent);
 * useStyle("--panel-width", `${width}px`);
 * useStyle("--panel-gap", () => `${gap}px`);
 * useStyle("--panel-gap", () => `${gap}px`, [gap]);
 * @param {import('lit').ReactiveControllerHost} host
 * @param {string} propertyName CSS property name to set on the current host.
 * @param {string | number | null | undefined | false | (() => string | number | null | undefined | false)} valueOrFactory Value to assign to that property, or a pure compute function evaluated after commit.
 * @param {ReadonlyArray<unknown>} [deps] Reactive values that control when the computed style value should be recalculated.
 */
export function useStyle(host, propertyName, valueOrFactory, deps) {
  const isComputed = typeof valueOrFactory === "function";

  useOnCommit(host, () => {
    if (!host?.style) return;

    const value = isComputed ? valueOrFactory() : valueOrFactory;

    if (value == null || value === false) {
      host.style.removeProperty?.(propertyName);
      return;
    }

    host.style.setProperty?.(propertyName, String(value));
  }, isComputed
    ? (Array.isArray(deps) ? [propertyName, ...deps] : undefined)
    : [propertyName, valueOrFactory]);
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
  return getController(host).resolveMutableRef(initialValue);
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
  return getController(host).resolveId();
}

/**
 * Run a callback ref through the component lifecycle.
 * @param {import('lit').ReactiveControllerHost} host
 * @param {() => Element | null} getTarget
 * @param {(node: Element | null) => void} callback
 * @param {ReadonlyArray<unknown>} [deps]
 */
export function useCallbackRef(host, getTarget, callback, deps) {
  if (typeof getTarget !== "function") {
    throw new TypeError("useCallbackRef expects a getter function");
  }
  if (typeof callback !== "function") {
    return;
  }

  const boundCallback = (node) => callback.call(host, node);

  getController(host).registerImperative(
    boundCallback,
    () => getTarget.call(host) ?? null,
    deps
  );
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
  getController(host).registerImperative(ref, createHandle, deps);
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
  if (typeof subscribe !== "function") {
    throw new TypeError("useExternalStore requires a subscribe function.");
  }
  if (typeof getSnapshot !== "function") {
    throw new TypeError("useExternalStore requires a getSnapshot function.");
  }
  return getController(host).resolveExternalStore(
    subscribe,
    getSnapshot,
    getServerSnapshot
  );
}

/**
 * Ensure a custom element tag is registered for the current host registry.
 * Accepts a direct custom element constructor, a loader function, or nullish values.
 * @param {import('lit').ReactiveControllerHost & { registry?: CustomElementRegistry }} host
 * @param {string} tag
 * @param {Function | CustomElementConstructor | null | undefined} value
 * @returns {CustomElementConstructor | null}
 */
export function ensureLazyElement(host, tag, value) {
  if (typeof tag !== "string" || tag.length === 0) {
    throw new TypeError("ensureLazyElement requires a non-empty tag name.");
  }

  const registry = getElementRegistry(host);
  if (!registry) {
    return null;
  }

  const existing = registry.get(tag);
  if (existing) {
    return existing;
  }

  if (value == null) {
    return null;
  }

  if (isCustomElementConstructor(value)) {
    return defineScopedElement(registry, tag, value);
  }

  if (typeof value !== "function") {
    throw new TypeError(
      `ensureLazyElement expected "${tag}" to receive a loader, constructor, or nullish value.`
    );
  }

  let entry = lazyElementCache.get(value);
  if (!entry) {
    entry = {
      status: "fresh",
      promise: null,
      result: null,
      error: null,
    };
    lazyElementCache.set(value, entry);
  }

  if (entry.status === "resolved") {
    return resolveLazyLoaderResult(host, registry, tag, entry.result);
  }

  if (entry.status === "rejected") {
    throw entry.error;
  }

  if (entry.status === "pending") {
    return null;
  }

  entry.status = "pending";
  entry.promise = Promise.resolve()
    .then(() => value())
    .then((result) => {
      entry.status = "resolved";
      entry.result = result;
      resolveLazyLoaderResult(host, registry, tag, result);
      host?.requestUpdate?.();
      return result;
    })
    .catch((error) => {
      entry.status = "rejected";
      entry.error = error;
      host?.requestUpdate?.();
      throw error;
    });

  return null;
}

function createTransitionState(controller) {
  const state = {
    controller,
    isPending: false,
    pendingCount: 0,
    pendingTokens: new Set(),
    lastToken: 0,
    startTransition: null,
  };

  state.startTransition = (callback) => {
    if (typeof callback !== "function") {
      throw new TypeError("startTransition expects a function");
    }

    const token = ++state.lastToken;
    state.pendingTokens.add(token);
    state.pendingCount = state.pendingTokens.size;
    state.isPending = true;
    controller.host?.requestUpdate?.();

    let finalized = false;
    const finish = () => {
      if (finalized) return;
      finalized = true;
      if (!state.pendingTokens.delete(token)) {
        return;
      }
      state.pendingCount = state.pendingTokens.size;
      if (state.pendingCount === 0) {
        state.isPending = false;
        controller.host?.requestUpdate?.();
      }
    };

    let result;
    try {
      result = callback();
    } catch (error) {
      finish();
      throw error;
    }

    if (isThenable(result)) {
      Promise.resolve(result).then(finish, finish);
    } else {
      queueMicrotask(finish);
    }

    return result;
  };

  return state;
}

function resetTransitionState(state) {
  if (!state) return;
  state.isPending = false;
  state.pendingCount = 0;
  if (state.pendingTokens) {
    state.pendingTokens.clear();
  }
}

function isThenable(value) {
  return (
    value != null &&
    (typeof value === "object" || typeof value === "function") &&
    typeof value.then === "function"
  );
}

function normalizeDeps(deps) {
  if (Array.isArray(deps)) {
    return deps.slice();
  }
  return deps ?? undefined;
}

function haveDepsChanged(prev, next) {
  if (!Array.isArray(prev) || !Array.isArray(next)) {
    return true;
  }
  if (prev.length !== next.length) {
    return true;
  }
  for (let index = 0; index < prev.length; index += 1) {
    if (!Object.is(prev[index], next[index])) {
      return true;
    }
  }
  return false;
}

function assignRef(ref, value) {
  if (!ref) return;
  if (typeof ref === "function") {
    ref(value);
    return;
  }
  if (typeof ref === "object") {
    ref.current = value;
  }
}

function cleanupRef(ref) {
  assignRef(ref, null);
}

function shouldUseServerSnapshot() {
  return typeof window === "undefined";
}

function readExternalSnapshot(slot) {
  const { getSnapshot, getServerSnapshot } = slot;
  const getter = shouldUseServerSnapshot() && typeof getServerSnapshot === "function"
    ? getServerSnapshot
    : getSnapshot;
  return getter();
}

const Priority = {
  IMMEDIATE: 0,
  TRANSITION: 1,
  IDLE: 2,
};

class PriorityScheduler {
  constructor(host) {
    this.host = host;
    this.queues = {
      [Priority.IMMEDIATE]: [],
      [Priority.TRANSITION]: [],
      [Priority.IDLE]: [],
    };
    this.flushScheduled = false;
  }

  enqueue(task) {
    const bucket = this.queues[task.priority ?? Priority.IDLE];
    bucket.push(task);
    if (!this.flushScheduled) {
      this.flushScheduled = true;
      queueMicrotask(() => this.flush());
    }
  }

  flush() {
    if (!this.flushScheduled) return;
    this.flushScheduled = false;

    for (const priority of [Priority.IMMEDIATE, Priority.TRANSITION, Priority.IDLE]) {
      const bucket = this.queues[priority];
      if (!bucket.length) continue;
      while (bucket.length) {
        const task = bucket.shift();
        try {
          task.flush();
        } catch (error) {
          // Surface errors to the host so the scheduler doesn't swallow them.
          this.host?.reportError?.(error);
          throw error;
        }
      }
    }
  }

  resetFrame() {
    // Called at the start of render; nothing frame-specific yet but keeps API symmetry.
  }

  clear() {
    for (const priority of Object.keys(this.queues)) {
      this.queues[priority].length = 0;
    }
    this.flushScheduled = false;
  }
}
