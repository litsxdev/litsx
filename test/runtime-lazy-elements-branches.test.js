import assert from "node:assert/strict";
import { afterEach, describe, it } from "vitest";
import {
  defineScopedElement,
  getElementRegistry,
  getElementRegistryFromRoot,
  isCustomElementConstructor,
  isUsableRegistry,
  resolveLazyLoaderResult,
  ensureLazyElement,
} from "../packages/core/src/runtime-lazy-elements.js";

const originalHTMLElement = globalThis.HTMLElement;
afterEach(() => { globalThis.HTMLElement = originalHTMLElement; });

function registry() {
  const values = new Map();
  return {
    define(name, value) { values.set(name, value); },
    get(name) { return values.get(name); },
  };
}

describe("runtime lazy element helper branches", () => {
  it("resolves registries from every supported root property", () => {
    const first = registry();
    const second = registry();
    const third = registry();
    assert.strictEqual(isUsableRegistry(null), false);
    assert.strictEqual(isUsableRegistry({ define() {} }), false);
    assert.strictEqual(getElementRegistryFromRoot(null), null);
    assert.strictEqual(getElementRegistryFromRoot({}), null);
    assert.strictEqual(getElementRegistryFromRoot({ getRootNode: () => null }), null);
    assert.strictEqual(getElementRegistryFromRoot({ getRootNode: () => ({ registry: first }) }), first);
    assert.strictEqual(getElementRegistryFromRoot({ getRootNode: () => ({ customElements: second }) }), second);
    assert.strictEqual(getElementRegistryFromRoot({ getRootNode: () => ({ customElementRegistry: third }) }), third);
    assert.strictEqual(getElementRegistryFromRoot({ getRootNode: () => ({}) }), null);
    assert.strictEqual(getElementRegistry(null), null);
    assert.strictEqual(getElementRegistry({ registry: {}, getRootNode: () => ({ registry: first }) }), first);
  });

  it("recognizes browser and server custom-element constructors", () => {
    assert.strictEqual(isCustomElementConstructor(null), false);
    globalThis.HTMLElement = class HTMLElement {};
    class Child extends globalThis.HTMLElement {}
    assert.strictEqual(isCustomElementConstructor(globalThis.HTMLElement), true);
    assert.strictEqual(isCustomElementConstructor(Child), true);
    assert.strictEqual(isCustomElementConstructor(function ordinary() {}), false);
    globalThis.HTMLElement = undefined;
    assert.strictEqual(isCustomElementConstructor(class ServerElement {}), true);
    assert.strictEqual(isCustomElementConstructor(() => {}), false);
  });

  it("defines, reuses, unwraps, and rejects resolved loader results", () => {
    const target = registry();
    class Element {}
    assert.strictEqual(defineScopedElement(null, "x-one", Element), Element);
    assert.strictEqual(defineScopedElement(target, "", Element), Element);
    assert.strictEqual(defineScopedElement(target, "x-one", null), null);
    assert.strictEqual(defineScopedElement(target, "x-one", Element), Element);
    assert.strictEqual(defineScopedElement(target, "x-one", class Other {}), Element);
    assert.strictEqual(resolveLazyLoaderResult(target, "x-empty", null), null);
    assert.strictEqual(resolveLazyLoaderResult(target, "x-two", { default: Element }), Element);
    assert.throws(() => resolveLazyLoaderResult(target, "x-bad", {}), /custom element constructor/);
  });

  it("reuses a resolved loader across independent registries", async () => {
    class Element {}
    const loader = () => Element;
    const first = registry();
    const second = registry();
    assert.strictEqual(ensureLazyElement({ registry: first }, "x-first", loader), null);
    await Promise.resolve();
    await Promise.resolve();
    assert.strictEqual(ensureLazyElement({ registry: second }, "x-second", loader), Element);
  });
});
