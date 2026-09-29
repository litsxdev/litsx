import { useEvent } from "./effect-hooks.js";
import { useHost } from "./host-hooks.js";
import { defineHook } from "./structural-hooks-runtime.js";

const FACE_INTERNALS = Symbol.for("litsx.face.internals");
const FACE_SHARED_STATE = Symbol.for("litsx.face.sharedState");
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
    formValue: null,
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

export {
  cloneValiditySnapshot,
  createSharedFaceState,
  ensureInternals,
  getOrCreateFaceState,
  readValidationMessage,
  readWillValidate,
  refreshSharedValidity,
  requestHostUpdate,
  sameValiditySnapshot,
  syncInternalsValue,
  updateSharedValiditySnapshot,
};

export function FormAssociatedMixin(Base) {
  return class FormAssociatedHost extends Base {
    static formAssociated = true;

    constructor(...args) {
      super(...args);
      getOrCreateFaceState(this);
    }

    get form() {
      const shared = getOrCreateFaceState(this);
      return shared.internals?.form ?? shared.form;
    }

    get validity() {
      const shared = getOrCreateFaceState(this);
      return cloneValiditySnapshot(
        shared.internals?.validity ?? shared.validity,
      );
    }

    get validationMessage() {
      const shared = getOrCreateFaceState(this);
      return shared.internals
        ? readValidationMessage(shared.internals)
        : shared.validationMessage;
    }

    get willValidate() {
      const shared = getOrCreateFaceState(this);
      return shared.internals
        ? readWillValidate(shared.internals)
        : shared.willValidate;
    }

    formAssociatedCallback(form) {
      const shared = getOrCreateFaceState(this);
      if (!Object.is(shared.form, form)) {
        shared.form = form;
        updateSharedValiditySnapshot(shared);
        requestHostUpdate(this);
      }
      return typeof super.formAssociatedCallback === "function"
        ? super.formAssociatedCallback(form)
        : undefined;
    }

    formDisabledCallback(disabled) {
      const shared = getOrCreateFaceState(this);
      if (!Object.is(shared.disabled, disabled)) {
        shared.disabled = disabled;
        updateSharedValiditySnapshot(shared);
        requestHostUpdate(this);
      }
      return typeof super.formDisabledCallback === "function"
        ? super.formDisabledCallback(disabled)
        : undefined;
    }

    formResetCallback() {
      const shared = getOrCreateFaceState(this);
      const formValue = shared.formValue;
      if (formValue) {
        const changed =
          !Object.is(formValue.value, formValue.defaultValue) ||
          formValue.restoreState !== null ||
          formValue.restoreMode !== null;
        formValue.value = formValue.defaultValue;
        formValue.restoreState = null;
        formValue.restoreMode = null;
        syncInternalsValue(
          shared.internals,
          formValue.defaultValue,
          formValue.defaultValue,
        );
        if (changed) requestHostUpdate(this);
      }
      return typeof super.formResetCallback === "function"
        ? super.formResetCallback()
        : undefined;
    }

    formStateRestoreCallback(restoredState, mode) {
      const shared = getOrCreateFaceState(this);
      const formValue = shared.formValue;
      if (formValue) {
        const changed =
          !Object.is(formValue.value, restoredState) ||
          !Object.is(formValue.restoreState, restoredState) ||
          formValue.restoreMode !== mode;
        formValue.value = restoredState;
        formValue.restoreState = restoredState;
        formValue.restoreMode = mode;
        syncInternalsValue(shared.internals, restoredState, restoredState);
        if (changed) requestHostUpdate(this);
      }
      return typeof super.formStateRestoreCallback === "function"
        ? super.formStateRestoreCallback(restoredState, mode)
        : undefined;
    }
  };
}

export const useElementInternals = defineHook({
  mixin: FormAssociatedMixin,
  use() {
    const host = useHost();
    const shared = getOrCreateFaceState(host);
    return {
      supported: shared.supported,
      internals: shared.internals,
    };
  },
});

export const useFormValue = defineHook({
  mixin: FormAssociatedMixin,
  use(initialValue) {
    const host = useHost();
    const shared = getOrCreateFaceState(host);
    if (!shared.formValue) {
      shared.formValue = {
        value: initialValue,
        defaultValue: initialValue,
        restoreState: null,
        restoreMode: null,
      };
      syncInternalsValue(shared.internals, initialValue, initialValue);
    }
    const formValue = shared.formValue;
    const setValue = useEvent((next) => {
      const resolvedValue =
        typeof next === "function" ? next(formValue.value) : next;

      if (Object.is(formValue.value, resolvedValue)) {
        return resolvedValue;
      }

      formValue.value = resolvedValue;
      syncInternalsValue(shared.internals, resolvedValue, resolvedValue);
      requestHostUpdate(host);
      return resolvedValue;
    });

    const setDefaultValue = useEvent((next) => {
      const resolvedValue =
        typeof next === "function" ? next(formValue.defaultValue) : next;

      if (Object.is(formValue.defaultValue, resolvedValue)) {
        return resolvedValue;
      }

      formValue.defaultValue = resolvedValue;
      requestHostUpdate(host);
      return resolvedValue;
    });

    const setFormValue = useEvent(
      (value, restoreState = formValue.value) => {
        syncInternalsValue(shared.internals, value, restoreState);
      },
    );

    return {
      form: shared.form,
      disabled: shared.disabled,
      value: formValue.value,
      defaultValue: formValue.defaultValue,
      restoreState: formValue.restoreState,
      restoreMode: formValue.restoreMode,
      setValue,
      setDefaultValue,
      setFormValue,
    };
  },
});

export const useFormValidity = defineHook({
  mixin: FormAssociatedMixin,
  use() {
    const host = useHost();
    const shared = getOrCreateFaceState(host);
    updateSharedValiditySnapshot(shared);

    const setValidity = useEvent((flags = {}, message = "", anchor) => {
      if (typeof shared.internals?.setValidity !== "function") {
        return;
      }

      if (anchor !== undefined) {
        shared.internals.setValidity(flags ?? {}, message, anchor);
      } else if (message !== undefined) {
        shared.internals.setValidity(flags ?? {}, message);
      } else {
        shared.internals.setValidity(flags ?? {});
      }

      refreshSharedValidity(host, shared);
    });

    const checkValidity = useEvent(() => {
      if (typeof shared.internals?.checkValidity !== "function") {
        return true;
      }
      const result = shared.internals.checkValidity();
      refreshSharedValidity(host, shared);
      return result;
    });

    const reportValidity = useEvent(() => {
      if (typeof shared.internals?.reportValidity !== "function") {
        return true;
      }
      const result = shared.internals.reportValidity();
      refreshSharedValidity(host, shared);
      return result;
    });

    return {
      supported: shared.supported,
      willValidate: shared.willValidate,
      validity: shared.validity,
      validationMessage: shared.validationMessage,
      setValidity,
      checkValidity,
      reportValidity,
    };
  },
});
