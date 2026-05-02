const HOST_ADOPTED_CONTROLLERS = Symbol("litsx.adoptedControllers");
const HOST_ADOPTED_WRAPPED = Symbol("litsx.adoptedWrapped");

export function ensureAdoptedControllerHook(host) {
  if (!host || typeof host !== "object") {
    return;
  }

  if (!host[HOST_ADOPTED_CONTROLLERS]) {
    host[HOST_ADOPTED_CONTROLLERS] = new Set();
  }

  if (host[HOST_ADOPTED_WRAPPED]) {
    return;
  }

  const originalAdoptedCallback = host.adoptedCallback;

  host.adoptedCallback = function adoptedCallback(...args) {
    if (typeof originalAdoptedCallback === "function") {
      originalAdoptedCallback.apply(this, args);
    }

    const controllers = this[HOST_ADOPTED_CONTROLLERS];
    if (!controllers) {
      return;
    }

    for (const controller of controllers) {
      if (controller && typeof controller.hostAdopted === "function") {
        controller.hostAdopted(...args);
      }
    }
  };

  host[HOST_ADOPTED_WRAPPED] = true;
}

export function addAdoptedController(host, controller) {
  ensureAdoptedControllerHook(host);
  host[HOST_ADOPTED_CONTROLLERS].add(controller);
}
