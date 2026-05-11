const customElementInstanceStackStack = [];

export function getCurrentSsrCustomElementInstanceStack() {
  return customElementInstanceStackStack.at(-1) ?? null;
}

export async function withCurrentSsrCustomElementInstanceStack(stack, run) {
  customElementInstanceStackStack.push(stack);
  try {
    return await run();
  } finally {
    customElementInstanceStackStack.pop();
  }
}
