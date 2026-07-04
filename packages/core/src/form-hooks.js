import { useEvent } from "./effect-hooks.js";
import { defineHook } from "./host-middleware-runtime.js";

const FACE_INTERNALS = Symbol.for("litsx.face.internals");
const FACE_SHARED_STATE = Symbol.for("litsx.face.sharedState");
const FORM_VALUE_OWNER = Symbol.for("litsx.formValue.owner");
const VALIDITY_FIELDS = [
  "badInput",
  "customError",
  "patternMismatch",
  "rangeOverflow",
  "rangeUnderflow",
  "stepMismatch",
  "tooLong",
  "tooShort",
  "typeMismatch",
  "valid",
  "valueMissing",
];
const DEFAULT_VALIDITY = Object.freeze({
  badInput: false,
  customError: false,
  patternMismatch: false,
  rangeOverflow: false,
  rangeUnderflow: false,
  stepMismatch: false,
  tooLong: false,
  tooShort: false,
  typeMismatch: false,
  valid: true,
  valueMissing: false,
});

function isObject(value) {
  return value !== null && typeof value === "object";
}

function ensureInternals(host) {
  if (!host || typeof host.attachInternals !== "function") {
    return null;
  }

  if (Object.prototype.hasOwnProperty.call(host, FACE_INTERNALS)) {
    return host[FACE_INTERNALS];
  }

  try {
    const internals = host.attachInternals();
    host[FACE_INTERNALS] = internals ?? null;
    return host[FACE_INTERNALS];
  } catch {
    host[FACE_INTERNALS] = null;
    return null;
  }
}

function cloneValiditySnapshot(validity) {
  const snapshot = { ...DEFAULT_VALIDITY };
  if (!isObject(validity)) {
    return snapshot;
  }
  for (const field of VALIDITY_FIELDS) {
    if (field === "valid") {
      snapshot.valid = validity.valid !== false;
      continue;
    }
    snapshot[field] = validity[field] === true;
  }
  return snapshot;
}

function sameValiditySnapshot(left, right) {
  return VALIDITY_FIELDS.every((field) => left?.[field] === right?.[field]);
}

function readValidationMessage(internals) {
  return typeof internals?.validationMessage === "string"
    ? internals.validationMessage
    : "";
}

function readWillValidate(internals) {
  return internals?.willValidate === true;
}

function createSharedFaceState(host) {
  const internals = ensureInternals(host);
  return {
    supported: internals !== null,
    internals,
    form: null,
    disabled: false,
    validity: cloneValiditySnapshot(internals?.validity),
    validationMessage: readValidationMessage(internals),
    willValidate: readWillValidate(internals),
  };
}

function getOrCreateFaceState(host) {
  if (!isObject(host)) {
    return createSharedFaceState(host);
  }

  if (!Object.prototype.hasOwnProperty.call(host, FACE_SHARED_STATE)) {
    host[FACE_SHARED_STATE] = createSharedFaceState(host);
  }

  return host[FACE_SHARED_STATE];
}

function requestHostUpdate(host) {
  host?.requestUpdate?.();
}

