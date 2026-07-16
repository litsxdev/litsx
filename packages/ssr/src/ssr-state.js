import { AsyncLocalStorage } from "node:async_hooks";

const SSR_RUNTIME_STATE_ACCESS = Symbol.for("litsx.ssr.runtimeStateAccess");

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

function getCurrentSsrRuntimeState() {
  return getRuntimeStateAccess().getStore() ?? null;
}

export async function withCurrentSsrRuntimeState(patch, run) {
  const currentState = getCurrentSsrRuntimeState();
  return getRuntimeStateAccess().run(
    {
      ...(currentState ?? {}),
      ...(patch ?? {}),
    },
    run,
  );
}

export async function withCurrentSsrCustomElementInstanceStack(stack, run) {
  return withCurrentSsrRuntimeState(
    { customElementInstanceStack: stack ?? null },
    run,
  );
}
