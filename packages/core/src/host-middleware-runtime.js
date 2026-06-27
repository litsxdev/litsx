const EMPTY_ARGS = Object.freeze([]);
const LIFECYCLE_METHODS = [
  "connectedCallback",
  "disconnectedCallback",
  "attributeChangedCallback",
  "scheduleUpdate",
  "shouldUpdate",
  "willUpdate",
  "update",
  "updated",
  "firstUpdated",
  "getUpdateComplete",
];

function isObject(value) {
  return value !== null && typeof value === "object";
}

function normalizeArgs(args) {
  return Array.isArray(args) ? args : EMPTY_ARGS;
}

function normalizeInvocation(argsOrBase, maybeBase) {
  if (typeof argsOrBase === "function" && maybeBase == null) {
    return {
      args: EMPTY_ARGS,
      base: argsOrBase,
    };
  }

  return {
    args: normalizeArgs(argsOrBase),
    base: typeof maybeBase === "function" ? maybeBase : () => undefined,
  };
}

function getDefinitionMiddlewares(definition) {
  return isObject(definition) && isObject(definition.middlewares)
    ? definition.middlewares
    : null;
}

function createEntryState(host, definition, args, meta, entry) {
  if (Object.prototype.hasOwnProperty.call(entry, "state")) {
    return entry.state;
  }

  if (isObject(definition) && typeof definition.createState === "function") {
    return definition.createState(host, args, meta, entry);
  }

  return undefined;
}

function normalizeStructuralEntry(host, entry, index) {
  const source = isObject(entry) ? entry : {};
  const callsiteIndex = Number.isInteger(source.callsiteIndex)
    ? source.callsiteIndex
    : index;
  const callsiteId = typeof source.callsiteId === "string"
    ? source.callsiteId
    : typeof source.id === "string"
      ? source.id
      : `structural:${callsiteIndex}`;
  const definition = Object.prototype.hasOwnProperty.call(source, "definition")
    ? source.definition
    : null;
  const args = Array.isArray(source.args) ? source.args : [];
  const meta = isObject(source.meta) ? source.meta : {};
  const normalized = {
    id: callsiteId,
    callsiteId,
    callsiteIndex,
    definition,
    args,
    meta,
    state: undefined,
    middlewares: isObject(source.middlewares)
      ? source.middlewares
      : getDefinitionMiddlewares(definition),
  };
  normalized.state = createEntryState(host, definition, args, meta, source);
  return normalized;
}

function resolveHostEntries(host, entries) {
  const source = typeof entries === "function" ? entries(host) : entries;
  return Array.isArray(source) ? source : [];
}

function getHostMiddlewareEntries(host) {
  const ctor = host?.constructor;
  return resolveHostEntries(
    host,
    ctor?.structuralEntries ?? ctor?.__litsxStructuralEntries ?? [],
  );
}

/**
 * Runtime for structural host middleware entries.
 *
 * Entries are one-to-one with authored callsites and are intentionally not
 * deduplicated. Resource-level dedupe belongs in each structural hook runtime.
 * Entries are composed in registration order. For every lifecycle method, the
 * generated host's base implementation is invoked as the final chain link.
 */
export class HostMiddlewareRuntime {
  constructor(host, entries = []) {
    this.host = host;
    this.entries = resolveHostEntries(host, entries).map((entry, index) =>
      normalizeStructuralEntry(host, entry, index)
    );
  }

  getEntry(index) {
    return this.entries[index] ?? null;
  }

  read(index) {
    const entry = this.getEntry(index);
    if (!entry) {
      throw new RangeError(`Host middleware entry ${index} does not exist.`);
    }

    const use = isObject(entry.definition) && typeof entry.definition.use === "function"
      ? entry.definition.use
      : null;

    if (!use) {
      throw new TypeError(`Host middleware entry "${entry.id}" does not define a render-time use() reader.`);
    }

    return use(this.host, entry.state, entry.args, entry.meta, entry);
  }

