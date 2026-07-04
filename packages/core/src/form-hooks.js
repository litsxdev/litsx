import { useEvent } from "./effect-hooks.js";
import { defineHook } from "./host-middleware-runtime.js";

const FORM_INTERNALS = Symbol.for("litsx.formValue.internals");
const FORM_OWNER = Symbol.for("litsx.formValue.owner");

function ensureInternals(host) {
  if (!host || typeof host.attachInternals !== "function") {
    return null;
  }

  if (Object.prototype.hasOwnProperty.call(host, FORM_INTERNALS)) {
    return host[FORM_INTERNALS];
  }

  try {
    const internals = host.attachInternals();
    host[FORM_INTERNALS] = internals ?? null;
    return host[FORM_INTERNALS];
  } catch {
    host[FORM_INTERNALS] = null;
    return null;
  }
}

function syncInternals(internals, value, state = value) {
  if (typeof internals?.setFormValue !== "function") {
    return;
  }

  const nextValue = value === undefined ? null : value;

  try {
    internals.setFormValue(nextValue, state);
  } catch {
    internals.setFormValue(nextValue);
  }
}

function requestHostUpdate(host) {
  host?.requestUpdate?.();
}

export const useFormValue = defineHook({
  setup(host, args, _meta, entry) {
    const existingOwner = host?.[FORM_OWNER];
    if (existingOwner && existingOwner !== entry?.callsiteId) {
      throw new Error(
        "useFormValue can only be called once per component host because form-associated controls expose a single form value interface."
      );
    }

    if (host && typeof host === "object") {
      host[FORM_OWNER] = entry?.callsiteId ?? true;
    }

    const initialValue = args[0];
    const internals = ensureInternals(host);
    syncInternals(internals, initialValue, initialValue);

    return {
      form: null,
      disabled: false,
      value: initialValue,
      defaultValue: initialValue,
      restoreState: null,
      restoreMode: null,
      internals,
    };
  },

  middlewares: {
    formAssociatedCallback(host, state, next, args) {
      const [form] = args;
      if (!Object.is(state.form, form)) {
        state.form = form;
        requestHostUpdate(host);
      }
      return next();
    },

    formDisabledCallback(host, state, next, args) {
      const [disabled] = args;
      if (!Object.is(state.disabled, disabled)) {
        state.disabled = disabled;
        requestHostUpdate(host);
      }
      return next();
    },

    formResetCallback(host, state, next) {
      const valueChanged = !Object.is(state.value, state.defaultValue);
      const restoreChanged = state.restoreState !== null || state.restoreMode !== null;

      state.value = state.defaultValue;
      state.restoreState = null;
      state.restoreMode = null;
      syncInternals(state.internals, state.defaultValue, state.defaultValue);

      if (valueChanged || restoreChanged) {
        requestHostUpdate(host);
      }
      return next();
    },

    formStateRestoreCallback(host, state, next, args) {
      const [restoredState, mode] = args;
      const valueChanged = !Object.is(state.value, restoredState);
      const restoreChanged =
        !Object.is(state.restoreState, restoredState) ||
        state.restoreMode !== mode;

      state.value = restoredState;
      state.restoreState = restoredState;
      state.restoreMode = mode;
      syncInternals(state.internals, restoredState, restoredState);

      if (valueChanged || restoreChanged) {
        requestHostUpdate(host);
      }
      return next();
    },
  },

  use(host, state) {
    const setValue = useEvent(host, (next) => {
      const resolvedValue = typeof next === "function"
        ? next(state.value)
        : next;

      if (Object.is(state.value, resolvedValue)) {
        return resolvedValue;
      }

      state.value = resolvedValue;
      syncInternals(state.internals, resolvedValue, resolvedValue);
      requestHostUpdate(host);
      return resolvedValue;
    });

    const setDefaultValue = useEvent(host, (next) => {
      const resolvedValue = typeof next === "function"
        ? next(state.defaultValue)
        : next;

      if (Object.is(state.defaultValue, resolvedValue)) {
        return resolvedValue;
      }

      state.defaultValue = resolvedValue;
      requestHostUpdate(host);
      return resolvedValue;
    });

    const setFormValue = useEvent(host, (value, restoreState = state.value) => {
      syncInternals(state.internals, value, restoreState);
    });

    return {
      form: state.form,
      disabled: state.disabled,
      value: state.value,
      defaultValue: state.defaultValue,
      restoreState: state.restoreState,
      restoreMode: state.restoreMode,
      setValue,
      setDefaultValue,
      setFormValue,
    };
  },
});
