import { AsyncLocalStorage } from "node:async_hooks";

const SSR_RUNTIME_STATE_ACCESS = Symbol.for("litsx.ssr.runtimeStateAccess");
const SSR_CONSOLE_CAPTURE_INSTALLED = Symbol.for("litsx.ssr.consoleCaptureInstalled");

const CAPTURED_CONSOLE_METHODS = ["log", "info", "debug", "warn", "error", "trace"];

function createRuntimeStateAccess() {
  const storage = new AsyncLocalStorage();

  return {
    getStore() {
      return storage.getStore() ?? null;
    },
    run(state, run) {
      return storage.run(state ?? null, run);
    },
  };
}

function getRuntimeStateAccess() {
  globalThis[SSR_RUNTIME_STATE_ACCESS] ??= createRuntimeStateAccess();
  return globalThis[SSR_RUNTIME_STATE_ACCESS];
}

function installSsrConsoleCapture() {
  if (globalThis[SSR_CONSOLE_CAPTURE_INSTALLED]) {
    return;
  }

  globalThis[SSR_CONSOLE_CAPTURE_INSTALLED] = true;
  for (const method of CAPTURED_CONSOLE_METHODS) {
    const original = console[method];
    if (typeof original !== "function") {
      continue;
    }

    console[method] = function capturedSsrConsoleMethod(...args) {
      const capture = getCurrentSsrRuntimeState()?.consoleCapture;
      if (capture) {
        capture.push({ method, args });
      }

      return original.apply(this, args);
    };
  }
}

export function getCurrentSsrRuntimeState() {
  return getRuntimeStateAccess().getStore() ?? null;
}

export function withCurrentSsrRuntimeState(patch, run) {
  const currentState = getCurrentSsrRuntimeState();
  return getRuntimeStateAccess().run(
    {
      ...(currentState ?? {}),
      ...(patch ?? {}),
    },
    run,
  );
}

/**
 * Collect console calls performed by the current asynchronous SSR operation.
 * Calls still go to Node's original console; this only adds request-scoped
 * diagnostics for development tooling.
 */
export async function captureCurrentSsrConsole(run, messages = []) {
  installSsrConsoleCapture();
  const result = await withCurrentSsrRuntimeState(
    { consoleCapture: messages },
    run,
  );
  return { result, messages };
}

export function withCurrentSsrCustomElementInstanceStack(stack, run) {
  return withCurrentSsrRuntimeState(
    { customElementInstanceStack: stack ?? null },
    run,
  );
}
