import { EffectsController } from "./effects-controller.js";
import { LITSX_SSR_CONTEXT } from "./elements/index.js";
import { SsrEffectsController } from "./ssr-effects-controller.js";

const controllers = new WeakMap();
const ssrControllers = new WeakMap();
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
  currentHookHost = resolvedHost;
  getController(resolvedHost).prepare();
}
