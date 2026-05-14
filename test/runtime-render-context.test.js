import assert from "assert";
import { nothing } from "lit";
import { PartType } from "lit/directive.js";
import { beforeEach, describe, expect, it, vi } from "vitest";

const withLightDomCreationContext = vi.fn((scope, callback) => callback());
const connectLightDomRegistry = vi.fn();
const renderLightDom = vi.fn();

vi.mock("@litsx/light-dom-registry", () => ({
  connectLightDomRegistry,
  withLightDomCreationContext,
}));

vi.mock("lit/html.js", () => ({
  render: renderLightDom,
}));

describe("runtime renderer context", () => {
  beforeEach(() => {
    withLightDomCreationContext.mockClear();
    connectLightDomRegistry.mockClear();
    renderLightDom.mockClear();
  });

  it("wraps direct bound renderer calls in the captured creation context", async () => {
    const { bindRendererContext } = await import("../packages/litsx/src/runtime-render-context.js");

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
    const { bindRendererContext } = await import("../packages/litsx/src/runtime-render-context.js");

    assert.strictEqual(bindRendererContext(null, "plain"), "plain");
    expect(withLightDomCreationContext).not.toHaveBeenCalled();
  });

  it("captures projected render context from render options and normalizes nullish values", async () => {
    const { bindRendererContext, invokeRenderer } = await import("../packages/litsx/src/runtime-render-context.js");

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
    expect(withLightDomCreationContext).toHaveBeenCalledWith(host, expect.any(Function));
    expect(renderer).toHaveBeenCalledWith("alpha");
  });

  it("captures shadow root creation scopes when explicit render options are missing", async () => {
    const { bindRendererContext, invokeRenderer } = await import("../packages/litsx/src/runtime-render-context.js");

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
    const { bindRendererContext, invokeRenderer, renderWithRendererContext } = await import("../packages/litsx/src/runtime-render-context.js");

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
    });
  });

  it("returns nothing and null context for non-function renderer invocations", async () => {
    const { invokeRenderer } = await import("../packages/litsx/src/runtime-render-context.js");

    const rendered = invokeRenderer("plain");

    assert.strictEqual(rendered.value, nothing);
    assert.strictEqual(rendered.context, null);
    assert.strictEqual(rendered.projected, false);
  });

  it("invokes unbound renderers without entering light-dom creation context", async () => {
    const { invokeRenderer } = await import("../packages/litsx/src/runtime-render-context.js");

    const rendered = invokeRenderer(() => "plain");

    assert.strictEqual(rendered.value, "plain");
    assert.strictEqual(rendered.context, null);
    expect(withLightDomCreationContext).not.toHaveBeenCalled();
  });

  it("merges host and creation scope into contextual renders", async () => {
    const { renderWithRendererContext } = await import("../packages/litsx/src/runtime-render-context.js");

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
    });
  });

  it("syncs projected hosts, toggles visibility, and renders nothing when hidden", async () => {
    const { syncRendererHost } = await import("../packages/litsx/src/runtime-render-context.js");

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
    expect(connectLightDomRegistry).toHaveBeenCalledWith(
      host,
      ContextualHost.scopedElements
    );
    expect(withLightDomCreationContext).toHaveBeenCalledWith(
      contextualHost,
      expect.any(Function)
    );
    expect(render).toHaveBeenCalledWith(nothing, host, {
      host: contextualHost,
      creationScope: { id: "scope" },
    });
  });

  it("does not initialize an empty hidden renderer host before context is available", async () => {
    const { syncRendererHost } = await import("../packages/litsx/src/runtime-render-context.js");

    const host = {};
    const render = vi.fn();

    syncRendererHost(host, null, { render, visible: false });

    assert.strictEqual(host.hidden, true);
    expect(render).not.toHaveBeenCalled();
    expect(withLightDomCreationContext).not.toHaveBeenCalled();
  });

  it("uses external scoped creation scopes without connecting light-dom registries", async () => {
    const { bindRendererContext, invokeRenderer, renderWithRendererContext } = await import("../packages/litsx/src/runtime-render-context.js");

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
    expect(connectLightDomRegistry).not.toHaveBeenCalled();
    expect(render).toHaveBeenCalledWith("value", container, {
      host: contextualHost,
      creationScope,
    });
  });

  it("renders projected external-scope output through the projected host registry", async () => {
    const { syncRendererHost } = await import("../packages/litsx/src/runtime-render-context.js");

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
    const projectedHost = {};
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

    expect(connectLightDomRegistry).toHaveBeenCalledWith(
      projectedHost,
      ContextualHost.scopedElements
    );
    expect(withLightDomCreationContext).toHaveBeenCalledWith(
      projectedHost,
      expect.any(Function)
    );
    expect(render).toHaveBeenCalledWith("value", projectedHost, {
      host: contextualHost,
    });
  });

  it("skips renderer host sync when host or render function is missing", async () => {
    const { syncRendererHost } = await import("../packages/litsx/src/runtime-render-context.js");

    syncRendererHost(null, { value: "x", context: null }, { render: vi.fn() });
    syncRendererHost({}, { value: "x", context: null }, { render: null });

    expect(connectLightDomRegistry).not.toHaveBeenCalled();
    expect(renderLightDom).not.toHaveBeenCalled();
  });

  it("rejects renderRendererCall outside child parts", async () => {
    const { renderRendererCall } = await import("../packages/litsx/src/runtime-render-context.js");
    const result = renderRendererCall(() => "value");

    const DirectiveCtor = result._$litDirective$;

    assert.throws(
      () => new DirectiveCtor({ type: PartType.ATTRIBUTE }),
      /renderRendererCall can only be used in child expressions/
    );
  });

  it("creates and reuses a contents host for renderRendererCall updates", async () => {
    const { renderRendererCall } = await import("../packages/litsx/src/runtime-render-context.js");
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
    const { renderRendererCall } = await import("../packages/litsx/src/runtime-render-context.js");
    const result = renderRendererCall(() => "value");
    const DirectiveCtor = result._$litDirective$;
    const instance = new DirectiveCtor({ type: PartType.CHILD });

    const updated = instance.update({ options: { host: { ownerDocument: null } } }, result.values);
    instance.disconnected();

    assert.strictEqual(updated, nothing);
    expect(renderLightDom).not.toHaveBeenCalled();
  });
});
