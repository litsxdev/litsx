import { getController } from "./runtime-controller.js";

function isExposeMethodSurface(handle) {
  if (handle === null || typeof handle !== "object") {
    throw new TypeError("useExpose expects createHandle() to return an object of imperative methods.");
  }

  for (const [name, value] of Object.entries(handle)) {
    if (typeof value !== "function") {
      throw new TypeError(`useExpose only supports imperative methods. Received non-function member "${name}".`);
    }
  }

  return handle;
}

export function useRefImpl(host, initialValue) {
  return getController(host).resolveMutableRef(initialValue);
}

export function useIdImpl(host) {
  return getController(host).resolveId();
}

export function useStableIdImpl(_host, callsiteId) {
  if (typeof callsiteId === "string" && callsiteId.length > 0) {
    return callsiteId;
  }

  return "litsx-stable-untransformed";
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

export function useExposeImpl(host, refOrCreateHandle, maybeCreateHandle, maybeDeps) {
  if (typeof maybeCreateHandle === "function") {
    getController(host).registerExposeRef(
      refOrCreateHandle,
      () => isExposeMethodSurface(maybeCreateHandle()),
      maybeDeps
    );
    return;
  }

  getController(host).registerExpose(
    () => isExposeMethodSurface(refOrCreateHandle()),
    maybeCreateHandle
  );
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
