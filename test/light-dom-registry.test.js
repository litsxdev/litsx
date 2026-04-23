// @vitest-environment happy-dom

import assert from "assert";
import { describe, it } from "vitest";
import {
  connectLightDomRegistry,
  createLightDomRegistry,
  disconnectLightDomRegistry,
  ensureLightDomProxy,
} from "../packages/light-dom-registry/src/index.js";

let tagCounter = 0;
const RUNTIME_KEY = Symbol.for("litsx.lightDomRegistry.runtime");

function nextTag(prefix = "litsx-light-test") {
  tagCounter += 1;
  return `${prefix}-${tagCounter}`;
}

describe("@litsx/light-dom-registry", () => {
  it("registers a stand-in once per base tag and reuses it", () => {
    const tagName = nextTag();

    const first = ensureLightDomProxy(tagName);
    const second = ensureLightDomProxy(tagName);

    assert.strictEqual(first, second);
    assert.strictEqual(customElements.get(tagName), first);
  });

  it("throws when the base tag is already registered to a different constructor", () => {
    const tagName = nextTag();

    class ExternalElement extends HTMLElement {}
    customElements.define(tagName, ExternalElement);

    assert.throws(() => {
      ensureLightDomProxy(tagName);
    }, /already registered to a different constructor/);
  });

  it("upgrades light DOM elements in place without creating wrapper children", async () => {
    const tagName = nextTag();

    class FancyButton extends HTMLElement {
      constructor() {
        super();
        this.upgraded = "yes";
      }

      connectedCallback() {
        this.textContent = "ready";
      }
    }

    const host = document.createElement("section");
    connectLightDomRegistry(host, {
      [tagName]: FancyButton,
    });

    host.innerHTML = `<${tagName}></${tagName}>`;
    document.body.appendChild(host);

    const element = host.querySelector(tagName);
    assert(element, "expected light DOM element to exist");
    assert.strictEqual(Object.getPrototypeOf(element), FancyButton.prototype);
    assert.strictEqual(element.upgraded, "yes");
    assert.strictEqual(element.textContent, "ready");
    assert.strictEqual(element.children.length, 0);

    host.remove();
  });

  it("uses the nearest host context when the same tag base maps to different constructors", () => {
    const tagName = nextTag();

    class OuterElement extends HTMLElement {
      constructor() {
        super();
        this.kind = "outer";
      }
    }

    class InnerElement extends HTMLElement {
      constructor() {
        super();
        this.kind = "inner";
      }
    }

    const outerHost = document.createElement("section");
    connectLightDomRegistry(outerHost, {
      [tagName]: OuterElement,
    });

    outerHost.innerHTML = `<${tagName}></${tagName}><div></div>`;

    const innerHost = document.createElement("article");
    connectLightDomRegistry(innerHost, {
      [tagName]: InnerElement,
    });
    innerHost.innerHTML = `<${tagName}></${tagName}>`;

    outerHost.children[1].appendChild(innerHost);
    document.body.appendChild(outerHost);

    const outerElement = outerHost.children[0];
    const innerElement = innerHost.children[0];

    assert.strictEqual(Object.getPrototypeOf(outerElement), OuterElement.prototype);
    assert.strictEqual(Object.getPrototypeOf(innerElement), InnerElement.prototype);
    assert.strictEqual(outerElement.kind, "outer");
    assert.strictEqual(innerElement.kind, "inner");

    outerHost.remove();
  });

  it("creates host-local registries with entries, names, and whenDefined resolution", async () => {
    const tagName = nextTag();

    class CardElement extends HTMLElement {}

    const host = document.createElement("section");
    const registry = createLightDomRegistry(host, {
      [tagName]: CardElement,
    });

    assert.strictEqual(host.registry, registry);
    assert.strictEqual(registry.get(tagName), CardElement);
    assert.strictEqual(registry.getName(CardElement), tagName);
    assert.deepStrictEqual(registry.entries(), [[tagName, CardElement]]);
    assert.strictEqual(await registry.whenDefined(tagName), CardElement);
  });

  it("disconnects the public host registry handle without destroying the internal registry", () => {
    const tagName = nextTag();

    class CardElement extends HTMLElement {}

    const host = document.createElement("section");
    const registry = connectLightDomRegistry(host, {
      [tagName]: CardElement,
    });

    assert.strictEqual(host.registry, registry);
    disconnectLightDomRegistry(host);
    assert.equal(host.registry, null);
  });

  it("upgrades pending elements once a registry definition is added and replays observed attributes", async () => {
    const tagName = nextTag();
    const host = document.createElement("section");
    const standIn = ensureLightDomProxy(tagName);
    const registry = createLightDomRegistry(host, {});

    assert.strictEqual(customElements.get(tagName), standIn);

    host.innerHTML = `<${tagName}></${tagName}>`;
    document.body.appendChild(host);
    const pending = host.firstElementChild;

    class PendingElement extends HTMLElement {
      constructor() {
        super();
      }

      connectedCallback() {
        this.connected = true;
      }
    }

    const whenDefined = registry.whenDefined(tagName);
    registry.define(tagName, PendingElement);

    await assert.doesNotReject(whenDefined);

    assert.strictEqual(Object.getPrototypeOf(pending), PendingElement.prototype);
    assert.equal(pending.connected, true);

    host.remove();
  });

  it("reuses existing definitions when reconnecting the same host mapping", () => {
    const tagName = nextTag();
    const host = document.createElement("section");

    class CardElement extends HTMLElement {}

    const registry = connectLightDomRegistry(host, {
      [tagName]: CardElement,
    });

    assert.strictEqual(
      connectLightDomRegistry(host, {
        [tagName]: CardElement,
      }),
      registry,
    );
    assert.strictEqual(registry.get(tagName), CardElement);
  });

  it("handles defensive public calls and empty element maps", () => {
    const host = document.createElement("section");

    assert.equal(connectLightDomRegistry(null, {}), null);
    assert.strictEqual(createLightDomRegistry(host, null), host.registry);
    assert.deepStrictEqual(host.registry.entries(), []);
    assert.doesNotThrow(() => disconnectLightDomRegistry(null));
    assert.doesNotThrow(() => disconnectLightDomRegistry("host"));
  });

  it("delegates adopted and form-associated lifecycle callbacks to upgraded definitions", () => {
    const tagName = nextTag();
    const host = document.createElement("section");
    const calls = [];

    class FormAwareElement extends HTMLElement {
      static formAssociated = true;

      adoptedCallback(...args) {
        calls.push(["adopted", ...args]);
      }

      formAssociatedCallback(...args) {
        calls.push(["associated", ...args]);
      }

      formDisabledCallback(...args) {
        calls.push(["disabled", ...args]);
      }

      formResetCallback(...args) {
        calls.push(["reset", ...args]);
      }

      formStateRestoreCallback(...args) {
        calls.push(["restore", ...args]);
      }
    }

    connectLightDomRegistry(host, {
      [tagName]: FormAwareElement,
    });

    host.innerHTML = `<${tagName}></${tagName}>`;
    document.body.appendChild(host);
    const element = host.firstElementChild;

    element.adoptedCallback("doc");
    element.formAssociatedCallback("form");
    element.formDisabledCallback(true);
    element.formResetCallback();
    element.formStateRestoreCallback("state", "restore");

    assert.deepStrictEqual(calls, [
      ["adopted", "doc"],
      ["associated", "form"],
      ["disabled", true],
      ["reset"],
      ["restore", "state", "restore"],
    ]);

    host.remove();
  });

  it("throws for invalid registry definitions and exposes resolve metadata", () => {
    const tagName = nextTag();
    const host = document.createElement("section");
    const registry = createLightDomRegistry(host, {});

    class CardElement extends HTMLElement {}
    class OtherElement extends HTMLElement {}

    assert.throws(() => {
      registry.define("", CardElement);
    }, /tag name must not be empty/);

    registry.define(tagName, CardElement);

    assert.deepStrictEqual(registry.resolve(tagName), {
      host,
      ctor: CardElement,
      tagName,
      standInClass: customElements.get(tagName),
    });
    assert.equal(registry.resolve(`${tagName}-missing`), null);

    assert.throws(() => {
      registry.define(tagName, OtherElement);
    }, /has already been used with this registry/);

    assert.throws(() => {
      registry.define(nextTag(), CardElement);
    }, /constructor has already been used with this registry/);
  });

  it("replays observed attribute callbacks for set, remove, and toggle", () => {
    const tagName = nextTag();
    const host = document.createElement("section");
    const calls = [];

    class ObservedElement extends HTMLElement {
      static observedAttributes = ["data-state", "hidden"];

      attributeChangedCallback(name, oldValue, newValue) {
        calls.push([name, oldValue, newValue]);
      }
    }

    connectLightDomRegistry(host, {
      [tagName]: ObservedElement,
    });

    host.innerHTML = `<${tagName}></${tagName}>`;
    document.body.appendChild(host);
    const element = host.firstElementChild;

    element.setAttribute("data-state", "ready");
    element.removeAttribute("data-state");
    element.toggleAttribute("hidden", true);
    element.toggleAttribute("hidden", true);
    element.toggleAttribute("hidden", false);
    element.setAttribute("title", "plain");

    assert.deepStrictEqual(
      calls.filter(([name]) => name === "data-state"),
      [
        ["data-state", null, "ready"],
        ["data-state", "ready", null],
      ],
    );
    assert.ok(
      calls.some(([name, oldValue, newValue]) => (
        name === "hidden" &&
        oldValue === null &&
        newValue === ""
      )),
    );
    assert.ok(
      calls.some(([name, oldValue, newValue]) => (
        name === "hidden" &&
        oldValue === "" &&
        newValue === null
      )),
    );

    host.remove();
  });

  it("stops pending upgrades when unresolved elements disconnect before definition", () => {
    const tagName = nextTag();
    const host = document.createElement("section");
    const registry = createLightDomRegistry(host, {});

    ensureLightDomProxy(tagName);
    const pending = document.createElement(tagName);
    const standInClass = customElements.get(tagName);
    host.appendChild(pending);
    document.body.appendChild(host);

    standInClass.prototype.connectedCallback.call(pending);
    standInClass.prototype.disconnectedCallback.call(pending);

    class LateElement extends HTMLElement {
      connectedCallback() {
        this.connected = true;
      }
    }

    registry.define(tagName, LateElement);

    assert.notStrictEqual(Object.getPrototypeOf(pending), LateElement.prototype);
    assert.equal(pending.connected, undefined);

    host.remove();
  });

  it("guards form-associated callbacks when the definition is not form-associated", () => {
    const tagName = nextTag();
    const host = document.createElement("section");
    const calls = [];

    ensureLightDomProxy(tagName);
    host.innerHTML = `<${tagName}></${tagName}>`;
    document.body.appendChild(host);
    const element = host.firstElementChild;

    if (typeof element.formAssociatedCallback === "function") {
      element.formAssociatedCallback("form");
    }
    if (typeof element.formDisabledCallback === "function") {
      element.formDisabledCallback(true);
    }
    if (typeof element.formResetCallback === "function") {
      element.formResetCallback();
    }
    if (typeof element.formStateRestoreCallback === "function") {
      element.formStateRestoreCallback("state", "restore");
    }

    assert.deepStrictEqual(calls, []);

    host.remove();
  });

  it("supports scoped registries from shadow roots and newable registered constructors", () => {
    const tagName = nextTag();
    const host = document.createElement("section");
    const shadowRoot = host.attachShadow({ mode: "open" });
    const calls = [];

    class ShadowElement extends HTMLElement {
      connectedCallback() {
        calls.push("connected");
      }
    }

    const registry = createLightDomRegistry(host, {
      [tagName]: ShadowElement,
    });
    shadowRoot.customElements = registry;
    shadowRoot.innerHTML = `<${tagName}></${tagName}>`;
    document.body.appendChild(host);

    const element = shadowRoot.firstElementChild;
    const constructed = new ShadowElement();

    assert.strictEqual(Object.getPrototypeOf(element), ShadowElement.prototype);
    assert.strictEqual(Object.getPrototypeOf(constructed), ShadowElement.prototype);
    assert.ok(calls.includes("connected"));

    class UnregisteredElement extends HTMLElement {}
    assert.throws(() => {
      new UnregisteredElement();
    }, /Illegal constructor/);

    host.remove();
  });

  it("exposes runtime metadata helpers for stand-ins and upgraded elements", () => {
    const tagName = nextTag();
    const host = document.createElement("section");

    class MetaElement extends HTMLElement {}

    const registry = createLightDomRegistry(host, {
      [tagName]: MetaElement,
    });
    host.innerHTML = `<${tagName}></${tagName}>`;
    document.body.appendChild(host);

    const runtime = window[RUNTIME_KEY];
    const element = host.firstElementChild;

    assert.ok(runtime);
    assert.strictEqual(runtime.getStandInDefinition(tagName).elementClass, MetaElement);
    assert.strictEqual(runtime.getStandInDefinition("missing-tag"), null);
    assert.strictEqual(runtime.getDefinitionForElement(element).elementClass, MetaElement);
    assert.strictEqual(runtime.getDefinitionForElement(document.createElement("div")), null);
    assert.strictEqual(registry.resolve(tagName).standInClass, customElements.get(tagName));

    host.remove();
  });

  it("propagates scoped creation context through shadow-root element factories and importNode", () => {
    const tagName = nextTag();
    const host = document.createElement("section");
    const shadowRoot = host.attachShadow({ mode: "open" });

    class ScopedElement extends HTMLElement {
      connectedCallback() {
        this.connected = true;
      }
    }

    const registry = createLightDomRegistry(host, {
      [tagName]: ScopedElement,
    });
    shadowRoot.customElements = registry;

    const created = shadowRoot.createElement(tagName);
    const namespaced = shadowRoot.createElementNS("http://www.w3.org/1999/xhtml", tagName);
    const imported = shadowRoot.importNode(document.createElement(tagName), true);
    shadowRoot.appendChild(created);
    shadowRoot.appendChild(namespaced);
    shadowRoot.appendChild(imported);

    document.body.appendChild(host);
    const elements = shadowRoot.querySelectorAll(tagName);

    assert.equal(elements.length, 3);
    for (const element of elements) {
      assert.strictEqual(Object.getPrototypeOf(element), ScopedElement.prototype);
      assert.equal(element.connected, true);
    }

    host.remove();
  });
});
