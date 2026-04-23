const CONFIG_SYMBOL = Symbol.for("litsx.propTypes.config");
const INSPECT_SYMBOL = Symbol.for("nodejs.util.inspect.custom");
const ONE_OF_ALLOWED_SYMBOL = Symbol.for("litsx.propTypes.oneOf.allowed");
const ONE_OF_GUARD_SYMBOL = Symbol.for("litsx.propTypes.oneOf.guard");
const ONE_OF_NEXT_SYMBOL = Symbol.for("litsx.propTypes.oneOf.next");

const TYPE_MAP = new Map(
  Object.entries({
    string: String,
    number: Number,
    bool: Boolean,
    boolean: Boolean,
    array: Array,
    object: Object,
    func: Object,
    function: Object,
    symbol: Object,
    node: Object,
    element: Object,
    elementType: Object,
    any: Object,
  })
);

function cloneConfig(config) {
  return Object.assign({}, config);
}

function createDescriptor(config) {
  const descriptor = Object.create(PropTypeBuilder.prototype);
  const normalized = cloneConfig(config);
  Object.defineProperty(descriptor, CONFIG_SYMBOL, {
    value: normalized,
    configurable: false,
    enumerable: false,
    writable: false,
  });

  return Object.assign(descriptor, normalized);
}

function setNonEnumerable(target, key, value) {
  Object.defineProperty(target, key, {
    value,
    configurable: true,
    enumerable: false,
    writable: true,
  });
}

function applyOneOfGuard(descriptor) {
  const allowed = descriptor[ONE_OF_ALLOWED_SYMBOL];
  if (!allowed) return;

  let next = descriptor[CONFIG_SYMBOL].hasChanged;

  if (next && next[ONE_OF_GUARD_SYMBOL] && next[ONE_OF_ALLOWED_SYMBOL] === allowed) {
    descriptor.hasChanged = next;
    return;
  }

  if (next && next[ONE_OF_GUARD_SYMBOL]) {
    next = next[ONE_OF_NEXT_SYMBOL];
  }

  const guard = function oneOfHasChanged(value, oldValue) {
    if (arguments.length === 1 && typeof value === "function" && oldValue === undefined) {
      const nextDescriptor = PropTypeBuilder.prototype.hasChanged.call(this, value);
      if (nextDescriptor && nextDescriptor !== this) {
        setNonEnumerable(nextDescriptor, ONE_OF_ALLOWED_SYMBOL, allowed);
        applyOneOfGuard(nextDescriptor);
      }
      return nextDescriptor;
    }
    if (value !== undefined && !allowed.includes(value)) {
      const expected = allowed.join(", ");
      throw new TypeError(`Invalid value "${String(value)}". Expected one of ${expected}.`);
    }
    if (typeof next === "function") {
      return next.call(this, value, oldValue);
    }
    return value !== oldValue;
  };

  setNonEnumerable(guard, ONE_OF_GUARD_SYMBOL, true);
  setNonEnumerable(guard, ONE_OF_ALLOWED_SYMBOL, allowed);
  setNonEnumerable(guard, ONE_OF_NEXT_SYMBOL, next || null);

  descriptor.hasChanged = guard;
  descriptor[CONFIG_SYMBOL].hasChanged = guard;
}

function toConfig(candidate) {
  if (!candidate) return {};
  if (candidate && candidate[CONFIG_SYMBOL]) {
    return cloneConfig(candidate[CONFIG_SYMBOL]);
  }

  if (typeof candidate === "string" && TYPE_MAP.has(candidate)) {
    return { type: TYPE_MAP.get(candidate) };
  }

  if (typeof candidate === "object") {
    return cloneConfig(candidate);
  }

  return {};
}

function inferFromValues(values) {
  if (!Array.isArray(values) || values.length === 0) {
    return String;
  }

  const types = new Set();
  values.forEach((value) => {
    if (typeof value === "string") {
      types.add(String);
    } else if (typeof value === "number") {
      types.add(Number);
    } else if (typeof value === "boolean") {
      types.add(Boolean);
    } else {
      types.add(Object);
    }
  });

  if (types.size === 1) return types.values().next().value;
  if (types.has(Object)) return Object;
  return String;
}

