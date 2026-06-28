const EMPTY_ARGS = Object.freeze([]);
const STRUCTURAL_HOOK_DEFINITION = Symbol.for("litsx.structuralHookDefinition");
const STRUCTURAL_HOOK_ENTRIES = Symbol.for("litsx.structuralHookEntries");
const STRUCTURAL_STATIC_STATE = Symbol.for("litsx.structuralStaticState");
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

function resolveStructuralDefinition(definition) {
  return typeof definition === "function" && definition[STRUCTURAL_HOOK_DEFINITION]
    ? definition[STRUCTURAL_HOOK_DEFINITION]
    : definition;
}

function createStructuralHookCallable() {
  return function structuralHookMustBeCompiled() {
    throw new Error(
      "Structural hooks created with defineHook() must be compiled by LitSX before they can be called."
    );
  };
}

export function defineHook(definition) {
  const hook = createStructuralHookCallable();
  Object.defineProperty(hook, STRUCTURAL_HOOK_DEFINITION, {
    value: definition,
    configurable: true,
  });
  return hook;
}

export function isStructuralHook(value) {
  return typeof value === "function" && Boolean(value[STRUCTURAL_HOOK_DEFINITION]);
}

export function defineStructuralHookEntries(hook, entries) {
  if (typeof hook !== "function") {
    return hook;
  }
  Object.defineProperty(hook, STRUCTURAL_HOOK_ENTRIES, {
    value: Array.isArray(entries) ? entries : [],
    configurable: true,
  });
  return hook;
}

