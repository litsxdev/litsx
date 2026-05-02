import { createStableId } from "./runtime-ids.js";
import { normalizeDeps, shouldRerunRecord, haveDepsChanged } from "./runtime-deps.js";
import { assignRef, cleanupRef } from "./runtime-refs.js";
import { runCleanup } from "./runtime-cleanup.js";
import { Priority, PriorityScheduler } from "./runtime-priority-scheduler.js";
import { addAdoptedController } from "./runtime-adopted-controllers.js";
import { createTransitionState, resetTransitionState } from "./runtime-transition-state.js";
import {
  cleanupExternalStoreSlot,
  createExternalStoreEffect,
  readExternalSnapshot,
} from "./runtime-external-store.js";

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

    addAdoptedController(host, this);
    host.addController(this);
  }

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

  register(callback, deps, layout) {
    const index = this.cursor;
    const nextDeps = Array.isArray(deps) ? deps.slice() : null;
    let record = this.effects[index];

    if (!record) {
      record = this.effects[index] = {
        callback,
        deps: nextDeps,
        cleanup: undefined,
        hasRun: false,
        layout,
        needsRun: true,
      };
    } else {
      const prevDeps = record.deps;
      const prevHasRun = record.hasRun;
      record.callback = callback;
      record.layout = layout;
      record.needsRun = shouldRerunRecord(
        { deps: prevDeps, hasRun: prevHasRun },
        nextDeps
      );
      record.deps = nextDeps;
      if (record.needsRun) {
        record.hasRun = false;
      }
    }

    this.cursor = index + 1;
    return index;
  }

  registerConnected(callback, deps) {
    const index = this.connectedCursor;
    const nextDeps = Array.isArray(deps) ? deps.slice() : [];
    let record = this.connectedEffects[index];

    if (!record) {
      record = this.connectedEffects[index] = {
        callback,
        deps: nextDeps,
        cleanup: undefined,
        active: false,
        needsRun: true,
      };
    } else {
      const prevDeps = record.deps;
      record.callback = callback;
      record.needsRun = !record.active || haveDepsChanged(prevDeps, nextDeps);
      record.deps = nextDeps;
    }

    this.connectedCursor = index + 1;
    return index;
  }

  buildQueues() {
    const count = Math.min(this.effects.length, this.cursor);
    const layoutQueue = [];
    const passiveQueue = [];

    for (let index = 0; index < count; index += 1) {
      const record = this.effects[index];
      if (!record) continue;
      const shouldRun = record.needsRun || !record.hasRun || record.deps === null;
      if (!shouldRun) continue;
      (record.layout ? layoutQueue : passiveQueue).push(record);
    }

    if (this.effects.length > count) {
      for (let index = count; index < this.effects.length; index += 1) {
        runCleanup(this.effects[index], this.host);
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
        const record = this.connectedEffects[index];
        if (record?.active) {
          runCleanup(record, this.host);
        }
      }
      this.connectedEffects.length = count;
    }

    this.connectedCursor = 0;
  }

  runQueue(queue) {
    for (const record of queue) {
      runCleanup(record, this.host);
      const cleanup = record.callback.call(this.host);
      record.cleanup = typeof cleanup === "function" ? cleanup : undefined;
      record.hasRun = true;
      record.needsRun = false;
    }
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
    for (const record of this.connectedEffects) {
      if (!record) continue;
      const shouldRun = force || record.needsRun || !record.active;
      if (!shouldRun) continue;

      runCleanup(record, this.host);

      const cleanup = record.callback.call(this.host);
      record.cleanup = typeof cleanup === "function" ? cleanup : undefined;
      record.active = true;
      record.needsRun = false;
    }
  }

  hostUpdate() {}

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
    for (const record of this.effects) {
      runCleanup(record, this.host);
      if (record) record.hasRun = false;
    }

    for (const record of this.connectedEffects) {
      if (record?.active) {
        runCleanup(record, this.host);
      }
      if (record) {
        record.active = false;
        record.needsRun = true;
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
      cleanupExternalStoreSlot(store);
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

    for (const record of this.connectedEffects) {
      if (record?.active) {
        runCleanup(record, this.host);
      }
      if (record) {
        record.active = false;
        record.needsRun = true;
      }
    }

    this.runConnectedEffects(true);
  }

  resolveMemo(factory, deps) {
    const index = this.memoCursor;
    const normalized = normalizeDeps(deps);
    let slot = this.memos[index];

    if (!slot) {
      slot = this.memos[index] = {
        deps: normalized,
        value: factory(),
      };
    } else {
      const shouldCompare = Array.isArray(normalized);
      const depsChanged = shouldCompare ? haveDepsChanged(slot.deps, normalized) : true;
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
      const depsChanged = shouldCompare ? haveDepsChanged(slot.deps, normalized) : true;
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
      slot = this.previousValues[index] = { value };
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
      const initialState = typeof init === "function" ? init(initialArg) : initialArg;

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
          this.host.requestUpdate?.();
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
      const handle = typeof createHandle === "function" ? createHandle() : createHandle;
      assignRef(ref, handle);
      return () => {
        cleanupRef(ref);
      };
    };

    this.register(callback, normalized, true);
    this.imperatives[index] = { ref };
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
        getServerSnapshot: typeof getServerSnapshot === "function" ? getServerSnapshot : null,
        unsubscribe: null,
        value: undefined,
      };
    } else {
      slot.subscribe = subscribe;
      slot.getSnapshot = getSnapshot;
      slot.getServerSnapshot = typeof getServerSnapshot === "function" ? getServerSnapshot : null;
    }

    slot.value = readExternalSnapshot(slot);

    const deps = [subscribe, getSnapshot];
    if (slot.getServerSnapshot) {
      deps.push(slot.getServerSnapshot);
    }

    const effect = createExternalStoreEffect(slot, this.host);

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
      cleanupExternalStoreSlot(slot);
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
