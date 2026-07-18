const EMPTY_ARGS = Object.freeze([]);
const STRUCTURAL_HOOK_DEFINITION = Symbol.for("litsx.structuralHookDefinition");
export const STRUCTURAL_HOOK_ENTRIES = Symbol.for("litsx.structuralHookEntries");
const STRUCTURAL_STATIC_STATE = Symbol.for("litsx.structuralStaticState");
const STRUCTURAL_HOST_ACCESSORS = Symbol.for("litsx.structuralHostAccessors");
const STRUCTURAL_HOST_PROPS = Symbol.for("litsx.structuralHostProps");
const LIFECYCLE_METHODS = [
  "connectedCallback",
  "disconnectedCallback",
  "attributeChangedCallback",
  "formAssociatedCallback",
  "formDisabledCallback",
  "formResetCallback",
  "formStateRestoreCallback",
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

function getDefinitionAccessors(definition) {
  const resolvedDefinition = resolveStructuralDefinition(definition);
  return isObject(resolvedDefinition) && typeof resolvedDefinition.accessors === "function"
    ? resolvedDefinition.accessors
    : null;
}

function getDefinitionProps(definition) {
  const resolvedDefinition = resolveStructuralDefinition(definition);
  if (!isObject(resolvedDefinition)) {
    return null;
  }

  if (typeof resolvedDefinition.props === "function") {
    return resolvedDefinition.props;
  }

  return isObject(resolvedDefinition.props)
    ? () => resolvedDefinition.props
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
    structuralState.instance = createState(host, args, staticState, meta, entry);
  }

  return structuralState;
}

function normalizeAccessorDescriptor(name, descriptor) {
  if (!isObject(descriptor)) {
    throw new TypeError(
      `Structural accessor "${name}" must be an object with get and/or set functions.`
    );
  }

  const hasGet = typeof descriptor.get === "function";
  const hasSet = typeof descriptor.set === "function";

  if (!hasGet && !hasSet) {
    throw new TypeError(
      `Structural accessor "${name}" must define at least a get() or set() function.`
    );
  }

  if (descriptor.get != null && !hasGet) {
    throw new TypeError(`Structural accessor "${name}" received a non-function get descriptor.`);
  }

  if (descriptor.set != null && !hasSet) {
    throw new TypeError(`Structural accessor "${name}" received a non-function set descriptor.`);
  }

  return {
    get: hasGet ? descriptor.get : undefined,
    set: hasSet ? descriptor.set : undefined,
  };
}

function resolveEntryAccessors(host, entry) {
  const accessorsFactory = getDefinitionAccessors(entry?.definition);
  if (!accessorsFactory) {
    return {};
  }

  const rawAccessors = accessorsFactory(host, entry.state, entry.meta, entry);
  if (rawAccessors == null) {
    return {};
  }
  if (!isObject(rawAccessors)) {
    throw new TypeError("Structural hook accessors() must return an object of accessor descriptors.");
  }

  const accessors = {};
  for (const name of Object.keys(rawAccessors)) {
    accessors[name] = normalizeAccessorDescriptor(name, rawAccessors[name]);
  }
  return accessors;
}

function isPlainObject(value) {
  return value !== null &&
    typeof value === "object" &&
    Object.getPrototypeOf(value) === Object.prototype;
}

function mergeStructuralProps(base, override) {
  if (!override) {
    return base;
  }

  const next = { ...(base || {}) };
  for (const key of Object.keys(override)) {
    const baseEntry = next[key];
    const overrideEntry = override[key];

    if (isPlainObject(baseEntry) && isPlainObject(overrideEntry)) {
      next[key] = {
        ...baseEntry,
        ...overrideEntry,
      };
    } else {
      next[key] = overrideEntry;
    }
  }

  return next;
}

function resolveEntryProps(entry) {
  const propsFactory = getDefinitionProps(entry?.definition);
  if (!propsFactory) {
    return null;
  }

  const rawProps = propsFactory(entry.args ?? EMPTY_ARGS, entry.meta ?? {}, entry);
  if (rawProps == null) {
    return null;
  }
  if (!isObject(rawProps)) {
    throw new TypeError("Structural hook props() must return an object of property descriptors.");
  }
  return rawProps;
}

function getHostAccessorRegistry(host) {
  if (!isObject(host)) {
    return null;
  }

  if (!Object.prototype.hasOwnProperty.call(host, STRUCTURAL_HOST_ACCESSORS)) {
    Object.defineProperty(host, STRUCTURAL_HOST_ACCESSORS, {
      value: new Map(),
      configurable: true,
    });
  }

  return host[STRUCTURAL_HOST_ACCESSORS];
}

function getLatestAccessorOwner(owners) {
  let activeOwner = null;
  let activeOrder = -1;

  for (const owner of owners.values()) {
    if (owner.order >= activeOrder) {
      activeOrder = owner.order;
      activeOwner = owner;
    }
  }

  return activeOwner;
}

function syncInstalledHostAccessor(host, name, registryEntry) {
  const activeOwner = getLatestAccessorOwner(registryEntry.owners);
  if (!activeOwner) {
    delete host[name];
    return false;
  }

  if (typeof registryEntry.getWrapper !== "function") {
    registryEntry.getWrapper = function structuralAccessorGetter() {
      const currentOwner = getLatestAccessorOwner(registryEntry.owners);
      const getter = currentOwner?.descriptor?.get;
      return typeof getter === "function" ? getter() : undefined;
    };
  }

  if (typeof registryEntry.setWrapper !== "function") {
    registryEntry.setWrapper = function structuralAccessorSetter(value) {
      const currentOwner = getLatestAccessorOwner(registryEntry.owners);
      const setter = currentOwner?.descriptor?.set;
      if (typeof setter === "function") {
        setter(value);
      }
    };
  }

  Object.defineProperty(host, name, {
    get: typeof activeOwner.descriptor.get === "function"
      ? registryEntry.getWrapper
      : undefined,
    set: typeof activeOwner.descriptor.set === "function"
      ? registryEntry.setWrapper
      : undefined,
    configurable: true,
  });

  return true;
}

