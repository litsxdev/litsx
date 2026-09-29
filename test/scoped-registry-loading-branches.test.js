// @vitest-environment happy-dom

import assert from "node:assert/strict";
import { afterEach, describe, it, vi } from "vitest";

const RUNTIME_KEY = Symbol.for("litsx.lightDomRegistry.runtime");

describe("scoped registry startup while the document is loading", () => {
  afterEach(() => {
    delete window[RUNTIME_KEY];
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it("replays observed attributes that existed before a scoped definition", async () => {
    vi.spyOn(document, "readyState", "get").mockReturnValue("loading");
    delete window[RUNTIME_KEY];
    vi.resetModules();
    const { connectLightDomRegistry } = await import(
      "../packages/scoped-registry-shim/src/index.js?loading-document"
    );
    const tagName = "litsx-loading-attribute-test";
    const host = document.createElement("section");
    host.innerHTML = `<${tagName} data-state="ready"></${tagName}>`;
    const target = host.firstElementChild;
    const changes = [];

    class LoadingElement extends HTMLElement {
      static observedAttributes = ["data-state", "missing"];
      attributeChangedCallback(name, oldValue, newValue) {
        changes.push([name, oldValue, newValue]);
      }
    }

    connectLightDomRegistry(host, { [tagName]: LoadingElement });
    document.dispatchEvent(new Event("readystatechange"));
    target.setAttribute("data-state", "done");

    assert.strictEqual(Object.getPrototypeOf(target), LoadingElement.prototype);
    assert.deepEqual(changes, [
      ["data-state", null, "ready"],
      ["data-state", "ready", "done"],
    ]);
  });

  it("ignores pending attributes when a late definition has no callback", async () => {
    vi.spyOn(document, "readyState", "get").mockReturnValue("loading");
    delete window[RUNTIME_KEY];
    vi.resetModules();
    const { connectLightDomRegistry } = await import(
      "../packages/scoped-registry-shim/src/index.js?loading-without-callback"
    );
    const tagName = "litsx-loading-plain-test";
    const host = document.createElement("section");
    host.innerHTML = `<${tagName} data-state="ready"></${tagName}>`;
    const target = host.firstElementChild;
    class PlainElement extends HTMLElement {
      static observedAttributes = ["data-state"];
    }

    connectLightDomRegistry(host, { [tagName]: PlainElement });
    document.dispatchEvent(new Event("readystatechange"));
    assert.strictEqual(Object.getPrototypeOf(target), PlainElement.prototype);
  });
});
