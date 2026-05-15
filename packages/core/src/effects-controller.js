import { normalizeDeps } from "./runtime-deps.js";
import { assignRef, cleanupRef } from "./runtime-refs.js";
import { PriorityScheduler } from "./runtime-priority-scheduler.js";
import { addAdoptedController } from "./runtime-adopted-controllers.js";
import { createTransitionState, resetTransitionState } from "./runtime-transition-state.js";
import {
  cleanupExternalStoreSlot,
  createExternalStoreEffect,
  readExternalSnapshot,
} from "./runtime-external-store.js";
import {
  buildEffectQueues,
  cleanupDisconnectedEffects,
  finalizeConnectedEffects,
  registerConnectedEffect,
  registerEffect,
  resetAdoptedConnectedEffects,
  runConnectedEffects,
  runEffectQueue,
} from "./runtime-effect-queues.js";
import {
  clearDeferredValues,
  resolveDeferredValue,
  scheduleDeferredFlush,
} from "./runtime-deferred-values.js";
import {
  resolveCallback,
  resolveEvent,
  resolveId,
  resolveMemo,
  resolveMutableRef,
  resolvePrevious,
  resolveReducer,
} from "./runtime-slot-resolvers.js";

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
    return registerEffect(this, callback, deps, layout);
  }

  registerConnected(callback, deps) {
    return registerConnectedEffect(this, callback, deps);
  }

  buildQueues() {
    buildEffectQueues(this);
  }

  finalizeConnectedEffects() {
    finalizeConnectedEffects(this);
  }

  runQueue(queue) {
    runEffectQueue(this, queue);
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
    runConnectedEffects(this, force);
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
    cleanupDisconnectedEffects(this);

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
    clearDeferredValues(this);
    this.priorityQueue.clear();
  }

  hostAdopted() {
    if (!this.hostIsConnected) {
      return;
    }

    resetAdoptedConnectedEffects(this);
    this.runConnectedEffects(true);
  }

  resolveMemo(factory, deps) {
    return resolveMemo(this, factory, deps);
  }

  resolveCallback(callback, deps) {
    return resolveCallback(this, callback, deps);
  }

  resolveEvent(callback) {
    return resolveEvent(this, callback);
  }

  resolvePrevious(value, initialValue) {
    return resolvePrevious(this, value, initialValue);
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
    return resolveReducer(this, reducer, initialArg, init);
  }

  resolveMutableRef(initialValue) {
    return resolveMutableRef(this, initialValue);
  }

  resolveId() {
    return resolveId(this);
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
    return resolveDeferredValue(this, value, options);
  }

  scheduleDeferredFlush(slot) {
    scheduleDeferredFlush(this, slot);
  }

  clearDeferredValues() {
    clearDeferredValues(this);
  }
}
