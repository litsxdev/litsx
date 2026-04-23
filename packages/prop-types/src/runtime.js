const VALIDATOR_SYMBOL = Symbol.for("litsx.propTypes.runtime.validator");

function defaultCompare(value, oldValue) {
  return !Object.is(value, oldValue);
}

function cloneValidatorArray(values) {
  return Array.isArray(values) ? values.slice() : [];
}

function getTypeName(value) {
  if (typeof value === "function" && value.name) {
    return value.name;
  }
  if (value && typeof value === "object" && value.label) {
    return String(value.label);
  }
  return typeof value;
}

function isPlainObject(value) {
  return value !== null &&
    typeof value === "object" &&
    Object.getPrototypeOf(value) === Object.prototype;
}

function defaultFromAttribute(value, type) {
  if (type === Boolean) {
    return value !== null;
  }

  if (type === Number) {
    return value === null ? null : Number(value);
  }

  if (type === Object || type === Array) {
    return value == null ? value : JSON.parse(value);
  }

  return value;
}

function defaultToAttribute(value, type) {
  if (type === Boolean) {
    return value ? "" : null;
  }

  if (type === Object || type === Array) {
    return value == null ? value : JSON.stringify(value);
  }

  return value;
}

function getValidator(candidate) {
  if (candidate && candidate[VALIDATOR_SYMBOL]) {
    return candidate[VALIDATOR_SYMBOL];
  }

  if (candidate === String) {
    return {
      label: "String",
      validate(value) {
        if (value == null || typeof value === "string") return;
        throw new TypeError(`Expected String, received ${typeof value}.`);
      },
    };
  }

  if (candidate === Number) {
    return {
      label: "Number",
      validate(value) {
        if (value == null || typeof value === "number") return;
        throw new TypeError(`Expected Number, received ${typeof value}.`);
      },
    };
  }

  if (candidate === Boolean) {
    return {
      label: "Boolean",
      validate(value) {
        if (value == null || typeof value === "boolean") return;
        throw new TypeError(`Expected Boolean, received ${typeof value}.`);
      },
    };
  }

  if (candidate === Array) {
    return {
      label: "Array",
      validate(value) {
        if (value == null || Array.isArray(value)) return;
        throw new TypeError(`Expected Array, received ${typeof value}.`);
      },
    };
  }

  if (candidate === Object) {
    return {
      label: "Object",
      validate(value) {
        if (value == null || typeof value === "object") return;
        throw new TypeError(`Expected Object, received ${typeof value}.`);
      },
    };
  }

  if (candidate === Date) {
    return instanceOf(Date)[VALIDATOR_SYMBOL];
  }

  if (typeof candidate === "function") {
    return instanceOf(candidate)[VALIDATOR_SYMBOL];
  }

  return null;
}

function createHelper(validator, options = {}) {
  const helper = {
    converter: {
      fromAttribute(value, type) {
        const normalized = defaultFromAttribute(value, type);
        validator.validate(normalized);
        return normalized;
      },
      toAttribute(value, type) {
        validator.validate(value);
        return defaultToAttribute(value, type);
      },
    },
    hasChanged(value, oldValue) {
      validator.validate(value);
      return defaultCompare(value, oldValue);
    },
  };

  Object.defineProperty(helper, VALIDATOR_SYMBOL, {
    value: validator,
    enumerable: false,
    configurable: false,
    writable: false,
  });

  if (options.attribute === false) {
    helper.attribute = false;
  }

  return helper;
}

function validateWith(candidate, value) {
  const validator = getValidator(candidate);
  if (!validator) {
    throw new TypeError(`Unsupported prop-types validator: ${String(candidate)}.`);
  }
  validator.validate(value);
}

function required(inner) {
  if (arguments.length > 0) {
    return {
      [VALIDATOR_SYMBOL]: {
        label: "required",
        validate(value) {
          if (value == null) {
            throw new TypeError("Expected a required value.");
          }
          validateWith(inner, value);
        },
      },
    };
  }

  return createHelper({
    label: "required",
    validate(value) {
      if (value == null) {
        throw new TypeError("Expected a required value.");
      }
    },
  });
}

function oneOf(values = []) {
  const allowed = cloneValidatorArray(values);
  return createHelper({
    label: "oneOf",
    validate(value) {
      if (value == null) return;
      if (!allowed.some((candidate) => Object.is(candidate, value))) {
        throw new TypeError(
          `Invalid value "${String(value)}". Expected one of ${allowed.map(String).join(", ")}.`
        );
      }
    },
  });
}

function oneOfType(types = []) {
  const validators = cloneValidatorArray(types).map((candidate) => getValidator(candidate));
  return createHelper({
    label: "oneOfType",
    validate(value) {
      if (value == null) return;
      if (validators.some((validator) => {
        if (!validator) return false;
        try {
          validator.validate(value);
          return true;
        } catch {
          return false;
        }
      })) {
        return;
      }

      throw new TypeError(
        `Value does not match any allowed type: ${validators.filter(Boolean).map((validator) => validator.label).join(", ")}.`
      );
    },
  });
}

function arrayOf(inner) {
  const validator = getValidator(inner);
  return createHelper({
    label: "arrayOf",
    validate(value) {
      if (value == null) return;
      if (!Array.isArray(value)) {
        throw new TypeError(`Expected Array, received ${typeof value}.`);
      }
      if (!validator) return;
      value.forEach((item) => validator.validate(item));
    },
  });
}

function objectOf(inner) {
  const validator = getValidator(inner);
  return createHelper({
    label: "objectOf",
    validate(value) {
      if (value == null) return;
      if (!isPlainObject(value) && typeof value !== "object") {
        throw new TypeError(`Expected Object, received ${typeof value}.`);
      }
      if (!validator) return;
      Object.values(value).forEach((item) => validator.validate(item));
    },
  }, { attribute: false });
}

function validateShapeValue(schema, value, exactShape) {
  if (value == null) return;
  if (!isPlainObject(value)) {
    throw new TypeError(`Expected Object, received ${typeof value}.`);
  }

  for (const [key, candidate] of Object.entries(schema)) {
    const validator = getValidator(candidate);
    if (!validator) continue;
    validator.validate(value[key]);
  }

  if (exactShape) {
    for (const key of Object.keys(value)) {
      if (!Object.prototype.hasOwnProperty.call(schema, key)) {
        throw new TypeError(`Unexpected key "${key}" in exact object shape.`);
      }
    }
  }
}

function shape(schema = {}) {
  const normalized = { ...schema };
  return createHelper({
    label: "shape",
    validate(value) {
      validateShapeValue(normalized, value, false);
    },
  }, { attribute: false });
}

function exact(schema = {}) {
  const normalized = { ...schema };
  return createHelper({
    label: "exact",
    validate(value) {
      validateShapeValue(normalized, value, true);
    },
  }, { attribute: false });
}

function instanceOf(ctor) {
  return createHelper({
    label: `instanceOf(${getTypeName(ctor)})`,
    validate(value) {
      if (value == null) return;
      if (!(value instanceof ctor)) {
        throw new TypeError(`Expected instance of ${getTypeName(ctor)}.`);
      }
    },
  }, { attribute: false });
}

function custom(validator) {
  if (typeof validator !== "function") {
    throw new TypeError("custom(...) expects a validator function.");
  }

  return createHelper({
    label: "custom",
    validate(value) {
      validator(value);
    },
  });
}

export {
  VALIDATOR_SYMBOL,
  arrayOf,
  custom,
  exact,
  instanceOf,
  objectOf,
  oneOf,
  oneOfType,
  required,
  shape,
};
