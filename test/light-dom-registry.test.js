// @vitest-environment happy-dom

import assert from "assert";
import { describe, it } from "vitest";
import {
  connectLightDomRegistry,
  createLightDomRegistry,
  disconnectLightDomRegistry,
  ensureLightDomProxy,
  withLightDomCreationContext,
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
    assert.strictEqual(customElements.get(tagName), undefined);
  });

  it("keeps scoped proxies separate from global definitions with the same tag", () => {
    const tagName = nextTag();

    class ExternalElement extends HTMLElement {}
    customElements.define(tagName, ExternalElement);

    const standIn = ensureLightDomProxy(tagName);
    assert.strictEqual(customElements.get(tagName), ExternalElement);
    assert.notStrictEqual(standIn, ExternalElement);
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

  it("reuses pending whenDefined promises until the definition arrives", async () => {
    const tagName = nextTag();
    const host = document.createElement("section");
    const registry = createLightDomRegistry(host, {});

    const first = registry.whenDefined(tagName);
    const second = registry.whenDefined(tagName);

    assert.strictEqual(first, second);

    class CardElement extends HTMLElement {}
    registry.define(tagName, CardElement);

    assert.strictEqual(await first, CardElement);
    assert.strictEqual(registry.getName(class extends HTMLElement {}), null);
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

  it("does not clear unrelated public registry handles on disconnect", () => {
    const host = document.createElement("section");
    const registry = connectLightDomRegistry(host, {});
    const publicRegistry = {
      get() {},
    };

    host.registry = publicRegistry;
    disconnectLightDomRegistry(host);

    assert.strictEqual(host.registry, publicRegistry);
    assert.strictEqual(host[Symbol.for("litsx.lightDomRegistry.hostRegistry")] ?? registry, registry);
  });

  it("upgrades pending elements once a registry definition is added and replays observed attributes", async () => {
    const tagName = nextTag();
    const host = document.createElement("section");
    const standIn = ensureLightDomProxy(tagName);
    const registry = createLightDomRegistry(host, {});

    assert.strictEqual(customElements.get(tagName), undefined);

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

  it("creates a fresh host registry when a reused host receives a different scope", () => {
    const firstTag = nextTag();
    const secondTag = nextTag();
    const host = document.createElement("section");

    class FirstElement extends HTMLElement {}
    class SecondElement extends HTMLElement {}

    const firstRegistry = connectLightDomRegistry(host, {
      [firstTag]: FirstElement,
    });
    const secondRegistry = connectLightDomRegistry(host, {
      [secondTag]: SecondElement,
    });

    assert.notStrictEqual(secondRegistry, firstRegistry);
    assert.strictEqual(secondRegistry.get(firstTag), null);
    assert.strictEqual(secondRegistry.get(secondTag), SecondElement);
  });

  it("creates a fresh host registry when the same scoped tag maps to a new constructor", () => {
    const tagName = nextTag();
    const host = document.createElement("section");

    class FirstElement extends HTMLElement {}
    class SecondElement extends HTMLElement {}

    const firstRegistry = connectLightDomRegistry(host, {
      [tagName]: FirstElement,
    });
    const secondRegistry = connectLightDomRegistry(host, {
      [tagName]: SecondElement,
    });

    assert.notStrictEqual(secondRegistry, firstRegistry);
    assert.strictEqual(secondRegistry.get(tagName), SecondElement);
  });

  it("upgrades existing host children when a registry is reconnected after render", () => {
    const tagName = nextTag();
    const host = document.createElement("section");

    class LateScopedElement extends HTMLElement {
      connectedCallback() {
        this.connected = true;
      }
    }

    ensureLightDomProxy(tagName);
    host.innerHTML = `<${tagName}></${tagName}>`;
    document.body.appendChild(host);

    const element = host.firstElementChild;
    assert.notStrictEqual(Object.getPrototypeOf(element), LateScopedElement.prototype);

    connectLightDomRegistry(host, {
      [tagName]: LateScopedElement,
    });

    assert.strictEqual(Object.getPrototypeOf(element), LateScopedElement.prototype);
    assert.equal(element.connected, true);

    host.remove();
  });

  it("keeps resolving scoped constructors for a new host instance after the previous host disconnects", () => {
    const tagName = nextTag();

    class CardElement extends HTMLElement {
      constructor() {
        super();
        this.kind = "card";
      }
    }

    const firstHost = document.createElement("section");
    connectLightDomRegistry(firstHost, {
      [tagName]: CardElement,
    });
    firstHost.innerHTML = `<${tagName}></${tagName}>`;
    document.body.appendChild(firstHost);

    const firstElement = firstHost.firstElementChild;
    assert.strictEqual(Object.getPrototypeOf(firstElement), CardElement.prototype);
    assert.strictEqual(firstElement.kind, "card");

    firstHost.remove();
    disconnectLightDomRegistry(firstHost);

    const secondHost = document.createElement("section");
    connectLightDomRegistry(secondHost, {
      [tagName]: CardElement,
    });
    secondHost.innerHTML = `<${tagName}></${tagName}>`;
    document.body.appendChild(secondHost);

    const secondElement = secondHost.firstElementChild;
    assert.strictEqual(Object.getPrototypeOf(secondElement), CardElement.prototype);
    assert.strictEqual(secondElement.kind, "card");

    secondHost.remove();
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

    const metadata = registry.resolve(tagName);
    assert.ok(metadata.standInClass);
    assert.deepStrictEqual(metadata, {
      host,
      ctor: CardElement,
      tagName,
      standInClass: metadata.standInClass,
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

    const standInClass = ensureLightDomProxy(tagName);
    const pending = document.createElement(tagName);
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

  it("returns null names for unknown constructors and resolves pending whenDefined only once", async () => {
    const tagName = nextTag();
    const host = document.createElement("section");
    const registry = createLightDomRegistry(host, {});

    const pending = registry.whenDefined(tagName);
    const repeated = registry.whenDefined(tagName);
    assert.strictEqual(pending, repeated);

    class PlainElement extends HTMLElement {}
    class UnknownElement extends HTMLElement {}

    registry.define(tagName, PlainElement);

    assert.strictEqual(await pending, PlainElement);
    assert.strictEqual(registry.getName(UnknownElement), null);
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

  it("propagates scoped creation context through insertAdjacentHTML", () => {
    const tagName = nextTag();
    const host = document.createElement("section");
    const container = document.createElement("div");

    class InsertedElement extends HTMLElement {
      connectedCallback() {
        this.connected = true;
      }
    }

    connectLightDomRegistry(host, {
      [tagName]: InsertedElement,
    });
    host.appendChild(container);
    document.body.appendChild(host);

    container.insertAdjacentHTML("beforeend", `<${tagName}></${tagName}>`);

    const element = container.querySelector(tagName);
    assert(element);
    assert.strictEqual(Object.getPrototypeOf(element), InsertedElement.prototype);
    assert.equal(element.connected, true);

    host.remove();
  });

  it("propagates scoped creation context through element innerHTML", () => {
    const tagName = nextTag();
    const host = document.createElement("section");
    const container = document.createElement("div");

    class InnerHtmlElement extends HTMLElement {
      connectedCallback() {
        this.connected = true;
      }
    }

    connectLightDomRegistry(host, {
      [tagName]: InnerHtmlElement,
    });
    host.appendChild(container);
    document.body.appendChild(host);

    container.innerHTML = `<${tagName}></${tagName}>`;

    const element = container.querySelector(tagName);
    assert(element);
    assert.strictEqual(Object.getPrototypeOf(element), InnerHtmlElement.prototype);
    assert.equal(element.connected, true);

    host.remove();
  });

  it("ignores adopted and disconnect callbacks on unresolved stand-ins", () => {
    const tagName = nextTag();
    const standIn = ensureLightDomProxy(tagName);
    const host = document.createElement("section");
    host.innerHTML = `<${tagName}></${tagName}>`;
    document.body.appendChild(host);

    const element = host.firstElementChild;

    assert.doesNotThrow(() => standIn.prototype.adoptedCallback.call(element, "doc"));
    assert.doesNotThrow(() => standIn.prototype.disconnectedCallback.call(element));

    host.remove();
  });

  it("notifies pending registries when unresolved stand-ins disconnect", () => {
    const tagName = nextTag();
    const host = document.createElement("section");
    const registry = createLightDomRegistry(host, {});
    const standIn = ensureLightDomProxy(tagName);
    const calls = [];

    host.innerHTML = `<${tagName}></${tagName}>`;
    document.body.appendChild(host);

    const element = host.firstElementChild;
    registry._upgradeWhenDefined = (...args) => {
      calls.push(args);
    };

    standIn.prototype.connectedCallback.call(element);
    standIn.prototype.disconnectedCallback.call(element);

    assert.deepStrictEqual(calls, [
      [element, tagName, true],
      [element, tagName, false],
    ]);

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
    assert.strictEqual(customElements.get(tagName), undefined);
    assert.ok(registry.resolve(tagName).standInClass);

    host.remove();
  });

  it("creates scoped elements through withLightDomCreationContext", () => {
    const tagName = nextTag();
    const host = document.createElement("section");

    class ContextElement extends HTMLElement {
      constructor() {
        super();
        this.kind = "context";
      }
    }

    connectLightDomRegistry(host, {
      [tagName]: ContextElement,
    });

    const element = withLightDomCreationContext(host, () => document.createElement(tagName));

    assert.strictEqual(Object.getPrototypeOf(element), ContextElement.prototype);
    assert.strictEqual(element.kind, "context");
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

  it("resolves scoped elements from shadowRoot.customElementRegistry too", () => {
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
    shadowRoot.customElementRegistry = registry;

    shadowRoot.innerHTML = `<${tagName}></${tagName}>`;
    document.body.appendChild(host);

    const element = shadowRoot.querySelector(tagName);
    assert(element);
    assert.strictEqual(Object.getPrototypeOf(element), ScopedElement.prototype);
    assert.equal(element.connected, true);

    host.remove();
  });

  it("falls back to shadowRoot.host.registry when the shadow root does not expose registry fields", () => {
    const tagName = nextTag();
    const host = document.createElement("section");
    const shadowRoot = host.attachShadow({ mode: "open" });

    class ScopedElement extends HTMLElement {
      connectedCallback() {
        this.connected = true;
      }
    }

    connectLightDomRegistry(host, {
      [tagName]: ScopedElement,
    });

    shadowRoot.innerHTML = `<${tagName}></${tagName}>`;
    document.body.appendChild(host);

    const element = shadowRoot.querySelector(tagName);
    assert(element);
    assert.strictEqual(Object.getPrototypeOf(element), ScopedElement.prototype);
    assert.equal(element.connected, true);

    host.remove();
  });

  it("upgrades stand-ins that are created before they are connected to a scoped shadow root", () => {
    const tagName = nextTag();
    const host = document.createElement("section");
    const shadowRoot = host.attachShadow({ mode: "open" });

    class ScopedElement extends HTMLElement {
      connectedCallback() {
        this.connected = true;
      }
    }

    connectLightDomRegistry(host, {
      [tagName]: ScopedElement,
    });

    const element = document.createElement(tagName);
    assert.notStrictEqual(Object.getPrototypeOf(element), ScopedElement.prototype);

    shadowRoot.appendChild(element);
    document.body.appendChild(host);

    assert.strictEqual(Object.getPrototypeOf(element), ScopedElement.prototype);
    assert.equal(element.connected, true);

    host.remove();
  });

  it("allows scoped definitions for tags that are already globally registered", () => {
    const tagName = nextTag();
    const host = document.createElement("section");
    const shadowRoot = host.attachShadow({ mode: "open" });

    class GlobalElement extends HTMLElement {}

    class ScopedElement extends HTMLElement {
      connectedCallback() {
        this.connected = true;
      }
    }

    customElements.define(tagName, GlobalElement);

    const registry = createLightDomRegistry(host, {
      [tagName]: ScopedElement,
    });
    shadowRoot.customElements = registry;
    document.body.appendChild(host);
    shadowRoot.innerHTML = `<${tagName}></${tagName}>`;

    const element = shadowRoot.querySelector(tagName);
    assert(element);
    assert.strictEqual(Object.getPrototypeOf(element), ScopedElement.prototype);
    assert.equal(element.connected, true);
    assert.strictEqual(customElements.get(tagName), GlobalElement);

    host.remove();
  });

  it("does not expose scoped stand-ins as global custom element definitions", () => {
    const tagName = nextTag();
    const host = document.createElement("section");
    const shadowRoot = host.attachShadow({ mode: "open" });

    class ScopedElement extends HTMLElement {}
    class GlobalElement extends HTMLElement {
      connectedCallback() {
        this.connected = true;
      }
    }

    const registry = createLightDomRegistry(host, {
      [tagName]: ScopedElement,
    });
    shadowRoot.customElements = registry;
    shadowRoot.innerHTML = `<${tagName}></${tagName}>`;

    assert.strictEqual(customElements.get(tagName), undefined);
    customElements.define(tagName, GlobalElement);
    assert.strictEqual(customElements.get(tagName), GlobalElement);

    const globalElement = document.createElement(tagName);
    document.body.appendChild(globalElement);

    assert.strictEqual(Object.getPrototypeOf(globalElement), GlobalElement.prototype);
    assert.equal(globalElement.connected, true);

    host.remove();
    globalElement.remove();
  });

  it("keeps scoped hosts isolated after a global definition claims the same tag", () => {
    const tagName = nextTag();
    const firstHost = document.createElement("section");
    const secondHost = document.createElement("section");

    class FirstScopedElement extends HTMLElement {
      connectedCallback() {
        this.kind = "first";
      }
    }

    class SecondScopedElement extends HTMLElement {
      connectedCallback() {
        this.kind = "second";
      }
    }

    class GlobalElement extends HTMLElement {
      connectedCallback() {
        this.kind = "global";
      }
    }

    connectLightDomRegistry(firstHost, {
      [tagName]: FirstScopedElement,
    });
    firstHost.innerHTML = `<${tagName}></${tagName}>`;
    document.body.appendChild(firstHost);

    const firstBeforeGlobal = firstHost.querySelector(tagName);
    assert.strictEqual(Object.getPrototypeOf(firstBeforeGlobal), FirstScopedElement.prototype);
    assert.equal(firstBeforeGlobal.kind, "first");
    assert.strictEqual(customElements.get(tagName), undefined);

    customElements.define(tagName, GlobalElement);
    const globalElement = document.createElement(tagName);
    document.body.appendChild(globalElement);

    connectLightDomRegistry(secondHost, {
      [tagName]: SecondScopedElement,
    });
    secondHost.innerHTML = `<${tagName}></${tagName}>`;
    document.body.appendChild(secondHost);

    const firstAfterGlobal = firstHost.querySelector(tagName);
    const secondAfterGlobal = secondHost.querySelector(tagName);

    assert.strictEqual(Object.getPrototypeOf(firstAfterGlobal), FirstScopedElement.prototype);
    assert.strictEqual(Object.getPrototypeOf(secondAfterGlobal), SecondScopedElement.prototype);
    assert.strictEqual(Object.getPrototypeOf(globalElement), GlobalElement.prototype);
    assert.equal(firstAfterGlobal.kind, "first");
    assert.equal(secondAfterGlobal.kind, "second");
    assert.equal(globalElement.kind, "global");

    firstHost.remove();
    secondHost.remove();
    globalElement.remove();
  });

  it("preserves scoped shadow-root importNode results across repeated global definitions", () => {
    const tagName = nextTag();
    const firstHost = document.createElement("section");
    const firstShadow = firstHost.attachShadow({ mode: "open" });
    const secondHost = document.createElement("section");
    const secondShadow = secondHost.attachShadow({ mode: "open" });
    const template = document.createElement("template");
    template.innerHTML = `<${tagName}></${tagName}>`;

    class FirstScopedElement extends HTMLElement {}
    class SecondScopedElement extends HTMLElement {}
    class GlobalElement extends HTMLElement {}

    firstShadow.registry = createLightDomRegistry(firstHost, {
      [tagName]: FirstScopedElement,
    });
    firstShadow.appendChild(firstShadow.importNode(template.content, true));
    document.body.appendChild(firstHost);

    customElements.define(tagName, GlobalElement);

    secondShadow.registry = createLightDomRegistry(secondHost, {
      [tagName]: SecondScopedElement,
    });
    secondShadow.appendChild(secondShadow.importNode(template.content, true));
    document.body.appendChild(secondHost);

    const firstElement = firstShadow.querySelector(tagName);
    const secondElement = secondShadow.querySelector(tagName);
    const globalElement = document.createElement(tagName);

    assert.strictEqual(Object.getPrototypeOf(firstElement), FirstScopedElement.prototype);
    assert.strictEqual(Object.getPrototypeOf(secondElement), SecondScopedElement.prototype);
    assert.strictEqual(Object.getPrototypeOf(globalElement), GlobalElement.prototype);

    firstHost.remove();
    secondHost.remove();
  });

  it("propagates scoped creation context through shadow-root innerHTML", () => {
    const tagName = nextTag();
    const host = document.createElement("section");
    const shadowRoot = host.attachShadow({ mode: "open" });

    class ShadowInnerHtmlElement extends HTMLElement {
      connectedCallback() {
        this.connected = true;
      }
    }

    const registry = createLightDomRegistry(host, {
      [tagName]: ShadowInnerHtmlElement,
    });
    shadowRoot.customElements = registry;
    shadowRoot.innerHTML = `<${tagName}></${tagName}>`;
    document.body.appendChild(host);

    const element = shadowRoot.querySelector(tagName);
    assert(element);
    assert.strictEqual(Object.getPrototypeOf(element), ShadowInnerHtmlElement.prototype);
    assert.equal(element.connected, true);

    host.remove();
  });

  it("uses the ambient creation context when creating scoped elements without a rooted node", () => {
    const tagName = nextTag();
    const host = document.createElement("section");

    class AmbientContextElement extends HTMLElement {}

    connectLightDomRegistry(host, {
      [tagName]: AmbientContextElement,
    });

    const element = withLightDomCreationContext(host, () => document.createElement(tagName));

    assert.strictEqual(Object.getPrototypeOf(element), AmbientContextElement.prototype);
  });
});
