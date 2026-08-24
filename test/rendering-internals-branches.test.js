import assert from "node:assert/strict";
import { html, nothing } from "lit";
import { describe, it } from "vitest";
import {
  __litsxScopedTemplate,
  __litsxServerComponentCall,
} from "../packages/core/src/elements/index.js";
import {
  assignShadowRootRegistry,
  attachRendererShadowRoot,
  bindRendererContext,
  captureCreationScope,
  createPlatformScopedRegistry,
  defineScopedElements,
  getContextualElements,
  getContextualStyles,
  getScopedRegistry,
  hasExternalScopedRegistry,
  hasSameElementDefinitions,
  invokeRenderer,
  isShadowRootContainer,
  prefersDirectProjectedLightDom,
  resolveContextCreationScope,
  resolveRendererSsrValueWithContext,
  resolveRenderedValueForSsr,
  resolveStrictSyncSsrRenderableValue,
  shouldUseProjectedLightDom,
  renderWithRendererContext,
  syncRendererHost,
} from "../packages/core/src/rendering.js";

describe("renderer internal branch behavior", () => {
  it("recursively validates strict synchronous SSR values", () => {
    assert.equal(resolveStrictSyncSsrRenderableValue("plain"), "plain");
    assert.deepEqual(resolveStrictSyncSsrRenderableValue([1, [2]]), [1, [2]]);
    const template = html`<p>${["ok", html`<b>${1}</b>`]}</p>`;
    const resolved = resolveStrictSyncSsrRenderableValue(template);
    assert.notEqual(resolved, template);
    assert.deepEqual(resolved.values[0][0], "ok");
    assert.throws(() => resolveStrictSyncSsrRenderableValue(__litsxServerComponentCall(() => null, {})), /SSR renderer props/);
    assert.throws(() => resolveStrictSyncSsrRenderableValue(__litsxScopedTemplate(html`x`, {})), /SSR renderer props/);

    assert.equal(resolveRendererSsrValueWithContext("plain", null), "plain");
    assert.deepEqual(resolveRendererSsrValueWithContext([1, 2], {}), [1, 2]);
    assert.notEqual(resolveRendererSsrValueWithContext(template, {}), template);
    assert.throws(() => resolveRendererSsrValueWithContext(__litsxScopedTemplate(html`x`, {}), {}), /SSR renderer props/);
  });

  it("captures creation scopes, contextual elements, and styles", () => {
    const creationScope = { importNode() {} };
    assert.equal(captureCreationScope(null), null);
    assert.equal(captureCreationScope("host"), null);
    assert.equal(captureCreationScope({ renderOptions: { creationScope } }), creationScope);
    assert.equal(captureCreationScope({ shadowRoot: creationScope }), creationScope);
    assert.equal(captureCreationScope({ shadowRoot: {} }), null);

    class ScopedHost {}
    ScopedHost.scopedElements = { "x-one": class {} };
    ScopedHost.elementStyles = ["one"];
    assert.equal(getContextualElements(null), null);
    assert.equal(getContextualElements({ host: { constructor: {} } }), null);
    assert.equal(getContextualElements({ host: new ScopedHost() }), ScopedHost.scopedElements);
    assert.equal(getContextualElements({ host: { constructor: class {} } }), null);
    assert.deepEqual(getContextualStyles({ host: new ScopedHost() }), ["one"]);
    assert.deepEqual(getContextualStyles(null), []);
  });

  it("compares scoped definitions and manages registry edge cases", () => {
    const One = class {};
    assert.equal(hasSameElementDefinitions(null, null), true);
    assert.equal(hasSameElementDefinitions({}, { "x-one": One }), false);
    assert.equal(hasSameElementDefinitions({ "x-one": One }, { "x-one": One }), true);
    assert.equal(hasSameElementDefinitions({ "x-one": class {} }, { "x-one": One }), false);

    const previousRegistry = globalThis.CustomElementRegistry;
    try {
      globalThis.CustomElementRegistry = undefined;
      assert.equal(createPlatformScopedRegistry(), null);
      globalThis.CustomElementRegistry = class { constructor() { throw new Error("nope"); } };
      assert.equal(createPlatformScopedRegistry(), null);
      globalThis.CustomElementRegistry = class {};
      assert.ok(createPlatformScopedRegistry());
    } finally {
      globalThis.CustomElementRegistry = previousRegistry;
    }

    const definitions = new Map();
    const registry = {
      get: (name) => definitions.get(name),
      define: (name, ctor) => definitions.set(name, ctor),
    };
    defineScopedElements(registry, { "": One, bad: 1, "x-one": One });
    defineScopedElements(registry, { "x-one": One });
    assert.throws(() => defineScopedElements(registry, { "x-one": class {} }), /cannot redefine/);
    assert.equal(definitions.get("x-one"), One);
  });

  it("attaches registries and resolves supported registry aliases", () => {
    const attachCalls = [];
    const host = { attachShadow(options) { attachCalls.push(options); return {}; } };
    assert.deepEqual(attachRendererShadowRoot(host, null), {});
    const registry = { define() {}, get() {} };
    assert.deepEqual(attachRendererShadowRoot(host, registry), {});
    assert.deepEqual(attachCalls[0], { mode: "open" });
    assert.equal(attachCalls[1].customElements, registry);
    assert.equal(attachCalls[1].registry, registry);

    const shadow = {};
    Object.defineProperty(shadow, "registry", { set() { throw new Error("readonly"); } });
    assignShadowRootRegistry(shadow, registry);
    assert.equal(shadow.customElements, registry);
    assert.equal(shadow.customElementRegistry, registry);
    assert.equal(getScopedRegistry(null), null);
    assert.equal(getScopedRegistry({ registry: {} }), null);
    assert.equal(getScopedRegistry({ customElements: registry }), registry);
    assert.equal(hasExternalScopedRegistry({ registry }), true);
    assert.equal(hasExternalScopedRegistry({ registry: { ...registry, _getDefinition() {} } }), false);
  });

  it("resolves and caches projected-light-DOM creation scopes", () => {
    assert.equal(resolveContextCreationScope(null), null);
    assert.equal(resolveContextCreationScope({}), null);
    const direct = { importNode() {} };
    assert.equal(resolveContextCreationScope({ host: {}, creationScope: direct }), direct);
    const context = { host: { renderOptions: { creationScope: direct } } };
    assert.equal(resolveContextCreationScope(context), direct);
    assert.equal(context.creationScope, direct);
    assert.equal(resolveContextCreationScope({ host: {} }), null);

    assert.equal(prefersDirectProjectedLightDom(null), false);
    assert.equal(prefersDirectProjectedLightDom({ getAttribute: () => "light" }), true);
    assert.equal(prefersDirectProjectedLightDom({ getAttribute: () => "shadow" }), false);
    assert.equal(shouldUseProjectedLightDom({}, null), false);
    assert.equal(shouldUseProjectedLightDom({}, { projected: false }), false);
    assert.equal(shouldUseProjectedLightDom({ getAttribute: () => "light" }, { projected: true, host: {} }), true);
    assert.equal(shouldUseProjectedLightDom({}, { projected: true, host: {} }), true);
    assert.equal(shouldUseProjectedLightDom({}, { projected: true, host: {}, creationScope: direct }), false);
    assert.equal(isShadowRootContainer(null), false);
  });

  it("invokes bound renderers through projected, external, and empty contexts", () => {
    assert.equal(bindRendererContext({}, 3), 3);
    const projected = bindRendererContext({}, (value) => value * 2, { projected: true });
    assert.equal(projected(4), 8);
    assert.deepEqual(invokeRenderer(projected, 5), { value: 10, context: projected[Object.getOwnPropertySymbols(projected)[0]], projected: true });

    const registry = { define() {}, get() {} };
    const externalHost = { renderOptions: { creationScope: { registry } } };
    const external = bindRendererContext(externalHost, () => "external");
    assert.equal(external(), "external");
    assert.equal(invokeRenderer(external).value, "external");
    assert.equal(invokeRenderer(() => null).value, nothing);
    assert.equal(invokeRenderer(null).projected, false);
    assert.equal(resolveRenderedValueForSsr(null), nothing);
    assert.equal(resolveRenderedValueForSsr({ value: "ssr" }), "ssr");
  });

  it("routes light rendering options and handles invisible uninitialized hosts", () => {
    const calls = [];
    const render = (value, container, options) => {
      calls.push({ value, container, options });
      return "done";
    };
    const container = {};
    assert.equal(renderWithRendererContext(render, container, "plain", null), "done");
    assert.equal(calls.at(-1).options.renderMode, "light");

    const registry = { define() {}, get() {} };
    const context = { host: {}, creationScope: { registry }, projected: false };
    assert.equal(renderWithRendererContext(render, container, "external", context), "done");
    assert.equal(calls.at(-1).options.creationScope, context.creationScope);

    assert.equal(syncRendererHost(null, null, { render }), undefined);
    assert.equal(syncRendererHost({}, null, { render: null }), undefined);
    const hiddenHost = { hidden: false, getAttribute: () => "light" };
    assert.equal(syncRendererHost(hiddenHost, null, { render, visible: false }), undefined);
    assert.equal(hiddenHost.hidden, true);
  });
});
