import {
  resolveCallback,
  resolveEvent,
  resolveMemo,
  resolveMutableRef,
  resolvePrevious,
  resolveReducer,
} from "./runtime-slot-resolvers.js";

export class SsrEffectsController {
  constructor(host, ssrContext) {
    this.host = host;
    this.ssrContext = ssrContext;

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
  }

  prepare() {
    this.memoCursor = 0;
    this.callbackCursor = 0;
    this.eventCursor = 0;
    this.previousCursor = 0;
    this.reducerCursor = 0;
    this.mutableRefCursor = 0;
    this.idCursor = 0;
  }

  register() {}

  registerConnected() {}

  registerImperative() {}

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

  resolveReducer(reducer, initialArg, init) {
    const [state] = resolveReducer(this, reducer, initialArg, init);
    return [state, () => state];
  }

  resolveMutableRef(initialValue) {
    return resolveMutableRef(this, initialValue);
  }

  resolveId() {
    const instanceId = this.ssrContext?.currentInstanceId ?? "0";
    const nextId = `${this.ssrContext?.idPrefix ?? "litsx"}-${instanceId}-${this.idCursor}`;
    this.idCursor += 1;
    return nextId;
  }

  resolveExternalStore(_subscribe, getSnapshot, getServerSnapshot) {
    if (typeof getServerSnapshot === "function") {
      return getServerSnapshot();
    }

    return getSnapshot();
  }

  resolveTransition() {
    return [false, (callback) => callback?.()];
  }

  startTransition(callback) {
    return callback?.();
  }

  resolveDeferredValue(value) {
    return {
      current: value,
      source: value,
      pending: false,
    };
  }
}