function removeEntryAccessor(host, entry, name) {
  const registry = getHostAccessorRegistry(host);
  const registryEntry = registry?.get(name);
  if (!registryEntry) {
    return;
  }

  registryEntry.owners.delete(entry.callsiteId ?? entry.id);
  const stillInstalled = syncInstalledHostAccessor(host, name, registryEntry);
  if (!stillInstalled) {
    registry.delete(name);
  }
}

function syncEntryAccessors(host, entry) {
  const registry = getHostAccessorRegistry(host);
  if (!registry || !entry) {
    return;
  }

  const nextAccessors = resolveEntryAccessors(host, entry);
  const nextNames = Object.keys(nextAccessors);

  for (const existingName of entry.accessorNames || []) {
    if (!nextNames.includes(existingName)) {
      removeEntryAccessor(host, entry, existingName);
    }
  }

  for (const name of nextNames) {
    let registryEntry = registry.get(name);

    if (!registryEntry) {
      const ownDescriptor = Object.getOwnPropertyDescriptor(host, name);
      if (ownDescriptor) {
        throw new TypeError(
          `Structural hook cannot install accessor "${name}" because the host already defines that own property.`
        );
      }

      registryEntry = {
        owners: new Map(),
        getWrapper: null,
        setWrapper: null,
      };
      registry.set(name, registryEntry);
    }

    registryEntry.owners.set(entry.callsiteId ?? entry.id, {
      order: entry.callsiteIndex,
      descriptor: nextAccessors[name],
    });
    syncInstalledHostAccessor(host, name, registryEntry);
  }

  entry.accessors = nextAccessors;
  entry.accessorNames = nextNames;
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
    accessors: {},
    accessorNames: [],
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
    for (const entry of this.entries) {
      syncEntryAccessors(this.host, entry);
    }
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
      refreshEntryArgsAndMeta(existing, entry?.args, entry?.meta);
      syncEntryAccessors(this.host, existing);
      return existing;
    }

    const callsiteId = entry?.callsiteId ?? entry?.id;
    if (typeof callsiteId === "string") {
      const existingIndex = this.findEntryIndexByCallsiteId(callsiteId);
      if (existingIndex >= 0) {
        const existingById = this.entries[existingIndex];
        refreshEntryArgsAndMeta(existingById, entry?.args, entry?.meta);
        syncEntryAccessors(this.host, existingById);
        return existingById;
      }
    }

    const normalized = normalizeStructuralEntry(this.host, entry, index);
    if (existing) {
      this.entries.push(normalized);
    } else {
      this.entries[index] = normalized;
    }
    syncEntryAccessors(this.host, normalized);
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

      return middleware(this.host, entry.state, next, args, entry.meta, entry);
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

function getStructuralPropsCache(owner) {
  if (!owner) {
    return null;
  }
  if (!Object.prototype.hasOwnProperty.call(owner, STRUCTURAL_HOST_PROPS)) {
    Object.defineProperty(owner, STRUCTURAL_HOST_PROPS, {
      value: new Map(),
      configurable: true,
    });
  }
  return owner[STRUCTURAL_HOST_PROPS];
}

function getStructuralClassEntries(owner) {
  return resolveHostEntries(
    owner,
    owner?.structuralEntries ?? owner?.__litsxStructuralEntries ?? [],
  ).map((entry, index) => normalizeStaticEntry(owner, entry, index));
}

export function resolveStructuralProps(owner, base = null) {
  if (!owner) {
    return base ?? {};
  }

  const cache = getStructuralPropsCache(owner);
  const cacheKey = base == null ? "__litsx:no-base" : base;
  if (cache?.has(cacheKey)) {
    return cache.get(cacheKey);
  }

  let mergedProps = base;
  const entries = [
    ...getStructuralClassEntries(owner),
    ...getOrCreateStaticEntries(owner),
  ].sort((left, right) => (left.callsiteIndex ?? 0) - (right.callsiteIndex ?? 0));

  for (const entry of entries) {
    mergedProps = mergeStructuralProps(mergedProps, resolveEntryProps(entry));
  }

  const result = mergedProps ?? {};
  cache?.set(cacheKey, result);
  return result;
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
  return use(owner, state, entry.args, entry.meta, entry);
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

    formAssociatedCallback(...args) {
      return getOrCreateHostRuntime(this).formAssociatedCallback(args, () =>
        typeof super.formAssociatedCallback === "function" ? super.formAssociatedCallback(...args) : undefined
      );
    }

    formDisabledCallback(...args) {
      return getOrCreateHostRuntime(this).formDisabledCallback(args, () =>
        typeof super.formDisabledCallback === "function" ? super.formDisabledCallback(...args) : undefined
      );
    }

    formResetCallback(...args) {
      return getOrCreateHostRuntime(this).formResetCallback(args, () =>
        typeof super.formResetCallback === "function" ? super.formResetCallback(...args) : undefined
      );
    }

    formStateRestoreCallback(...args) {
      return getOrCreateHostRuntime(this).formStateRestoreCallback(args, () =>
        typeof super.formStateRestoreCallback === "function" ? super.formStateRestoreCallback(...args) : undefined
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