class PropTypeBuilder {
  _clone(overrides = {}) {
    const baseConfig = { ...this[CONFIG_SYMBOL], ...overrides };

    if (this[ONE_OF_ALLOWED_SYMBOL] && !Object.prototype.hasOwnProperty.call(overrides, "hasChanged")) {
      const current = baseConfig.hasChanged;
      if (current && current[ONE_OF_GUARD_SYMBOL]) {
        const baseNext = current[ONE_OF_NEXT_SYMBOL];
        if (baseNext) {
          baseConfig.hasChanged = baseNext;
        } else {
          delete baseConfig.hasChanged;
        }
      }
    }

    const descriptor = createDescriptor(baseConfig);

    if (this[ONE_OF_ALLOWED_SYMBOL]) {
      setNonEnumerable(descriptor, ONE_OF_ALLOWED_SYMBOL, this[ONE_OF_ALLOWED_SYMBOL]);
      applyOneOfGuard(descriptor);
    }

    return descriptor;
  }

  withOptions(options = {}) {
    return this._clone(options);
  }

  attribute(value = true) {
    return this._clone({ attribute: value });
  }

  reflect(value = true) {
    return this._clone({ reflect: value });
  }

  state(value = true) {
    return this._clone({ state: value });
  }

  noAccessor(value = true) {
    return this._clone({ noAccessor: value });
  }

  hasChanged(fn) {
    if (typeof fn !== "function") {
      throw new TypeError("hasChanged expects a function");
    }
    return this._clone({ hasChanged: fn });
  }

  converter(converter) {
    if (converter == null) {
      throw new TypeError("converter expects a value");
    }
    return this._clone({ converter });
  }

  withConverter(target, options = {}) {
    const baseConfig = toConfig(target);
    if (!baseConfig.type) {
      throw new TypeError("withConverter expects a prop type as the first argument");
    }

    const merged = {
      ...this[CONFIG_SYMBOL],
      ...baseConfig,
      ...options,
    };

    merged.type = baseConfig.type;

    return createDescriptor(merged);
  }

  get isRequired() {
    return this._clone({ required: true });
  }

  optional() {
    const config = { ...this[CONFIG_SYMBOL] };
    if (Object.prototype.hasOwnProperty.call(config, "required")) {
      delete config.required;
    }
    return createDescriptor(config);
  }

  valueOf() {
    return cloneConfig(this[CONFIG_SYMBOL]);
  }

  toJSON() {
    return this.valueOf();
  }

  [INSPECT_SYMBOL]() {
    return this.valueOf();
  }
}

function ensureDescriptor(value) {
  if (value && value[CONFIG_SYMBOL]) return value;
  return createDescriptor(value || {});
}

function primitive(name) {
  const litType = TYPE_MAP.get(name);
  return createDescriptor({ type: litType });
}

const PropTypes = {
  arrayOf(inner) {
    const config = toConfig(inner);
    return createDescriptor({ type: Array, value: config });
  },
  objectOf(inner) {
    const config = toConfig(inner);
    return createDescriptor({ type: Object, value: config });
  },
  shape(schema = {}) {
    return createDescriptor({ type: Object, shape: { ...schema } });
  },
  exact(schema = {}) {
    return createDescriptor({ type: Object, shape: { ...schema }, exact: true });
  },
  oneOf(values = []) {
    const allowed = Array.isArray(values) ? [...values] : [];
    const descriptor = createDescriptor({
      type: inferFromValues(values),
      values: allowed,
    });

    setNonEnumerable(descriptor, ONE_OF_ALLOWED_SYMBOL, allowed);
    applyOneOfGuard(descriptor);

    return descriptor;
  },
  oneOfType(types = []) {
    const normalized = Array.isArray(types)
      ? types.map((candidate) => {
          if (candidate && candidate[CONFIG_SYMBOL]) {
            return candidate;
          }
          return toConfig(candidate);
        })
      : [];

    return createDescriptor({
      type: Object,
      types: normalized,
    });
  },
  instanceOf(ctor) {
    return createDescriptor({ type: Object, instanceOf: ctor });
  },
  checkPropTypes() {},
  resetWarningCache() {},
};

[
  "string",
  "number",
  "bool",
  "boolean",
  "array",
  "object",
  "func",
  "function",
  "symbol",
  "node",
  "element",
  "elementType",
  "any",
].forEach((name) => {
  if (!TYPE_MAP.has(name)) return;
  const descriptor = primitive(name);
  Object.defineProperty(PropTypes, name, {
    value: descriptor,
    writable: false,
    enumerable: true,
    configurable: false,
  });
});

PropTypes.withConverter = function withConverter(typeValue, options = {}) {
  const descriptor = ensureDescriptor(PropTypes.any).withConverter(typeValue, options);
  return descriptor;
};

PropTypes.extend = function extend(options = {}) {
  return createDescriptor({ ...options });
};

export default PropTypes;
export { PropTypes };
