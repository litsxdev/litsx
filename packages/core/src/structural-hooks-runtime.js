const STRUCTURAL_HOOK_DEFINITION = Symbol.for("litsx.structuralHookDefinition");

export const STRUCTURAL_HOOKS = Symbol.for("litsx.structuralHooks");

function resolveStructuralDefinition(hook) {
  return typeof hook === "function"
    ? (hook[STRUCTURAL_HOOK_DEFINITION] ?? null)
    : null;
}

function createStructuralHookCallable() {
  return function structuralHookMustBeCompiled() {
    throw new Error(
      "Structural hooks created with defineHook() must be compiled by LitSX before they can be called.",
    );
  };
}

/**
 * Define a function-shaped request for a host capability.
 *
 * The compiler lowers calls to readStructuralHook() and adds every transitively
 * required hook to the generated component's structural mixin plan.
 */
export function defineHook(definition) {
  if (
    definition == null ||
    typeof definition !== "object"
  ) {
    throw new TypeError(
      "defineHook() expects a structural hook definition object.",
    );
  }
  const unsupportedKeys = Object.keys(definition).filter(
    (key) => key !== "mixin" && key !== "use",
  );
  if (unsupportedKeys.length > 0) {
    throw new TypeError(
      `defineHook() received unsupported structural fields: ${unsupportedKeys.join(
        ", ",
      )}. Host behavior must be implemented by mixin.`,
    );
  }
  if (definition.mixin != null && typeof definition.mixin !== "function") {
    throw new TypeError("defineHook() mixin must be a function when provided.");
  }
  if (definition.use != null && typeof definition.use !== "function") {
    throw new TypeError("defineHook() use must be a function when provided.");
  }
  if (definition.mixin == null && definition.use == null) {
    throw new TypeError(
      "defineHook() requires a mixin, a use(...args) reader, or both.",
    );
  }

  const hook = createStructuralHookCallable();
  Object.defineProperty(hook, STRUCTURAL_HOOK_DEFINITION, {
    value: Object.freeze({
      mixin: definition.mixin ?? null,
      use: definition.use ?? null,
    }),
    configurable: false,
  });
  Object.defineProperty(hook, STRUCTURAL_HOOKS, {
    value: [hook],
    writable: true,
    configurable: true,
  });
  return hook;
}

export function isStructuralHook(value) {
  return resolveStructuralDefinition(value) !== null;
}

export function readStructuralHook(hook, args = []) {
  const definition = resolveStructuralDefinition(hook);
  if (!definition) {
    throw new TypeError("Cannot read an unregistered structural hook.");
  }
  if (!definition.use) {
    if (Array.isArray(args) && args.length > 0) {
      throw new TypeError(
        "A mixin-only structural hook does not accept arguments.",
      );
    }
    return undefined;
  }
  return definition.use(...(Array.isArray(args) ? args : []));
}

/**
 * Apply each distinct host-capability mixin once, preserving the first-use
 * order carried by the compiled structural hook list.
 */
export function applyStructuralHooks(Base, hooks = []) {
  const mixins = [];
  const seen = new Set();

  for (const hook of Array.isArray(hooks) ? hooks : []) {
    const mixin = resolveStructuralDefinition(hook)?.mixin;
    if (typeof mixin !== "function" || seen.has(mixin)) {
      continue;
    }
    seen.add(mixin);
    mixins.push(mixin);
  }

  return mixins.reduceRight((CurrentBase, mixin) => {
    const MixedBase = mixin(CurrentBase);
    if (typeof MixedBase !== "function") {
      throw new TypeError("A structural hook mixin must return a class.");
    }
    return MixedBase;
  }, Base);
}
