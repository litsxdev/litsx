import { EffectsController } from "./effects-controller.js";
import { LITSX_SSR_CONTEXT } from "./elements/index.js";

const controllers = new WeakMap();
const ssrControllers = new WeakMap();
let currentHookHost = null;
let createSsrEffectsController = null;

export function registerSsrEffectsController(factory) {
  createSsrEffectsController = typeof factory === "function" ? factory : null;
}

export function resolveRuntimeHost(host) {
  if (host && typeof host === "object") {
    return host;
  }

  if (currentHookHost && typeof currentHookHost === "object") {
    return currentHookHost;
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
    if (!createSsrEffectsController) {
      throw new Error(
        "LitSX SSR hooks require the @litsx/ssr runtime to register an SSR effects controller."
      );
    }

    let controller = ssrControllers.get(resolvedHost);
    if (!controller) {
      controller = createSsrEffectsController(
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
  currentHookHost = resolvedHost;
  getController(resolvedHost).prepare();
}
