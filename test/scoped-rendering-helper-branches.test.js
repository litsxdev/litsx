import { describe, expect, it, vi } from "vitest";
import { html } from "lit";
import { LITSX_LIGHT_DOM, LITSX_MODULE_ID } from "../packages/core/src/elements/index.js";
import {
  assertJsonSerializable,
  assertSerializable,
  createHydrationPayload,
  createScopedSsrContext,
  ensureSsrElementShape,
  getRenderIterator,
  getScopedElements,
  isLightDomElement,
  isPlainSerializableObject,
  makeRendererValueServerOnly,
  trySerialize,
} from "../packages/ssr/src/scoped-rendering.js";

describe("scoped rendering helper branches", () => {
  it("marks nested templates and arrays as server-only", () => {
    const nested = html`<b>${"child"}</b>`;
    const result = makeRendererValueServerOnly(html`<p>${[nested, 1]}</p>`);
    expect(result._$litServerRenderMode).toBe(1);
    expect(result.values[0][0]._$litServerRenderMode).toBe(1);
    expect(makeRendererValueServerOnly("plain")).toBe("plain");
  });

  it("resolves scoped element metadata and light-dom flags", () => {
    expect(getScopedElements({ elements: { x: 1 }, scopedElements: { y: 2 } })).toEqual({ x: 1 });
    expect(getScopedElements({ scopedElements: { y: 2 } })).toEqual({ y: 2 });
    expect(getScopedElements(null)).toBeNull();
    expect(isLightDomElement({ [LITSX_LIGHT_DOM]: true })).toBe(true);
    expect(isLightDomElement(null)).toBe(false);
  });

  it("fills the minimal SSR element shape and preserves existing methods", () => {
    ensureSsrElementShape(null);
    const element = { __host: { shadowRoot: "root" } };
    ensureSsrElementShape(element);
    expect(element.getRootNode()).toBe("root");
    expect(element.getAttribute("x")).toBeNull();
    element.setAttribute("x", 1);
    element.setAttribute("x", 2);
    expect(element.getAttribute("x")).toBe("2");
    expect(() => element.addEventListener()).not.toThrow();
    expect(() => element.removeEventListener()).not.toThrow();

    const existing = {
      attributes: [],
      getRootNode: vi.fn(),
      getAttribute: vi.fn(),
      setAttribute: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    };
    ensureSsrElementShape(existing);
    expect(existing.getRootNode).not.toBe(element.getRootNode);
  });

  it("accepts async and sync iterables and rejects other values", async () => {
    const asyncIterable = { async *[Symbol.asyncIterator]() { yield 1; } };
    expect((await getRenderIterator(asyncIterable).next()).value).toBe(1);
    expect(getRenderIterator([2]).next().value).toBe(2);
    expect(() => getRenderIterator(null)).toThrow(/not iterable/);
  });

  it("validates JSON resource snapshots including cycles and exotic values", () => {
    expect(assertJsonSerializable(null, "x")).toBeNull();
    expect(assertJsonSerializable("x", "x")).toBe("x");
    expect(assertJsonSerializable(true, "x")).toBe(true);
    expect(assertJsonSerializable(2, "x")).toBe(2);
    expect(assertJsonSerializable([1, { ok: true }], "x")).toEqual([1, { ok: true }]);
    expect(assertJsonSerializable(Object.assign(Object.create(null), { x: 1 }), "x")).toEqual({ x: 1 });
    expect(() => assertJsonSerializable(Infinity, "x")).toThrow(/JSON-serializable/);
    expect(() => assertJsonSerializable(undefined, "x")).toThrow(/JSON-serializable/);
    expect(() => assertJsonSerializable(new Date(), "x")).toThrow(/JSON-serializable/);
    const cycle = {};
    cycle.self = cycle;
    expect(() => assertJsonSerializable(cycle, "x")).toThrow(/JSON-serializable/);
  });

  it("classifies and serializes hydration payload values", () => {
    expect(createHydrationPayload()).toEqual({ roots: {}, instances: {} });
    expect(isPlainSerializableObject(null)).toBe(false);
    expect(isPlainSerializableObject("x")).toBe(false);
    expect(isPlainSerializableObject({})).toBe(true);
    expect(isPlainSerializableObject(Object.create(null))).toBe(true);
    expect(isPlainSerializableObject([])).toBe(true);
    expect(isPlainSerializableObject(new Date())).toBe(false);
    expect(assertSerializable(undefined, "x")).toBeUndefined();
    expect(assertSerializable([1, { x: false }], "x")).toEqual([1, { x: false }]);
    expect(() => assertSerializable(new Date(), "x")).toThrow(/JSON-serializable/);
    expect(trySerialize({ ok: 1 }, "x")).toEqual({ ok: true, value: { ok: 1 } });
    expect(trySerialize(new Date(), "x")).toEqual({ ok: false, value: undefined });
  });

  it("covers context defaults, collection guards, resolving, and payload state", () => {
    const plain = createScopedSsrContext();
    expect(plain.idPrefix).toBe("litsx");
    expect(plain.assetResolver).toBeNull();
    expect(plain.executionContext).toBeNull();
    expect(plain.renderCustomElementSsr).toBeNull();
    plain.captureResourceSnapshots();
    plain.collectClientImport(null);
    plain.collectClientImportSpecifier(null);
    plain.collectClientImportSpecifier(1);
    plain.collectModulePreload(null);
    plain.collectModulePreload(1);
    plain.collectHeadTag(null);
    plain.collectHeadTag("");
    plain.collectAdapterArtifact(null);
    plain.collectAdapterArtifact("x");
    plain.collectHydrationRootPayload("", {});
    plain.collectHydrationState({ rootId: "", instanceId: 0, slot: 0, value: 1 });
    plain.collectHydrationState({ rootId: "r", instanceId: null, slot: 0, value: 1 });
    plain.collectHydrationState({ rootId: "r", instanceId: 0, slot: null, value: 1 });

    const resolver = vi.fn((id) => id === "drop" ? null : `/${id}`);
    const context = createScopedSsrContext({
      idPrefix: "test",
      assetResolver: resolver,
      executionContext: { waitUntil() {} },
      renderCustomElementSsr() {},
    });
    expect(context.nextInstanceId()).toBe("0");
    expect(context.nextRootId()).toBe("test-root-0");
    context.collectClientImport({ [LITSX_MODULE_ID]: "component.js" });
    context.collectClientImport({ [LITSX_MODULE_ID]: "drop" });
    context.collectClientImportSpecifier("client.js");
    context.collectClientImportSpecifier("drop");
    context.collectModulePreload("preload.js");
    context.collectModulePreload("drop");
    context.collectHeadTag("<meta>");
    context.collectAdapterArtifact({ value: 1 });
    context.collectHydrationRoot({ id: "r" });
    context.collectHydrationRootPayload("r", { nested: [1] });
    context.collectHydrationState({ rootId: "r", instanceId: 0, slot: 0, value: "a" });
    context.collectHydrationState({ rootId: "r", instanceId: 0, slot: 1, value: "b" });
    expect(context.clientImports).toEqual(new Set(["/component.js", "/client.js", "drop"]));
    expect(context.modulePreloads).toEqual(new Set(["/preload.js", "drop"]));
    expect(context.headTags).toEqual(new Set(["<meta>"]));
    expect(context.adapterArtifacts).toEqual([{ value: 1 }]);
    expect(context.hydrationData.payload.roots.r).toEqual({ nested: [1] });
    expect(context.hydrationData.payload.instances["r:0"].state).toEqual(["a", "b"]);
  });

  it("registers unique snapshots and noscript fallbacks", () => {
    const context = createScopedSsrContext({ assetResolver: "invalid", renderCustomElementSsr: 1 });
    context.resourceSnapshotRegistry.register("one", () => ({ value: 1 }));
    context.resourceSnapshotRegistry.register("one", () => ({ value: 2 }));
    context.captureResourceSnapshots();
    expect(context.hydrationData.payload.resources).toEqual({ one: { value: 1 } });
    expect(context.registerNoscriptFallback({ factory: "a" })).toBe("litsx-noscript-0");
    expect(context.registerNoscriptFallback({ factory: "b", elements: { x: 1 } })).toBe("litsx-noscript-1");
  });
});
