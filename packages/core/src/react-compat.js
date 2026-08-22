import { useRef } from "./state-hooks.js";
import { createRef } from "lit/directives/ref.js";

const CALLBACK_REFS = new WeakMap();
const ADAPTED_CALLBACK_REFS = new WeakSet();
const OBJECT_REFS = new WeakMap();
const REACT_REF_VIEWS = new WeakMap();
const EMPTY_REF = () => {};

function createReactRefView(litRef, initialValue) {
  let current = initialValue;
  return {
    get value() {
      return litRef.value;
    },
    set value(value) {
      litRef.value = value;
      current = value === undefined ? null : value;
    },
    get current() {
      return current;
    },
    set current(value) {
      current = value;
      litRef.value = value === null ? undefined : value;
    },
  };
}

/** Create a Lit ref whose public mutable view follows React's `.current` contract. */
export function useReactRef(initialValue) {
  const litRef = useRef(initialValue === null ? undefined : initialValue);
  let view = REACT_REF_VIEWS.get(litRef);
  if (!view) {
    view = createReactRefView(litRef, initialValue);
    REACT_REF_VIEWS.set(litRef, view);
  }
  return view;
}

/** Create a standalone Lit ref with React's `.current` facade. */
export function createReactRef() {
  return createReactRefView(createRef(), null);
}

/** Adapt any React callback/object ref to the RefOrCallback shape consumed by Lit. */
export function toLitRef(value) {
  if (typeof value === "function") {
    if (ADAPTED_CALLBACK_REFS.has(value)) return value;
    let callback = CALLBACK_REFS.get(value);
    if (!callback) {
      const cleanups = new WeakMap();
      callback = function (node) {
        const context = this && (typeof this === "object" || typeof this === "function")
          ? this
          : globalThis;
        if (node === undefined) {
          const cleanup = cleanups.get(context);
          if (cleanup) {
            cleanups.delete(context);
            cleanup();
          } else {
            value(null);
          }
          return;
        }
        const cleanup = value(node);
        if (typeof cleanup === "function") cleanups.set(context, cleanup);
        else cleanups.delete(context);
      };
      ADAPTED_CALLBACK_REFS.add(callback);
      CALLBACK_REFS.set(value, callback);
    }
    return callback;
  }

  if (value && typeof value === "object") {
    if ("value" in value) return value;
    if ("current" in value) {
      let ref = OBJECT_REFS.get(value);
      if (!ref) {
        ref = {
          get value() {
            return value.current === null ? undefined : value.current;
          },
          set value(node) {
            value.current = node === undefined ? null : node;
          },
        };
        OBJECT_REFS.set(value, ref);
      }
      return ref;
    }
  }

  return EMPTY_REF;
}
