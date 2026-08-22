import { EffectsController } from "./effects-controller.js";
import { LITSX_SSR_CONTEXT } from "./elements/index.js";
import { SsrEffectsController } from "./ssr-effects-controller.js";
import { getCurrentSsrRuntimeState } from "./runtime-ssr-state.js";

const controllers = new WeakMap();
const ssrControllers = new WeakMap();
let currentHookHost = null;

function getCurrentHookHost() {
  return getCurrentSsrRuntimeState()?.hookHost ?? currentHookHost;
}

/** @internal Run synchronous hook work with an explicitly bounded host. */
export function runWithHookHost(host, run) {
  if (!host || typeof host !== "object") {
    throw new TypeError("runWithHookHost() requires a ReactiveControllerHost.");
  }
  if (typeof run !== "function") {
    throw new TypeError("runWithHookHost() requires a callback.");
  }

  const runtimeState = getCurrentSsrRuntimeState();
  const previousHost = runtimeState
    ? runtimeState.hookHost ?? null
    : currentHookHost;

  if (runtimeState) {
    runtimeState.hookHost = host;
  } else {
    currentHookHost = host;
  }

  try {
    return run();
  } finally {
    if (runtimeState) {
      runtimeState.hookHost = previousHost;
    } else {
      currentHookHost = previousHost;
    }
  }
}

export function resolveRuntimeHost(host) {
  if (host && typeof host === "object") {
    return host;
  }

  const activeHost = getCurrentHookHost();
  if (activeHost && typeof activeHost === "object") {
    return activeHost;
  }

  return null;
}

export function getController(host) {
  const resolvedHost = resolveRuntimeHost(host);
  if (!resolvedHost) {
    throw new TypeError(
      "Lit<sup>sx</sup> hooks require an active ReactiveControllerHost during render."
    );
  }

  if (resolvedHost[LITSX_SSR_CONTEXT]) {
    let controller = ssrControllers.get(resolvedHost);
    if (!controller) {
      controller = new SsrEffectsController(
        resolvedHost,
        resolvedHost[LITSX_SSR_CONTEXT],
      );
      ssrControllers.set(resolvedHost, controller);
    } else {
      controller.ssrContext = resolvedHost[LITSX_SSR_CONTEXT];
    }
    return controller;
  }

  let controller = controllers.get(resolvedHost);
  if (!controller) {
    controller = new EffectsController(resolvedHost);
    controllers.set(resolvedHost, controller);
  }
  return controller;
}

export function prepareEffects(host) {
  const resolvedHost = resolveRuntimeHost(host);
  if (!resolvedHost) {
    throw new TypeError(
      "prepareEffects() requires a ReactiveControllerHost."
    );
  }
  getController(resolvedHost).prepare();
}
