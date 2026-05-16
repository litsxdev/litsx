const SSR_CUSTOM_ELEMENT_INSTANCE_STACK = Symbol.for(
  "litsx.ssr.customElementInstanceStack",
);

function getStackStore() {
  globalThis[SSR_CUSTOM_ELEMENT_INSTANCE_STACK] ??= [];
  return globalThis[SSR_CUSTOM_ELEMENT_INSTANCE_STACK];
}

export async function withCurrentSsrCustomElementInstanceStack(stack, run) {
  const stackStore = getStackStore();
  stackStore.push(stack);
  try {
    return await run();
  } finally {
    stackStore.pop();
  }
}
