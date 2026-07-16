const SSR_RUNTIME_STATE_ACCESS = Symbol.for("litsx.ssr.runtimeStateAccess");
const SSR_RUNTIME_STATE_STACK = Symbol.for("litsx.ssr.runtimeStateStack");

function getRuntimeStateAccess() {
  const access = globalThis[SSR_RUNTIME_STATE_ACCESS];
  if (
    !access ||
    typeof access.getStore !== "function" ||
    typeof access.run !== "function"
  ) {
    return null;
  }

  return access;
}

function getRuntimeStateStack() {
  globalThis[SSR_RUNTIME_STATE_STACK] ??= [];
  return globalThis[SSR_RUNTIME_STATE_STACK];
}

export function getCurrentSsrRuntimeState() {
  const access = getRuntimeStateAccess();
  if (access) {
    return access.getStore() ?? null;
  }

  return getRuntimeStateStack().at(-1) ?? null;
}

export async function withCurrentSsrRuntimeState(state, run) {
  const access = getRuntimeStateAccess();
  if (access) {
    return access.run(state ?? null, run);
  }

  const stack = getRuntimeStateStack();
  stack.push(state ?? null);
  try {
    return await run();
  } finally {
    stack.pop();
  }
}

export function getCurrentSsrCustomElementInstanceStack() {
  return getCurrentSsrRuntimeState()?.customElementInstanceStack ?? null;
}

export function getCurrentExecutionContextInternal() {
  return getCurrentSsrRuntimeState()?.executionContext ?? null;
}
