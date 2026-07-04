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

const EXPOSED_METHODS = Symbol.for("litsx.exposedMethods");

function isObject(value) {
  return value !== null && typeof value === "object";
}

function getExposedMethodRegistry(host) {
  if (!isObject(host)) {
    return null;
  }
  if (!Object.prototype.hasOwnProperty.call(host, EXPOSED_METHODS)) {
    Object.defineProperty(host, EXPOSED_METHODS, {
      value: new Map(),
      configurable: true,
    });
  }
  return host[EXPOSED_METHODS];
}

function resolveLatestExposeImplementation(owners) {
  let activeOwner = -1;
  let activeImplementation = null;

  for (const [owner, implementation] of owners) {
    if (owner >= activeOwner) {
      activeOwner = owner;
      activeImplementation = implementation;
    }
  }

  return activeImplementation;
}

function removeExposedMethod(host, slotIndex, methodName) {
  const registry = getExposedMethodRegistry(host);
  const entry = registry?.get(methodName);
  if (!entry) {
    return;
  }

  entry.owners.delete(slotIndex);
  entry.implementation = resolveLatestExposeImplementation(entry.owners);

  if (typeof entry.implementation === "function") {
    return;
  }

  delete host[methodName];
  registry.delete(methodName);
}

function installExposedMethods(host, slotIndex, slot, handle) {
  if (!isObject(handle)) {
    throw new TypeError("useExpose expects createHandle() to return an object of imperative methods.");
  }

  const registry = getExposedMethodRegistry(host);
  if (!registry) {
    return;
  }

  const methodNames = Object.keys(handle);
  for (const name of methodNames) {
    if (typeof handle[name] !== "function") {
      throw new TypeError(`useExpose only supports imperative methods. Received non-function member "${name}".`);
    }
  }

  for (const existingName of slot.methodNames || []) {
    if (!methodNames.includes(existingName)) {
      removeExposedMethod(host, slotIndex, existingName);
    }
  }

  for (const name of methodNames) {
    const implementation = handle[name];
    let entry = registry.get(name);
    let wrapper = entry?.wrapper;

    if (!wrapper) {
      const ownDescriptor = Object.getOwnPropertyDescriptor(host, name);
      if (ownDescriptor && !entry) {
        throw new TypeError(`useExpose cannot install method "${name}" because the host already defines that own property.`);
      }

      wrapper = function exposedHostMethod(...args) {
        const currentEntry = registry.get(name);
        const currentImplementation = currentEntry?.implementation;
        if (typeof currentImplementation !== "function") {
          return undefined;
        }
        return currentImplementation.apply(host, args);
      };

      Object.defineProperty(host, name, {
        value: wrapper,
        writable: true,
        configurable: true,
      });

      entry = {
        wrapper,
        owners: new Map(),
        implementation: null,
      };
      registry.set(name, entry);
    }

    entry.owners.set(slotIndex, implementation);
    entry.implementation = resolveLatestExposeImplementation(entry.owners);
  }

  slot.methodNames = methodNames;
}

function cleanupExposedSlot(host, slotIndex, slot) {
  for (const methodName of slot?.methodNames || []) {
    removeExposedMethod(host, slotIndex, methodName);
  }
  if (slot) {
    slot.methodNames = [];
  }
}

function getExposeRefTarget(controller, ref) {
  if (!controller.exposeRefTargets.has(ref)) {
    controller.exposeRefTargets.set(ref, {
      methods: new Map(),
      handle: {},
    });
  }
  return controller.exposeRefTargets.get(ref);
}

function removeExposedRefMethod(controller, slotIndex, slot, methodName) {
  const target = controller.exposeRefTargets.get(slot?.ref);
  const entry = target?.methods.get(methodName);
  if (!entry) {
    return;
  }

  entry.owners.delete(slotIndex);
  entry.implementation = resolveLatestExposeImplementation(entry.owners);

  if (typeof entry.implementation !== "function") {
    target.methods.delete(methodName);
    delete target.handle[methodName];
  }

  if (target.methods.size === 0) {
    cleanupRef(slot.ref);
    controller.exposeRefTargets.delete(slot.ref);
  } else {
    assignRef(slot.ref, target.handle);
  }
}

function cleanupExposedRefSlot(controller, slotIndex, slot) {
  if (!slot?.ref) {
    slot.methodNames = [];
    slot.ref = null;
    return;
  }

  for (const methodName of slot.methodNames || []) {
    removeExposedRefMethod(controller, slotIndex, slot, methodName);
  }

  slot.methodNames = [];
  slot.ref = null;
}

