import assert from "assert";
import { nothing } from "lit";
import { PartType } from "lit/directive.js";
import { beforeEach, describe, expect, it, vi } from "vitest";

const withLightDomCreationContext = vi.fn((scope, callback) => callback());
const createLightDomRegistry = vi.fn(() => ({
  define: vi.fn(),
  get: vi.fn(() => null),
}));
const renderLightDom = vi.fn();

vi.mock("@litsx/scoped-registry-shim", () => ({
  createLightDomRegistry,
  withLightDomCreationContext,
}));

vi.mock("lit/html.js", () => ({
  render: renderLightDom,
}));

describe("runtime renderer context", () => {
  beforeEach(() => {
    withLightDomCreationContext.mockClear();
    createLightDomRegistry.mockClear();
    renderLightDom.mockClear();
  });

  it("wraps direct bound renderer calls in the captured creation context", async () => {
    const { bindRendererContext } = await import("../packages/core/src/rendering.js");

    const host = { constructor: { elements: {} } };
    const renderer = vi.fn((label) => `value:${label}`);
    const bound = bindRendererContext(host, renderer);

    const result = bound("from-host");

    assert.strictEqual(result, "value:from-host");
    expect(withLightDomCreationContext).toHaveBeenCalledTimes(1);
    expect(withLightDomCreationContext).toHaveBeenCalledWith(host, expect.any(Function));
    expect(renderer).toHaveBeenCalledWith("from-host");
  });

  it("returns non-function renderers unchanged", async () => {
    const { bindRendererContext } = await import("../packages/core/src/rendering.js");

    assert.strictEqual(bindRendererContext(null, "plain"), "plain");
    expect(withLightDomCreationContext).not.toHaveBeenCalled();
  });

  it("captures projected render context from render options and normalizes nullish values", async () => {
    const { bindRendererContext, invokeRenderer } = await import("../packages/core/src/rendering.js");

    const creationScope = { kind: "scope" };
    const host = {
      renderOptions: { creationScope },
    };
    const renderer = vi.fn(() => null);
    const bound = bindRendererContext(host, renderer, { projected: true });

    const rendered = invokeRenderer(bound, "alpha");

    assert.strictEqual(rendered.value, nothing);
    assert.strictEqual(rendered.context.host, host);
    assert.strictEqual(rendered.context.creationScope, creationScope);
    assert.strictEqual(rendered.projected, true);
    expect(withLightDomCreationContext).not.toHaveBeenCalled();
    expect(renderer).toHaveBeenCalledWith("alpha");
  });

  it("captures shadow root creation scopes when explicit render options are missing", async () => {
    const { bindRendererContext, invokeRenderer } = await import("../packages/core/src/rendering.js");

    const shadowRoot = {
      importNode() {},
    };
    const host = { shadowRoot };
    const bound = bindRendererContext(host, () => "ok");
    const rendered = invokeRenderer(bound);

    assert.strictEqual(rendered.context.creationScope, shadowRoot);
    assert.strictEqual(rendered.projected, false);
  });

  it("refreshes renderer creation scope when it becomes available after binding", async () => {
    const { bindRendererContext, invokeRenderer, renderWithRendererContext } = await import("../packages/core/src/rendering.js");

    const registry = {
      define() {},
      get() {},
    };
    const creationScope = { registry };
    const host = {};
    const renderer = vi.fn(() => "value");
    const bound = bindRendererContext(host, renderer, { projected: true });

    host.renderOptions = { creationScope };

    const rendered = invokeRenderer(bound);
    const render = vi.fn();
    const container = {};

    renderWithRendererContext(render, container, rendered.value, rendered.context);

    assert.strictEqual(rendered.context.creationScope, creationScope);
    expect(withLightDomCreationContext).not.toHaveBeenCalled();
    expect(render).toHaveBeenCalledWith("value", container, {
      host,
      creationScope,
      renderMode: "light",
    });
  });

  it("returns nothing and null context for non-function renderer invocations", async () => {
    const { invokeRenderer } = await import("../packages/core/src/rendering.js");

    const rendered = invokeRenderer("plain");

    assert.strictEqual(rendered.value, nothing);
    assert.strictEqual(rendered.context, null);
    assert.strictEqual(rendered.projected, false);
  });

  it("invokes unbound renderers without entering light-dom creation context", async () => {
    const { invokeRenderer } = await import("../packages/core/src/rendering.js");

    const rendered = invokeRenderer(() => "plain");

    assert.strictEqual(rendered.value, "plain");
    assert.strictEqual(rendered.context, null);
    expect(withLightDomCreationContext).not.toHaveBeenCalled();
  });

  it("merges host and creation scope into contextual renders", async () => {
    const { renderWithRendererContext } = await import("../packages/core/src/rendering.js");

    const render = vi.fn();
    const container = { id: "container" };
    const host = { id: "host" };
    const creationScope = { id: "scope" };

    renderWithRendererContext(
      render,
      container,
      "value",
      { host, creationScope },
      { mode: "open" }
    );

    expect(withLightDomCreationContext).toHaveBeenCalledWith(host, expect.any(Function));
    expect(render).toHaveBeenCalledWith("value", container, {
      mode: "open",
      host,
      creationScope,
      renderMode: "light",
    });
  });

  it("syncs projected hosts, toggles visibility, and renders nothing when hidden", async () => {
    const { syncRendererHost } = await import("../packages/core/src/rendering.js");

    function ContextualHost() {}
    ContextualHost.scopedElements = {
      "fancy-button": class FancyButton {},
    };
    const contextualHost = {
      constructor: ContextualHost,
    };
    const host = {};
    const render = vi.fn();

    syncRendererHost(
      host,
      {
        value: "visible-value",
        context: {
          host: contextualHost,
          creationScope: { id: "scope" },
        },
      },
      { render, visible: false }
    );

    assert.strictEqual(host.hidden, true);
    expect(withLightDomCreationContext).toHaveBeenCalledWith(
      contextualHost,
      expect.any(Function)
    );
    expect(render).toHaveBeenCalledWith(nothing, host, {
      host: contextualHost,
      creationScope: { id: "scope" },
      renderMode: "light",
    });
  });

  it("does not initialize an empty hidden renderer host before context is available", async () => {
    const { syncRendererHost } = await import("../packages/core/src/rendering.js");

    const host = {};
    const render = vi.fn();

    syncRendererHost(host, null, { render, visible: false });

    assert.strictEqual(host.hidden, true);
    expect(render).not.toHaveBeenCalled();
    expect(withLightDomCreationContext).not.toHaveBeenCalled();
  });

  it("uses external scoped creation scopes without connecting light-dom registries", async () => {
    const { bindRendererContext, invokeRenderer, renderWithRendererContext } = await import("../packages/core/src/rendering.js");

    function ContextualHost() {}
    ContextualHost.scopedElements = {
      "fancy-button": class FancyButton {},
    };
    const registry = {
      define() {},
      get() {},
    };
    const creationScope = { registry };
    const contextualHost = {
      constructor: ContextualHost,
      renderOptions: { creationScope },
    };
    const renderer = vi.fn(() => "value");
    const bound = bindRendererContext(contextualHost, renderer, { projected: true });
    const rendered = invokeRenderer(bound);
    const render = vi.fn();
    const container = {};

    renderWithRendererContext(render, container, rendered.value, rendered.context);

    assert.strictEqual(rendered.value, "value");
    expect(withLightDomCreationContext).not.toHaveBeenCalled();
    expect(render).toHaveBeenCalledWith("value", container, {
      host: contextualHost,
      creationScope,
      renderMode: "light",
    });
  });

  it("renders projected external-scope output through the projected host registry", async () => {
    const { syncRendererHost } = await import("../packages/core/src/rendering.js");

    function ContextualHost() {}
    ContextualHost.scopedElements = {
      "fancy-button": class FancyButton {},
    };
    const registry = {
      define() {},
      get() {},
    };
    const contextualHost = {
      constructor: ContextualHost,
    };
    const shadowRoot = {};
    const mountHost = {
      style: {},
      attachShadow: vi.fn(() => shadowRoot),
    };
    const projectedHost = {
      ownerDocument: {
        createElement: vi.fn(() => mountHost),
      },
      appendChild: vi.fn(),
    };
    const render = vi.fn();

    syncRendererHost(
      projectedHost,
      {
        value: "value",
        context: {
          host: contextualHost,
          creationScope: { registry },
          projected: true,
        },
      },
      { render }
    );

    expect(createLightDomRegistry).toHaveBeenCalledWith(shadowRoot, {});
    expect(withLightDomCreationContext).not.toHaveBeenCalled();
    expect(render).toHaveBeenCalledWith("value", shadowRoot, {
      host: contextualHost,
      creationContextHost: projectedHost,
      renderMode: "shadow",
    });
  });

  it("renders projected output directly in light DOM when the host opts into direct projection", async () => {
    const { syncRendererHost } = await import("../packages/core/src/rendering.js");

    function ContextualHost() {}
    ContextualHost.scopedElements = {
      "fancy-button": class FancyButton {},
    };
    const contextualHost = {
      constructor: ContextualHost,
    };
    const projectedHost = {
      getAttribute(name) {
        return name === "data-litsx-projected-root" ? "light" : null;
      },
    };
    const render = vi.fn();

    syncRendererHost(
      projectedHost,
      {
        value: "value",
        context: {
          host: contextualHost,
          creationScope: { id: "scope" },
          projected: true,
        },
      },
      { render }
    );

    expect(createLightDomRegistry).not.toHaveBeenCalled();
    expect(render).toHaveBeenCalledWith("value", projectedHost, {
      host: contextualHost,
      renderMode: "light",
    });
    expect(withLightDomCreationContext).toHaveBeenCalledWith(
      contextualHost,
      expect.any(Function)
    );
  });

  it("skips renderer host sync when host or render function is missing", async () => {
    const { syncRendererHost } = await import("../packages/core/src/rendering.js");

    syncRendererHost(null, { value: "x", context: null }, { render: vi.fn() });
    syncRendererHost({}, { value: "x", context: null }, { render: null });

    expect(renderLightDom).not.toHaveBeenCalled();
  });

  it("rejects renderRendererCall outside child parts", async () => {
    const { renderRendererCall } = await import("../packages/core/src/rendering.js");
    const result = renderRendererCall(() => "value");

    const DirectiveCtor = result._$litDirective$;

    assert.throws(
      () => new DirectiveCtor({ type: PartType.ATTRIBUTE }),
      /renderRendererCall can only be used in child expressions/
    );
  });

  it("creates and reuses a contents host for renderRendererCall updates", async () => {
    const { renderRendererCall } = await import("../packages/core/src/rendering.js");
    const result = renderRendererCall((label) => `value:${label}`, "alpha");
    const DirectiveCtor = result._$litDirective$;
    const instance = new DirectiveCtor({ type: PartType.CHILD });
    const directiveHost = { style: {} };
    const createElement = vi.fn(() => directiveHost);
    const part = {
      options: {
        host: {
          ownerDocument: {
            createElement,
          },
        },
      },
    };

    const first = instance.update(part, result.values);
    const second = instance.update(part, result.values);

    assert.strictEqual(first, directiveHost);
    assert.strictEqual(second, directiveHost);
    assert.strictEqual(directiveHost.style.display, "contents");
    expect(createElement).toHaveBeenCalledTimes(1);
    expect(renderLightDom).toHaveBeenCalledTimes(2);

    instance.disconnected();
    expect(renderLightDom).toHaveBeenLastCalledWith(nothing, directiveHost);
  });

  it("returns nothing when renderRendererCall cannot create a host and no-ops on disconnect", async () => {
    const { renderRendererCall } = await import("../packages/core/src/rendering.js");
    const result = renderRendererCall(() => "value");
    const DirectiveCtor = result._$litDirective$;
    const instance = new DirectiveCtor({ type: PartType.CHILD });

    const updated = instance.update({ options: { host: { ownerDocument: null } } }, result.values);
    instance.disconnected();

    assert.strictEqual(updated, nothing);
    expect(renderLightDom).not.toHaveBeenCalled();
  });
});
