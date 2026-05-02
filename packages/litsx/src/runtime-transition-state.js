function isThenable(value) {
  return (
    value != null &&
    (typeof value === "object" || typeof value === "function") &&
    typeof value.then === "function"
  );
}

export function createTransitionState(controller) {
  const state = {
    controller,
    isPending: false,
    pendingCount: 0,
    pendingTokens: new Set(),
    lastToken: 0,
    startTransition: null,
  };

  state.startTransition = (callback) => {
    if (typeof callback !== "function") {
      throw new TypeError("startTransition expects a function");
    }

    const token = ++state.lastToken;
    state.pendingTokens.add(token);
    state.pendingCount = state.pendingTokens.size;
    state.isPending = true;
    controller.host?.requestUpdate?.();

    let finalized = false;
    const finish = () => {
      if (finalized) return;
      finalized = true;
      if (!state.pendingTokens.delete(token)) {
        return;
      }
      state.pendingCount = state.pendingTokens.size;
      if (state.pendingCount === 0) {
        state.isPending = false;
        controller.host?.requestUpdate?.();
      }
    };

    let result;
    try {
      result = callback();
    } catch (error) {
      finish();
      throw error;
    }

    if (isThenable(result)) {
      Promise.resolve(result).then(finish, finish);
    } else {
      queueMicrotask(finish);
    }

    return result;
  };

  return state;
}

export function resetTransitionState(state) {
  if (!state) return;
  state.isPending = false;
  state.pendingCount = 0;
  state.pendingTokens?.clear();
}
