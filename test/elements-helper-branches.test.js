import assert from "node:assert/strict";
import { describe, it } from "vitest";
import {
  assignShadowRootRegistry,
  attachScopedShadowRoot,
  clearHydrationRenderBefore,
  createPlatformScopedRegistry,
  cssTextFromStyle,
  dedupeMixin,
  defineScopedElements,
  hasHydratableLitMarkers,
  hasScopedElements,
  initializeShadowRootRegistry,
  isLitsxScopedRegistry,
  isPlainObject,
  isPlatformScopedRegistry,
  isUsableScopedRegistry,
  prepareLitHydration,
  syncShadowRootCreationScope,
} from "../packages/core/src/elements/index.js";

describe("core element helper branches", () => {
  it("classifies registry and plain-object shapes", () => {
    const litsx = { _getDefinition() {} };
    assert.strictEqual(isLitsxScopedRegistry(litsx), true);
    assert.strictEqual(isLitsxScopedRegistry(null), false);
    assert.strictEqual(isUsableScopedRegistry(litsx), true);
    assert.strictEqual(isUsableScopedRegistry({}), false);
    assert.strictEqual(isPlatformScopedRegistry(null), false);
    assert.strictEqual(isPlainObject({}), true);
    assert.strictEqual(isPlainObject(Object.create(null)), false);
    assert.strictEqual(isPlainObject([]), false);
    assert.strictEqual(isPlainObject(null), false);
  });

  it("creates platform registries when constructible and tolerates failures", () => {
    const previous = globalThis.CustomElementRegistry;
    try {
      delete globalThis.CustomElementRegistry;
      assert.strictEqual(createPlatformScopedRegistry(), null);
      class Registry {}
      globalThis.CustomElementRegistry = Registry;
      const registry = createPlatformScopedRegistry();
      assert.ok(registry instanceof Registry);
      assert.strictEqual(isPlatformScopedRegistry(registry), true);
      globalThis.CustomElementRegistry = class { constructor() { throw new Error("blocked"); } };
      assert.strictEqual(createPlatformScopedRegistry(), null);
    } finally {
      if (previous === undefined) delete globalThis.CustomElementRegistry;
      else globalThis.CustomElementRegistry = previous;
    }
  });

  it("defines valid scoped elements and rejects conflicting constructors", () => {
    class One {}
    class Two {}
    const definitions = new Map();
    const registry = {
      get: (name) => definitions.get(name),
      define(name, ctor) { definitions.set(name, ctor); },
    };
    assert.strictEqual(defineScopedElements(registry, { "": One, invalid: null, "x-one": One }), registry);
    assert.strictEqual(definitions.get("x-one"), One);
    defineScopedElements(registry, { "x-one": One });
    assert.throws(() => defineScopedElements(registry, { "x-one": Two }), /cannot redefine/);
    assert.strictEqual(defineScopedElements(registry).get("missing"), undefined);
  });

  it("attaches roots using unscoped, legacy, current, and fallback APIs", () => {
    const previousRegistry = globalThis.CustomElementRegistry;
    const previousRoot = globalThis.ShadowRoot;
    class Registry {}
    const registry = new Registry();
    const calls = [];
    const host = { attachShadow(options) { calls.push(options); return { options }; } };
    try {
      globalThis.CustomElementRegistry = Registry;
      delete globalThis.ShadowRoot;
      assert.deepEqual(attachScopedShadowRoot(host, { mode: "open" }, {} ).options, { mode: "open" });
      assert.strictEqual(attachScopedShadowRoot(host, { mode: "open" }, registry).options.registry, registry);

      globalThis.ShadowRoot = class {};
      Object.defineProperty(globalThis.ShadowRoot.prototype, "customElementRegistry", { value: null });
      assert.strictEqual(attachScopedShadowRoot(host, { mode: "closed" }, registry).options.customElementRegistry, registry);

      let attempt = 0;
      const fallbackHost = {
        shadowRoot: null,
        attachShadow(options) {
          attempt += 1;
          if (attempt === 1) throw new Error("new API rejected");
          return { options };
        },
      };
      assert.strictEqual(attachScopedShadowRoot(fallbackHost, { mode: "open" }, registry).options.customElements, registry);
      const attachedHost = { ...fallbackHost, shadowRoot: {}, attachShadow() { throw new Error("fatal"); } };
      assert.throws(() => attachScopedShadowRoot(attachedHost, {}, registry), /fatal/);
    } finally {
      if (previousRegistry === undefined) delete globalThis.CustomElementRegistry;
      else globalThis.CustomElementRegistry = previousRegistry;
      if (previousRoot === undefined) delete globalThis.ShadowRoot;
      else globalThis.ShadowRoot = previousRoot;
    }
  });

  it("assigns or initializes registry aliases despite readonly properties", () => {
    const registry = {};
    const root = {};
    Object.defineProperty(root, "registry", { set() { throw new Error("readonly"); }, configurable: true });
    assignShadowRootRegistry(root, registry);
    assert.strictEqual(root.customElements, registry);
    assert.strictEqual(root.customElementRegistry, registry);
    assert.doesNotThrow(() => initializeShadowRootRegistry(null, registry));
    assert.doesNotThrow(() => initializeShadowRootRegistry(root, null));

    let initialized = 0;
    const native = { initialize(value) { initialized += 1; assert.strictEqual(value, root); } };
    initializeShadowRootRegistry(root, native);
    assert.strictEqual(initialized, 1);
    const fallback = { initialize() { throw new Error("unsupported"); } };
    initializeShadowRootRegistry(root, fallback);
    assert.strictEqual(root.customElements, fallback);
  });

  it("normalizes styles and deduplicates independently created mixins", () => {
    assert.strictEqual(cssTextFromStyle(null), "");
    assert.strictEqual(cssTextFromStyle({ cssText: ":host{}" }), ":host{}");
    assert.strictEqual(cssTextFromStyle(42), "42");
    let applications = 0;
    const mixin = dedupeMixin((Base) => {
      applications += 1;
      return class extends Base {};
    });
    class Base {}
    const Mixed = mixin(Base);
    assert.strictEqual(mixin(Mixed), Mixed);
    assert.strictEqual(applications, 1);
    assert.notStrictEqual(dedupeMixin((Value) => class extends Value {})(Mixed), Mixed);
  });

  it("detects scoped declarations and hydration comment markers", () => {
    assert.strictEqual(hasScopedElements(null), false);
    assert.strictEqual(hasScopedElements({ constructor: { elements: {} } }), true);
    assert.strictEqual(hasScopedElements({ constructor: { elements: null, scopedElements: {} } }), true);
    assert.strictEqual(hasScopedElements({ constructor: {} }), false);
    assert.strictEqual(hasHydratableLitMarkers(null), false);
    assert.strictEqual(hasHydratableLitMarkers({ childNodes: [{ nodeType: 1 }, { nodeType: 8, data: "other" }] }), false);
    assert.strictEqual(hasHydratableLitMarkers({ childNodes: [{ nodeType: 8, data: "lit-part 1" }] }), true);
    assert.strictEqual(hasHydratableLitMarkers({ childNodes: [{ nodeType: 8 }] }), false);
  });

  it("prepares, clears, and synchronizes hydration render options", () => {
    const firstChild = {};
    const host = { renderOptions: {}, _$AG: false, _$needsHydration: false };
    prepareLitHydration(host, { firstChild });
    assert.strictEqual(host.renderOptions.renderBefore, firstChild);
    assert.strictEqual(host._$AG, true);
    clearHydrationRenderBefore(host);
    assert.strictEqual(host.renderOptions.renderBefore, undefined);
    assert.strictEqual(host._$AG, false);
    clearHydrationRenderBefore(host);

    const imported = [];
    const ownerDocument = { importNode(node, options) { imported.push(options); return node; } };
    const root = { ownerDocument, firstChild };
    const registry = { initialize() {} };
    syncShadowRootCreationScope(host, root, registry);
    const firstScope = host.renderOptions.creationScope;
    assert.ok(firstScope);
    assert.strictEqual(firstScope.importNode({}, true) != null, true);
    assert.strictEqual(imported[0].selfOnly, false);
    syncShadowRootCreationScope(host, root, registry);
    assert.strictEqual(host.renderOptions.creationScope, firstScope);

    const legacyRoot = { importNode() {}, firstChild: null };
    syncShadowRootCreationScope(host, legacyRoot, {});
    assert.strictEqual(host.renderOptions.creationScope, legacyRoot);
    syncShadowRootCreationScope(host, {}, null);
    assert.strictEqual(host.renderOptions.creationScope, legacyRoot);
    assert.doesNotThrow(() => syncShadowRootCreationScope({}, root, registry));
  });
});
