import { createStableId } from "./runtime-ids.js";
import { haveDepsChanged, normalizeDeps } from "./runtime-deps.js";

export function resolveMemo(controller, factory, deps) {
  const index = controller.memoCursor;
  const normalized = normalizeDeps(deps);
  let slot = controller.memos[index];

  if (!slot) {
    slot = controller.memos[index] = {
      deps: normalized,
      value: factory(),
    };
  } else {
    const shouldCompare = Array.isArray(normalized);
    const depsChanged = shouldCompare ? haveDepsChanged(slot.deps, normalized) : true;
    if (depsChanged) {
      slot.value = factory();
    }
    slot.deps = normalized;
  }

  controller.memoCursor = index + 1;
  return slot.value;
}

export function resolveCallback(controller, callback, deps) {
  const index = controller.callbackCursor;
  const normalized = normalizeDeps(deps);
  let slot = controller.callbacks[index];

  if (!slot) {
    slot = controller.callbacks[index] = {
      deps: normalized,
      value: callback,
    };
  } else {
    const shouldCompare = Array.isArray(normalized);
    const depsChanged = shouldCompare ? haveDepsChanged(slot.deps, normalized) : true;
    if (depsChanged) {
      slot.value = callback;
    }
    slot.deps = normalized;
  }

  controller.callbackCursor = index + 1;
  return slot.value;
}

export function resolveEvent(controller, callback) {
  const index = controller.eventCursor;
  let slot = controller.events[index];

  if (!slot) {
    slot = controller.events[index] = {
      callback,
      value: function stableEventCallback(...args) {
        return slot.callback.apply(this, args);
      },
    };
  } else {
    slot.callback = callback;
  }

  controller.eventCursor = index + 1;
  return slot.value;
}

export function resolvePrevious(controller, value, initialValue) {
  const index = controller.previousCursor;
  let slot = controller.previousValues[index];

  if (!slot) {
    slot = controller.previousValues[index] = { value };
    controller.previousCursor = index + 1;
    return initialValue;
  }

  const previousValue = slot.value;
  slot.value = value;
  controller.previousCursor = index + 1;
  return previousValue;
}

export function resolveReducer(controller, reducer, initialArg, init) {
  const index = controller.reducerCursor;
  let slot = controller.reducers[index];

  if (!slot) {
    const initialState = typeof init === "function" ? init(initialArg) : initialArg;

    slot = {
      state: initialState,
      reducer,
      dispatch: null,
    };

    slot.dispatch = (action) => {
      const prevState = slot.state;
      const nextState = slot.reducer(slot.state, action);
      if (!Object.is(prevState, nextState)) {
        slot.state = nextState;
        controller.host.requestUpdate?.();
      }
      return slot.state;
    };

    controller.reducers[index] = slot;
  }

  slot.reducer = reducer;
  controller.reducerCursor = index + 1;
  return [slot.state, slot.dispatch];
}

export function resolveMutableRef(controller, initialValue) {
  const index = controller.mutableRefCursor;
  let slot = controller.mutableRefs[index];

  if (!slot) {
    slot = controller.mutableRefs[index] = {
      ref: { current: initialValue },
    };
  }

  controller.mutableRefCursor = index + 1;
  return slot.ref;
}

export function resolveId(controller) {
  const index = controller.idCursor;
  let slot = controller.ids[index];

  if (!slot) {
    slot = controller.ids[index] = {
      value: createStableId(),
    };
  }

  controller.idCursor = index + 1;
  return slot.value;
}
