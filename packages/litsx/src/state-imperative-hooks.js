import { getController } from "./runtime-controller.js";

export function useRefImpl(host, initialValue) {
  return getController(host).resolveMutableRef(initialValue);
}

export function useIdImpl(host) {
  return getController(host).resolveId();
}

export function useCallbackRefImpl(host, getTarget, callback, deps) {
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

export function useExposeImpl(host, ref, createHandle, deps) {
  getController(host).registerImperative(ref, createHandle, deps);
}

export function useExternalStoreImpl(host, subscribe, getSnapshot, getServerSnapshot) {
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
