const lazyElementCache = new WeakMap();

function getElementRegistry(host) {
  if (!host || typeof host !== "object") {
    return null;
  }
  const registry = host.registry;
  if (
    !registry ||
    typeof registry.define !== "function" ||
    typeof registry.get !== "function"
  ) {
    return null;
  }
  return registry;
}

function isCustomElementConstructor(value) {
  if (typeof value !== "function") {
    return false;
  }

  const HTMLElementCtor = globalThis.HTMLElement;
  if (typeof HTMLElementCtor === "function") {
    return value === HTMLElementCtor || value.prototype instanceof HTMLElementCtor;
  }

  return /^class\s/.test(Function.prototype.toString.call(value));
}

function defineScopedElement(registry, tag, ctor) {
  if (!registry || !tag || !ctor) {
    return ctor ?? null;
  }

  const existing = registry.get(tag);
  if (existing) {
    return existing;
  }

  registry.define(tag, ctor);
  return ctor;
}

function resolveLazyLoaderResult(registry, tag, result) {
  if (result == null) {
    return null;
  }

  if (!isCustomElementConstructor(result)) {
    throw new TypeError(
      `ensureLazyElement expected "${tag}" to resolve to a custom element constructor.`
    );
  }

  return defineScopedElement(registry, tag, result);
}

export function ensureLazyElement(host, tag, value) {
  if (typeof tag !== "string" || tag.length === 0) {
    throw new TypeError("ensureLazyElement requires a non-empty tag name.");
  }

  const registry = getElementRegistry(host);
  if (!registry) {
    return null;
  }

  const existing = registry.get(tag);
  if (existing) {
    return existing;
  }

  if (value == null) {
    return null;
  }

  if (isCustomElementConstructor(value)) {
    return defineScopedElement(registry, tag, value);
  }

  if (typeof value !== "function") {
    throw new TypeError(
      `ensureLazyElement expected "${tag}" to receive a loader, constructor, or nullish value.`
    );
  }

  let entry = lazyElementCache.get(value);
  if (!entry) {
    entry = {
      status: "fresh",
      result: null,
      error: null,
    };
    lazyElementCache.set(value, entry);
  }

  if (entry.status === "resolved") {
    return resolveLazyLoaderResult(registry, tag, entry.result);
  }

  if (entry.status === "rejected") {
    throw entry.error;
  }

  if (entry.status === "pending") {
    return null;
  }

  entry.status = "pending";
  Promise.resolve()
    .then(() => value())
    .then((result) => {
      entry.status = "resolved";
      entry.result = result;
      resolveLazyLoaderResult(registry, tag, result);
      host?.requestUpdate?.();
      return result;
    })
    .catch((error) => {
      entry.status = "rejected";
      entry.error = error;
      host?.requestUpdate?.();
      throw error;
    });

  return null;
}