export function getStructuralHookEntries(hook) {
  return typeof hook === "function" && Array.isArray(hook[STRUCTURAL_HOOK_ENTRIES])
    ? hook[STRUCTURAL_HOOK_ENTRIES]
    : [];
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

function normalizeHookPath(path) {
  return Array.isArray(path)
    ? path.map((part) => String(part))
    : [];
}

function getStructuralEntryId(callsiteId, callsiteIndex) {
  return typeof callsiteId === "string" && callsiteId
    ? callsiteId
    : `structural:${callsiteIndex}`;
}

function getStructuralMeta(meta, callsitePath) {
  const nextMeta = isObject(meta) ? { ...meta } : {};
  const normalizedPath = normalizeHookPath(callsitePath);
  if (normalizedPath.length > 0 && !Array.isArray(nextMeta.callsitePath)) {
    nextMeta.callsitePath = normalizedPath;
  }
  return nextMeta;
}

function getEntryCallsitePath(source, callsiteId) {
  return normalizeHookPath(source.callsitePath ?? source.path ?? source.meta?.callsitePath ?? [callsiteId]);
}

function refreshEntryArgsAndMeta(entry, args = null, meta = null) {
  entry.args = Array.isArray(args) ? args : entry.args;
  entry.meta = isObject(meta) ? getStructuralMeta(meta, entry.callsitePath) : entry.meta;
  return entry;
}

function getDefinitionMiddlewares(definition) {
  const resolvedDefinition = resolveStructuralDefinition(definition);
  return isObject(resolvedDefinition) && isObject(resolvedDefinition.middlewares)
    ? resolvedDefinition.middlewares
    : null;
}

function getDefinitionUse(definition) {
  const resolvedDefinition = resolveStructuralDefinition(definition);
  return isObject(resolvedDefinition) && typeof resolvedDefinition.use === "function"
    ? resolvedDefinition.use
    : null;
}

function getDefinitionStatic(definition) {
  const resolvedDefinition = resolveStructuralDefinition(definition);
  return isObject(resolvedDefinition) && typeof resolvedDefinition.static === "function"
    ? resolvedDefinition.static
    : null;
}

function getDefinitionCreateState(definition) {
  const resolvedDefinition = resolveStructuralDefinition(definition);
  if (isObject(resolvedDefinition) && typeof resolvedDefinition.createState === "function") {
    return resolvedDefinition.createState;
  }
  if (isObject(resolvedDefinition) && typeof resolvedDefinition.setup === "function") {
    return resolvedDefinition.setup;
  }
  return null;
}

function getParameterNames(fn) {
  const source = Function.prototype.toString.call(fn);
  const argsMatch = source.match(/^[^(]*\(([^)]*)\)/);
  if (argsMatch) {
    return argsMatch[1]
      .split(",")
      .map((part) => part.trim().replace(/\s*=.*$/, ""))
      .filter(Boolean);
  }
  const singleArgMatch = source.match(/^([^=\s(]+)\s*=>/);
  return singleArgMatch?.[1] ? [singleArgMatch[1]] : [];
}

function getFirstParameterName(fn) {
  return getParameterNames(fn)[0] ?? "";
}

function getSecondParameterName(fn) {
  return getParameterNames(fn)[1] ?? "";
}

function callsLegacyHostFirst(fn) {
  return /^_?host\b/.test(getFirstParameterName(fn));
}

function callsLegacySetup(createState) {
  return typeof createState === "function" && callsLegacyHostFirst(createState);
}

function callsLegacyUse(use) {
  return typeof use === "function" &&
    callsLegacyHostFirst(use) &&
    /^_?state\b/.test(getSecondParameterName(use));
}

function callsLegacyMiddleware(middleware) {
  return typeof middleware === "function" && callsLegacyHostFirst(middleware);
}

function callsInjectedHostUse(use) {
  return typeof use === "function" && callsLegacyHostFirst(use) && !callsLegacyUse(use);
}

function getStaticStateCache(owner) {
  if (!owner) {
    return null;
  }
  if (!owner[STRUCTURAL_STATIC_STATE]) {
    Object.defineProperty(owner, STRUCTURAL_STATIC_STATE, {
      value: new Map(),
      configurable: true,
    });
  }
  return owner[STRUCTURAL_STATIC_STATE];
}

function createStaticState(owner, definition, args, meta, entry) {
  const staticReader = getDefinitionStatic(definition);
  if (!staticReader) {
    return undefined;
  }
  return staticReader(...args, meta, entry);
}

function getOrCreateStaticState(owner, definition, args, meta, entry) {
  const cache = getStaticStateCache(owner);
  const key = entry.callsiteId ?? entry.id;
  if (!cache || !key) {
    return createStaticState(owner, definition, args, meta, entry);
  }
  if (!cache.has(key)) {
    cache.set(key, createStaticState(owner, definition, args, meta, entry));
  }
  return cache.get(key);
}

function createEntryState(host, definition, args, meta, entry) {
  if (Object.prototype.hasOwnProperty.call(entry, "state")) {
    return entry.state;
  }

  const staticState = Object.prototype.hasOwnProperty.call(entry, "staticState")
    ? entry.staticState
    : getOrCreateStaticState(host?.constructor, definition, args, meta, entry);
  const createState = getDefinitionCreateState(definition);
  const structuralState = {
    static: staticState,
    instance: undefined,
  };
  if (createState) {
    if (callsLegacySetup(createState)) {
      return createState(host, args, meta, entry);
    }
    structuralState.instance = createState(...args, staticState, meta, entry);
  }

  return structuralState;
}

function normalizeStructuralEntry(host, entry, index) {
  const source = isObject(entry) ? entry : {};
  const callsiteIndex = Number.isInteger(source.callsiteIndex)
    ? source.callsiteIndex
    : index;
  const callsiteId = getStructuralEntryId(source.callsiteId ?? source.id, callsiteIndex);
  const callsitePath = getEntryCallsitePath(source, callsiteId);
  const definition = Object.prototype.hasOwnProperty.call(source, "definition")
    ? source.definition
    : null;
  const args = Array.isArray(source.args) ? source.args : [];
  const meta = getStructuralMeta(source.meta, callsitePath);
  const normalized = {
    id: callsiteId,
    callsiteId,
    callsiteIndex,
    callsitePath,
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
 *
 * SSR/client consistency comes from the compiled structural plan: the same
 * authored file and callsite path produce the same entry ids and paths on both
 * sides. This generic runtime does not serialize arbitrary entry state; hooks
 * that own serializable resources should use their stable callsite metadata as
 * the key for their own SSR payloads.
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

  findEntryIndexByCallsiteId(callsiteId) {
    return this.entries.findIndex((entry) => entry?.callsiteId === callsiteId);
  }

  ensureEntry(index, entry) {
    const existing = this.entries[index];
    if (existing && existing.callsiteId === (entry?.callsiteId ?? entry?.id)) {
      return refreshEntryArgsAndMeta(existing, entry?.args, entry?.meta);
    }

    const callsiteId = entry?.callsiteId ?? entry?.id;
    if (typeof callsiteId === "string") {
      const existingIndex = this.findEntryIndexByCallsiteId(callsiteId);
      if (existingIndex >= 0) {
        return refreshEntryArgsAndMeta(this.entries[existingIndex], entry?.args, entry?.meta);
      }
    }

    const normalized = normalizeStructuralEntry(this.host, entry, index);
    if (existing) {
      this.entries.push(normalized);
    } else {
      this.entries[index] = normalized;
    }
    return normalized;
  }

  read(index, args = null, meta = null) {
    const entry = this.getEntry(index);
    if (!entry) {
      throw new RangeError(`Host middleware entry ${index} does not exist.`);
    }

    refreshEntryArgsAndMeta(entry, args, meta);
    const use = getDefinitionUse(entry.definition);

    if (!use) {
      throw new TypeError(`Host middleware entry "${entry.id}" does not define a render-time use() reader.`);
    }

    if (callsLegacyUse(use)) {
      return use(this.host, entry.state, entry.args, entry.meta, entry);
    }
    if (callsInjectedHostUse(use)) {
      return use(this.host, ...entry.args, entry.state, entry.meta, entry);
    }

    return use(...entry.args, entry.state, entry.meta, entry);
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

      if (callsLegacyMiddleware(middleware)) {
        return middleware(this.host, entry.state, next, args, entry.meta, entry);
      }

      return middleware(next, entry.state, entry.meta, entry);
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

export function resolveStructuralEntry(host, callsiteIndex, callsiteId, definition, args = [], meta = {}) {
  const runtime = getOrCreateHostRuntime(host);
  const callsitePath = normalizeHookPath(meta?.callsitePath ?? [callsiteId]);
  const nextMeta = getStructuralMeta(meta, callsitePath);
  const entry = runtime.ensureEntry(callsiteIndex, {
    id: callsiteId,
    callsiteId,
    callsiteIndex,
    callsitePath,
    definition,
    args,
    meta: nextMeta,
  });
  const entryIndex = runtime.entries.indexOf(entry);
  return runtime.read(entryIndex >= 0 ? entryIndex : callsiteIndex, args, nextMeta);
}

function normalizeStaticEntry(owner, entry, index) {
  const source = isObject(entry) ? entry : {};
  const callsiteIndex = Number.isInteger(source.callsiteIndex)
    ? source.callsiteIndex
    : index;
  const callsiteId = getStructuralEntryId(source.callsiteId ?? source.id, callsiteIndex);
  const callsitePath = getEntryCallsitePath(source, callsiteId);
  const args = Array.isArray(source.args) ? source.args : [];
  const meta = getStructuralMeta(source.meta, callsitePath);
  const staticEntry = {
    id: callsiteId,
    callsiteId,
    callsiteIndex,
    callsitePath,
    definition: Object.prototype.hasOwnProperty.call(source, "definition")
      ? source.definition
      : null,
    args,
    meta,
  };
  staticEntry.staticState = getOrCreateStaticState(owner, staticEntry.definition, args, meta, staticEntry);
  return staticEntry;
}

function getOrCreateStaticEntries(owner) {
  if (!owner) {
    return [];
  }
  if (!owner.__litsxStructuralStaticEntries) {
    const entries = resolveHostEntries(
      owner,
      owner.structuralStaticEntries ?? owner.__litsxStaticStructuralEntries ?? [],
    );
    Object.defineProperty(owner, "__litsxStructuralStaticEntries", {
      value: entries.map((entry, index) => normalizeStaticEntry(owner, entry, index)),
      configurable: true,
    });
  }
  return owner.__litsxStructuralStaticEntries;
}

export function resolveStructuralStaticEntry(owner, callsiteIndex, callsiteId, definition, args = [], meta = {}) {
  const entries = getOrCreateStaticEntries(owner);
  const existing = entries.find((entry) => entry.callsiteId === callsiteId);
  const callsitePath = normalizeHookPath(meta?.callsitePath ?? [callsiteId]);
  const nextMeta = getStructuralMeta(meta, callsitePath);
  const entry = existing ?? normalizeStaticEntry(owner, {
    id: callsiteId,
    callsiteId,
    callsiteIndex,
    callsitePath,
    definition,
    args,
    meta: nextMeta,
  }, callsiteIndex);
  if (!existing) {
    entries[callsiteIndex] = entry;
  }

  entry.args = Array.isArray(args) ? args : entry.args;
  entry.meta = nextMeta;
  const use = getDefinitionUse(definition);
  const state = {
    static: entry.staticState,
    instance: undefined,
  };
  if (!use) {
    return entry.staticState;
  }
  if (callsLegacyUse(use)) {
    return use(owner, state, entry.args, entry.meta, entry);
  }
  if (callsInjectedHostUse(use)) {
    return use(owner, ...entry.args, state, entry.meta, entry);
  }
  return use(...entry.args, state, entry.meta, entry);
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

    __litsxReadStructuralEntry(index, args, meta) {
      return getOrCreateHostRuntime(this).read(index, args, meta);
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