function syncInternalsValue(internals, value, state = value) {
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

function updateSharedValiditySnapshot(sharedState) {
  const nextValidity = cloneValiditySnapshot(sharedState.internals?.validity);
  const nextValidationMessage = readValidationMessage(sharedState.internals);
  const nextWillValidate = readWillValidate(sharedState.internals);
  const changed =
    !sameValiditySnapshot(sharedState.validity, nextValidity) ||
    sharedState.validationMessage !== nextValidationMessage ||
    sharedState.willValidate !== nextWillValidate;

  if (!changed) {
    return false;
  }

  sharedState.validity = nextValidity;
  sharedState.validationMessage = nextValidationMessage;
  sharedState.willValidate = nextWillValidate;
  return true;
}

function refreshSharedValidity(host, sharedState) {
  const changed = updateSharedValiditySnapshot(sharedState);
  if (!changed) {
    return false;
  }

  requestHostUpdate(host);
  return true;
}

function createFaceHostAccessors(shared) {
  return {
    form: {
      get: () => shared.internals?.form ?? shared.form,
    },
    validity: {
      get: () => cloneValiditySnapshot(shared.internals?.validity ?? shared.validity),
    },
    validationMessage: {
      get: () => readValidationMessage(shared.internals) || shared.validationMessage,
    },
    willValidate: {
      get: () => {
        if (shared.internals) {
          return readWillValidate(shared.internals);
        }
        return shared.willValidate;
      },
    },
  };
}

export const useElementInternals = defineHook({
  setup(host) {
    return {
      shared: getOrCreateFaceState(host),
    };
  },

  accessors(_host, state) {
    return createFaceHostAccessors(state.shared);
  },

  use(_host, state) {
    return {
      supported: state.shared.supported,
      internals: state.shared.internals,
    };
  },
});

export const useFormValue = defineHook({
  setup(host, args, _meta, entry) {
    const shared = getOrCreateFaceState(host);
    const existingOwner = host?.[FORM_VALUE_OWNER];
    if (existingOwner && existingOwner !== entry?.callsiteId) {
      throw new Error(
        "useFormValue can only be called once per component host because form-associated controls expose a single form value interface."
      );
    }

    if (host && typeof host === "object") {
      host[FORM_VALUE_OWNER] = entry?.callsiteId ?? true;
    }

    const initialValue = args[0];
    syncInternalsValue(shared.internals, initialValue, initialValue);

    return {
      shared,
      value: initialValue,
      defaultValue: initialValue,
      restoreState: null,
      restoreMode: null,
    };
  },

  accessors(_host, state) {
    return createFaceHostAccessors(state.shared);
  },

  middlewares: {
    formAssociatedCallback(host, state, next, args) {
      const [form] = args;
      if (!Object.is(state.shared.form, form)) {
        state.shared.form = form;
        requestHostUpdate(host);
      }
      return next();
    },

    formDisabledCallback(host, state, next, args) {
      const [disabled] = args;
      if (!Object.is(state.shared.disabled, disabled)) {
        state.shared.disabled = disabled;
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
      syncInternalsValue(state.shared.internals, state.defaultValue, state.defaultValue);

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
      syncInternalsValue(state.shared.internals, restoredState, restoredState);

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
      syncInternalsValue(state.shared.internals, resolvedValue, resolvedValue);
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
      syncInternalsValue(state.shared.internals, value, restoreState);
    });

    return {
      form: state.shared.form,
      disabled: state.shared.disabled,
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

export const useFormValidity = defineHook({
  setup(host) {
    return {
      shared: getOrCreateFaceState(host),
    };
  },

  accessors(_host, state) {
    return createFaceHostAccessors(state.shared);
  },

  middlewares: {
    formAssociatedCallback(host, state, next, args) {
      const [form] = args;
      const formChanged = !Object.is(state.shared.form, form);

      if (formChanged) {
        state.shared.form = form;
      }

      const validityChanged = updateSharedValiditySnapshot(state.shared);
      if (formChanged || validityChanged) {
        requestHostUpdate(host);
      }
      return next();
    },

    formDisabledCallback(host, state, next, args) {
      const [disabled] = args;
      const disabledChanged = !Object.is(state.shared.disabled, disabled);

      if (disabledChanged) {
        state.shared.disabled = disabled;
      }

      const validityChanged = updateSharedValiditySnapshot(state.shared);
      if (disabledChanged || validityChanged) {
        requestHostUpdate(host);
      }
      return next();
    },
  },

  use(host, state) {
    const setValidity = useEvent(host, (flags = {}, message = "", anchor) => {
      if (typeof state.shared.internals?.setValidity !== "function") {
        return;
      }

      if (anchor !== undefined) {
        state.shared.internals.setValidity(flags ?? {}, message, anchor);
      } else if (message !== undefined) {
        state.shared.internals.setValidity(flags ?? {}, message);
      } else {
        state.shared.internals.setValidity(flags ?? {});
      }

      refreshSharedValidity(host, state.shared);
    });

    const checkValidity = useEvent(host, () => {
      if (typeof state.shared.internals?.checkValidity !== "function") {
        return true;
      }
      const result = state.shared.internals.checkValidity();
      refreshSharedValidity(host, state.shared);
      return result;
    });

    const reportValidity = useEvent(host, () => {
      if (typeof state.shared.internals?.reportValidity !== "function") {
        return true;
      }
      const result = state.shared.internals.reportValidity();
      refreshSharedValidity(host, state.shared);
      return result;
    });

    return {
      supported: state.shared.supported,
      willValidate: state.shared.willValidate,
      validity: state.shared.validity,
      validationMessage: state.shared.validationMessage,
      setValidity,
      checkValidity,
      reportValidity,
    };
  },
});