  run(methodName, argsOrBase, maybeBase) {
    const { args, base } = normalizeInvocation(argsOrBase, maybeBase);
    const chainEntries = this.entries.filter((entry) =>
      typeof entry.middlewares?.[methodName] === "function"
    );

    const dispatch = (index) => {
      if (index >= chainEntries.length) {
        return base();
      }

      const entry = chainEntries[index];
      const middleware = entry.middlewares[methodName];
      let nextCalled = false;
      const next = () => {
        if (nextCalled) {
          throw new Error(`Host middleware "${entry.id}" called next() more than once for ${methodName}.`);
        }
        nextCalled = true;
        return dispatch(index + 1);
      };

      return middleware(this.host, entry.state, next, args, entry);
    };

    return dispatch(0);
  }
}

for (const methodName of LIFECYCLE_METHODS) {
  HostMiddlewareRuntime.prototype[methodName] = function runLifecycle(argsOrBase, maybeBase) {
    return this.run(methodName, argsOrBase, maybeBase);
  };
}

function getOrCreateHostRuntime(host) {
  if (!host.__litsxHostMiddlewareRuntime) {
    host.__litsxHostMiddlewareRuntime = new HostMiddlewareRuntime(
      host,
      getHostMiddlewareEntries(host),
    );
  }
  return host.__litsxHostMiddlewareRuntime;
}

export function HostMiddlewareMixin(Base) {
  class HostMiddlewareHost extends Base {
    constructor(...args) {
      super(...args);
      this.__litsxHostMiddlewareRuntime = new HostMiddlewareRuntime(
        this,
        getHostMiddlewareEntries(this),
      );
    }

    __litsxReadStructuralEntry(index) {
      return getOrCreateHostRuntime(this).read(index);
    }

    connectedCallback(...args) {
      return getOrCreateHostRuntime(this).connectedCallback(args, () =>
        typeof super.connectedCallback === "function" ? super.connectedCallback(...args) : undefined
      );
    }

    disconnectedCallback(...args) {
      return getOrCreateHostRuntime(this).disconnectedCallback(args, () =>
        typeof super.disconnectedCallback === "function" ? super.disconnectedCallback(...args) : undefined
      );
    }

    attributeChangedCallback(...args) {
      return getOrCreateHostRuntime(this).attributeChangedCallback(args, () =>
        typeof super.attributeChangedCallback === "function" ? super.attributeChangedCallback(...args) : undefined
      );
    }

    scheduleUpdate(...args) {
      return getOrCreateHostRuntime(this).scheduleUpdate(args, () =>
        typeof super.scheduleUpdate === "function" ? super.scheduleUpdate(...args) : undefined
      );
    }

    shouldUpdate(...args) {
      return getOrCreateHostRuntime(this).shouldUpdate(args, () =>
        typeof super.shouldUpdate === "function" ? super.shouldUpdate(...args) : undefined
      );
    }

    willUpdate(...args) {
      return getOrCreateHostRuntime(this).willUpdate(args, () =>
        typeof super.willUpdate === "function" ? super.willUpdate(...args) : undefined
      );
    }

    update(...args) {
      return getOrCreateHostRuntime(this).update(args, () =>
        typeof super.update === "function" ? super.update(...args) : undefined
      );
    }

    updated(...args) {
      return getOrCreateHostRuntime(this).updated(args, () =>
        typeof super.updated === "function" ? super.updated(...args) : undefined
      );
    }

    firstUpdated(...args) {
      return getOrCreateHostRuntime(this).firstUpdated(args, () =>
        typeof super.firstUpdated === "function" ? super.firstUpdated(...args) : undefined
      );
    }

    getUpdateComplete(...args) {
      return getOrCreateHostRuntime(this).getUpdateComplete(args, () =>
        typeof super.getUpdateComplete === "function" ? super.getUpdateComplete(...args) : undefined
      );
    }
  }

  return HostMiddlewareHost;
}

export function createHostMiddlewareRuntime(host, entries = getHostMiddlewareEntries(host)) {
  return new HostMiddlewareRuntime(host, entries);
}
