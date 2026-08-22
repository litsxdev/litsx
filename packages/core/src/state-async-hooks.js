import { getController } from "./runtime-controller.js";
import { useEvent } from "./effect-hooks.js";

const INITIAL_ASYNC_STATE = Symbol("litsx.initialAsyncState");

export function useAsyncStateImpl(
  initialState,
  action,
  useState,
  useTransition,
  useRef
) {
  if (typeof action !== "function") {
    throw new TypeError("useAsyncState expects an action function");
  }

  const [state, setState] = useState(initialState);
  const [error, setError] = useState(null);
  const [pending, beginTransition] = useTransition();
  const initialStateRef = useRef(INITIAL_ASYNC_STATE);
  const stateRef = useRef(state);
  const latestRunRef = useRef(0);

  if (initialStateRef.value === INITIAL_ASYNC_STATE) {
    initialStateRef.value = state;
  }

  stateRef.value = state;

  const run = useEvent((...args) => {
    const runId = latestRunRef.value + 1;
    latestRunRef.value = runId;
    setError(null);

    let result;
    try {
      result = beginTransition(() => action(stateRef.value, ...args));
    } catch (nextError) {
      if (runId === latestRunRef.value) {
        setError(nextError);
      }
      return Promise.reject(nextError);
    }

    return Promise.resolve(result).then(
      (nextState) => {
        if (runId === latestRunRef.value) {
          stateRef.value = nextState;
          setError(null);
          setState(nextState);
        }
        return nextState;
      },
      (nextError) => {
        if (runId === latestRunRef.value) {
          setError(nextError);
        }
        return Promise.reject(nextError);
      }
    );
  });

  const reset = useEvent(() => {
    latestRunRef.value += 1;
    stateRef.value = initialStateRef.value;
    setError(null);
    setState(initialStateRef.value);
  });

  return [state, run, { pending, error, reset }];
}

export function useOptimisticImpl(state, updateFn, useRef, useState) {
  const reducer = typeof updateFn === "function"
    ? updateFn
    : (_currentState, optimisticValue) => optimisticValue;
  const baseStateRef = useRef(state);
  const queueRef = useRef([]);
  const [, forceRender] = useState(0);

  if (!Object.is(baseStateRef.value, state)) {
    baseStateRef.value = state;
    queueRef.value = [];
  }

  const addOptimistic = useEvent((optimisticValue) => {
    queueRef.value = [...queueRef.value, optimisticValue];
    forceRender((version) => version + 1);
  });

  const resetOptimistic = useEvent(() => {
    if (queueRef.value.length === 0) {
      return;
    }
    queueRef.value = [];
    forceRender((version) => version + 1);
  });

  const optimisticState = queueRef.value.reduce(
    (currentState, optimisticValue) => reducer(currentState, optimisticValue),
    state
  );

  return [optimisticState, addOptimistic, resetOptimistic];
}

export function useTransitionImpl() {
  return getController().resolveTransition();
}

export function startTransitionImpl(callback) {
  return getController().startTransition(callback);
}

export function useDeferredValueImpl(value, options) {
  const slot = getController().resolveDeferredValue(value, options);
  return slot.pending ? slot.current : slot.source;
}
