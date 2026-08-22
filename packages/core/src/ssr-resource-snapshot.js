import { getCurrentSsrRuntimeState } from "./runtime-ssr-state.js";

const SSR_RESOURCE_SNAPSHOT_BRIDGE = Symbol.for(
  "litsx.ssr.resourceSnapshotBridge",
);

function assertOptions(options) {
  if (!options || typeof options !== "object" || Array.isArray(options)) {
    throw new TypeError("useSsrResourceSnapshot(...) requires an options object.");
  }
  if (typeof options.key !== "string" || options.key.length === 0) {
    throw new TypeError("useSsrResourceSnapshot(...) requires a non-empty string key.");
  }
  if (typeof options.capture !== "function") {
    throw new TypeError("useSsrResourceSnapshot(...) requires a capture function.");
  }
  if (typeof options.restore !== "function") {
    throw new TypeError("useSsrResourceSnapshot(...) requires a restore function.");
  }
}

/**
 * Register a request-scoped SSR resource snapshot or synchronously restore the
 * corresponding snapshot during client hydration.
 *
 * Library runtimes call this from their own hooks. Applications do not need to
 * install an adapter or add bootstrap code.
 */
export function useSsrResourceSnapshot(options) {
  assertOptions(options);

  const ssrRegistry = getCurrentSsrRuntimeState()?.resourceSnapshotRegistry;
  if (ssrRegistry && typeof ssrRegistry.register === "function") {
    ssrRegistry.register(options.key, options.capture);
    return;
  }

  const clientBridge = globalThis[SSR_RESOURCE_SNAPSHOT_BRIDGE];
  if (clientBridge && typeof clientBridge.restore === "function") {
    clientBridge.restore(options.key, options.restore);
  }
}