function installExposedRefMethods(controller, slotIndex, slot, ref, handle) {
  if (!isObject(handle)) {
    throw new TypeError("useExpose expects createHandle() to return an object of imperative methods.");
  }

  const methodNames = Object.keys(handle);
  for (const name of methodNames) {
    if (typeof handle[name] !== "function") {
      throw new TypeError(`useExpose only supports imperative methods. Received non-function member "${name}".`);
    }
  }

  if (slot.ref && slot.ref !== ref) {
    cleanupExposedRefSlot(controller, slotIndex, slot);
  }

  slot.ref = ref;
  const target = getExposeRefTarget(controller, ref);

  for (const existingName of slot.methodNames || []) {
    if (!methodNames.includes(existingName)) {
      removeExposedRefMethod(controller, slotIndex, slot, existingName);
    }
  }

  for (const name of methodNames) {
    let entry = target.methods.get(name);

    if (typeof target.handle[name] !== "function") {
      target.handle[name] = function exposedRefMethod(...args) {
        const currentImplementation = target.methods.get(name)?.implementation;
        if (typeof currentImplementation !== "function") {
          return undefined;
        }
        return currentImplementation.apply(this, args);
      };

      entry = {
        owners: new Map(),
        implementation: null,
      };
      target.methods.set(name, entry);
    } else if (!entry) {
      entry = {
        owners: new Map(),
        implementation: null,
      };
      target.methods.set(name, entry);
    }

    entry.owners.set(slotIndex, handle[name]);
    entry.implementation = resolveLatestExposeImplementation(entry.owners);
  }

  slot.methodNames = methodNames;
  assignRef(ref, target.handle);
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
    this.exposeSlots = [];
    this.exposeCursor = 0;
    this.prevExposeCount = 0;
    this.exposeRefSlots = [];
    this.exposeRefCursor = 0;
    this.prevExposeRefCount = 0;
    this.exposeRefTargets = new Map();

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
    this.prevExposeCount = this.exposeCursor;
    this.exposeCursor = 0;
    this.prevExposeRefCount = this.exposeRefCursor;
    this.exposeRefCursor = 0;
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
    this.cleanupUnusedExposedSlots();
    this.cleanupUnusedExposedRefSlots();
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

    for (let index = 0; index < this.exposeRefSlots.length; index += 1) {
      cleanupExposedRefSlot(this, index, this.exposeRefSlots[index]);
    }
    this.exposeRefSlots.length = 0;
    this.exposeRefCursor = 0;
    this.prevExposeRefCount = 0;
    this.exposeRefTargets.clear();

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

  registerExpose(createHandle, deps) {
    const index = this.exposeCursor;
    const slot = this.exposeSlots[index] ||= { methodNames: [] };
    const normalized = normalizeDeps(deps);

    const callback = () => {
      const handle = typeof createHandle === "function" ? createHandle() : createHandle;
      installExposedMethods(this.host, index, slot, handle);
    };

    this.register(callback, normalized, true);
    this.exposeCursor = index + 1;
  }

  registerExposeRef(ref, createHandle, deps) {
    const index = this.exposeRefCursor;
    const slot = this.exposeRefSlots[index] ||= { ref: null, methodNames: [] };
    const normalized = normalizeDeps(deps);

    const callback = () => {
      const handle = typeof createHandle === "function" ? createHandle() : createHandle;
      installExposedRefMethods(this, index, slot, ref, handle);
    };

    this.register(callback, normalized, true);
    this.exposeRefCursor = index + 1;
  }

  cleanupUnusedExposedSlots() {
    if (this.prevExposeCount <= this.exposeCursor) {
      this.prevExposeCount = this.exposeCursor;
      return;
    }

    for (let index = this.exposeCursor; index < this.prevExposeCount; index += 1) {
      cleanupExposedSlot(this.host, index, this.exposeSlots[index]);
    }

    this.exposeSlots.length = this.exposeCursor;
    this.prevExposeCount = this.exposeCursor;
  }

  cleanupUnusedExposedRefSlots() {
    if (this.prevExposeRefCount <= this.exposeRefCursor) {
      this.prevExposeRefCount = this.exposeRefCursor;
      return;
    }

    for (let index = this.exposeRefCursor; index < this.prevExposeRefCount; index += 1) {
      cleanupExposedRefSlot(this, index, this.exposeRefSlots[index]);
    }

    this.exposeRefSlots.length = this.exposeRefCursor;
    this.prevExposeRefCount = this.exposeRefCursor;
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
