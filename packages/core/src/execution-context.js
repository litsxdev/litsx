import { getCurrentExecutionContextInternal } from "./runtime-ssr-state.js";

const EXECUTION_CONTEXT_KEY_DESCRIPTION = Symbol("litsx.executionContextKey.description");

export function createExecutionContextKey(description) {
  const key = {};

  if (description !== undefined) {
    Object.defineProperty(key, EXECUTION_CONTEXT_KEY_DESCRIPTION, {
      value: String(description),
      configurable: false,
      enumerable: false,
      writable: false,
    });
  }

  return Object.freeze(key);
}

export function getCurrentExecutionContext() {
  return getCurrentExecutionContextInternal();
}
