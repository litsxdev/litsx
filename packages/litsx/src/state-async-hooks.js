import { getController } from "./runtime-controller.js";
import { useEvent } from "./effect-hooks.js";

const INITIAL_ASYNC_STATE = Symbol("litsx.initialAsyncState");

export function useAsyncStateImpl(
  host,
  initialState,
  action,
  useState,
  useTransition,
  useRef
) {
  if (typeof action !== "function") {
    throw new TypeError("useAsyncState expects an action function");
  }

  const [state, setState] = useState(host, initialState);
  const [error, setError] = useState(host, null);
  const [pending, beginTransition] = useTransition(host);
  const initialStateRef = useRef(host, INITIAL_ASYNC_STATE);
  const stateRef = useRef(host, state);
  const latestRunRef = useRef(host, 0);

  if (initialStateRef.current === INITIAL_ASYNC_STATE) {
    initialStateRef.current = state;
  }

  stateRef.current = state;

  const run = useEvent(host, (...args) => {
    const runId = latestRunRef.current + 1;
    latestRunRef.current = runId;
    setError(null);

    let result;
    try {
      result = beginTransition(() => action(stateRef.current, ...args));
    } catch (nextError) {
      if (runId === latestRunRef.current) {
        setError(nextError);
      }
      return Promise.reject(nextError);
    }

    return Promise.resolve(result).then(
      (nextState) => {
        if (runId === latestRunRef.current) {
          stateRef.current = nextState;
          setError(null);
          setState(nextState);
        }
        return nextState;
      },
      (nextError) => {
        if (runId === latestRunRef.current) {
          setError(nextError);
        }
        return Promise.reject(nextError);
      }
    );
  });

  const reset = useEvent(host, () => {
    latestRunRef.current += 1;
    stateRef.current = initialStateRef.current;
    setError(null);
    setState(initialStateRef.current);
  });

  return [state, run, { pending, error, reset }];
}

export function useOptimisticImpl(host, state, updateFn, useRef, useState) {
  const reducer = typeof updateFn === "function"
    ? updateFn
    : (_currentState, optimisticValue) => optimisticValue;
  const baseStateRef = useRef(host, state);
  const queueRef = useRef(host, []);
  const [, forceRender] = useState(host, 0);

  if (!Object.is(baseStateRef.current, state)) {
    baseStateRef.current = state;
    queueRef.current = [];
  }

  const addOptimistic = useEvent(host, (optimisticValue) => {
    queueRef.current = [...queueRef.current, optimisticValue];
    forceRender((version) => version + 1);
  });

  const resetOptimistic = useEvent(host, () => {
    if (queueRef.current.length === 0) {
      return;
    }
    queueRef.current = [];
    forceRender((version) => version + 1);
  });

  const optimisticState = queueRef.current.reduce(
    (currentState, optimisticValue) => reducer(currentState, optimisticValue),
    state
  );

  return [optimisticState, addOptimistic, resetOptimistic];
}

export function useTransitionImpl(host) {
  return getController(host).resolveTransition();
}

export function startTransitionImpl(host, callback) {
  return getController(host).startTransition(callback);
}

export function useDeferredValueImpl(host, value, options) {
  const slot = getController(host).resolveDeferredValue(value, options);
  return slot.pending ? slot.current : slot.source;
}
