import { nothing } from "lit";
import { getCurrentSsrRuntimeState } from "./runtime-ssr-state.js";

const SOFT_SUSPENSE = Symbol("litsx.softSuspense");
const SUSPENSE_CAPTURE = Symbol("litsx.suspenseCapture");
let currentSoftSuspenseCollector = null;
let currentSuspenseCapture = null;

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

export function withSuspenseCapture(capture, render) {
  const runtimeState = getCurrentSsrRuntimeState();
  const previousCapture = runtimeState
    ? runtimeState.suspenseCapture ?? null
    : currentSuspenseCapture;
  if (runtimeState) {
    runtimeState.suspenseCapture = capture ?? null;
  } else {
    currentSuspenseCapture = capture ?? null;
  }
  try {
    return render();
  } finally {
    if (runtimeState) {
      runtimeState.suspenseCapture = previousCapture;
    } else {
      currentSuspenseCapture = previousCapture;
    }
  }
}

export function getCurrentSuspenseCapture() {
  return getCurrentSsrRuntimeState()?.suspenseCapture ?? currentSuspenseCapture;
}

export function setHostSuspenseCapture(host, capture) {
  if (!host || (typeof host !== "object" && typeof host !== "function")) {
    return;
  }

  if (capture == null) {
    try {
      delete host[SUSPENSE_CAPTURE];
    } catch {
      // Some host-like objects may reject deletes; leave them untouched.
    }
    return;
  }

  Object.defineProperty(host, SUSPENSE_CAPTURE, {
    value: capture,
    configurable: true,
  });
}

function getHostSuspenseCapture(host) {
  return host?.[SUSPENSE_CAPTURE] ?? null;
}

export function collectSoftSuspenseThenables(collector, render) {
  // SSR renderers wrap each render pass with this collector so rootless
  // suspensions are awaitable instead of being serialized as empty output.
  const runtimeState = getCurrentSsrRuntimeState();
  const previousCollector = runtimeState
    ? runtimeState.softSuspenseCollector ?? null
    : currentSoftSuspenseCollector;
  if (runtimeState) {
    runtimeState.softSuspenseCollector = collector;
  } else {
    currentSoftSuspenseCollector = collector;
  }
  const restoreCollector = () => {
    if (runtimeState) {
      runtimeState.softSuspenseCollector = previousCollector;
    } else {
      currentSoftSuspenseCollector = previousCollector;
    }
  };
  let result;
  try {
    result = render();
  } catch (error) {
    restoreCollector();
    throw error;
  }

  if (isThenable(result)) {
    return Promise.resolve(result).finally(restoreCollector);
  }

  restoreCollector();
  return result;
}

export function collectSuspenseThenable(thenable) {
  const collector =
    getCurrentSsrRuntimeState()?.softSuspenseCollector ??
    currentSoftSuspenseCollector;
  if (!collector || !isThenable(thenable)) {
    return null;
  }

  const promise = Promise.resolve(thenable);
  collector.add(promise);
  return promise;
}

export function renderWithSoftSuspense(host, render) {
  try {
    return render();
  } catch (thrown) {
    if (!isThenable(thrown)) {
      throw thrown;
    }

    const capture = getCurrentSuspenseCapture() ?? getHostSuspenseCapture(host);
    if (capture && typeof capture.capture === "function") {
      capture.capture(thrown);
      return nothing;
    }

    const state = getSoftSuspenseState(host);
    const promise = collectSuspenseThenable(thrown) ?? Promise.resolve(thrown);

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
