import { EffectsController } from "./effects-controller.js";

const controllers = new WeakMap();
let currentHookHost = null;

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
