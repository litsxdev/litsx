import { nothing } from "lit";

const SOFT_SUSPENSE = Symbol("litsx.softSuspense");
let currentSoftSuspenseCollector = null;

function isThenable(value) {
  return (
    value != null &&
    (typeof value === "object" || typeof value === "function") &&
    typeof value.then === "function"
  );
}

function reportAsyncError(error) {
  queueMicrotask(() => {
    throw error;
  });
}

function hasSuspenseBoundary(host) {
  if (!host || typeof host.closest !== "function") {
    return false;
  }

  try {
    return Boolean(host.closest("suspense-boundary"));
  } catch {
    return false;
  }
}

function getSoftSuspenseState(host) {
  if (!host[SOFT_SUSPENSE]) {
    Object.defineProperty(host, SOFT_SUSPENSE, {
      value: {
        pendingThenable: null,
        version: 0,
      },
      configurable: true,
    });
  }
  return host[SOFT_SUSPENSE];
}

export function collectSoftSuspenseThenables(collector, render) {
  // SSR renderers wrap each render pass with this collector so rootless
  // suspensions are awaitable instead of being serialized as empty output.
  const previousCollector = currentSoftSuspenseCollector;
  currentSoftSuspenseCollector = collector;
  let result;
  try {
    result = render();
  } catch (error) {
    currentSoftSuspenseCollector = previousCollector;
    throw error;
  }

  if (isThenable(result)) {
    return Promise.resolve(result).finally(() => {
      currentSoftSuspenseCollector = previousCollector;
    });
  }

  currentSoftSuspenseCollector = previousCollector;
  return result;
}

export function renderWithSoftSuspense(host, render) {
  try {
    return render();
  } catch (thrown) {
    if (!isThenable(thrown) || hasSuspenseBoundary(host)) {
      throw thrown;
    }

    const state = getSoftSuspenseState(host);
    const promise = Promise.resolve(thrown);

    if (currentSoftSuspenseCollector) {
      currentSoftSuspenseCollector.add(promise);
    }

    if (state.pendingThenable === thrown) {
      return nothing;
    }

    const version = state.version + 1;
    state.version = version;
    state.pendingThenable = thrown;
    state.pendingPromise = promise;
    promise.then(
      () => {
        if (state.version !== version) {
          return;
        }
        state.pendingThenable = null;
        state.pendingPromise = null;
        host?.requestUpdate?.();
      },
      (error) => {
        if (state.version !== version) {
          return;
        }
        state.pendingThenable = null;
        state.pendingPromise = null;
        host?.requestUpdate?.();
        reportAsyncError(error);
      }
    );

    return nothing;
  }
}
