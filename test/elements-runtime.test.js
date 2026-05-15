// @vitest-environment happy-dom

import assert from "assert";
import { LitElement, html } from "lit";
import { describe, it } from "vitest";
import { connectLightDomRegistry } from "../packages/light-dom-registry/src/index.js";
import { prepareEffects, useOnConnect, useState } from "../packages/core/src/index.js";
import {
  LightDomElementsMixin,
  LightDomMixin,
  LitsxStaticHoistsMixin,
  ShadowDomElementsMixin,
} from "../packages/core/src/elements/index.js";

let tagCounter = 0;

function nextTag(prefix = "litsx-runtime") {
  tagCounter += 1;
  return `${prefix}-${tagCounter}`;
}

function defineTestElement(tagName, ctor) {
  if (!customElements.get(tagName)) {
    customElements.define(tagName, ctor);
  }
  return document.createElement(tagName);
}

describe("litsx elements runtime", () => {
  it("dedupes static hoist mixins and merges nested property metadata", () => {
    class Base extends HTMLElement {}

    const MixedOnce = LitsxStaticHoistsMixin(Base);
    const MixedTwice = LitsxStaticHoistsMixin(MixedOnce);

    assert.strictEqual(MixedTwice, MixedOnce);
    assert.equal(MixedOnce.__litsxStatic("__cache", () => 3), 3);
    assert.equal(MixedOnce.__litsxStatic("__cache", () => 9), 3);
    assert.deepStrictEqual(
      MixedOnce.__litsxMergeProperties(
        { count: { type: Number, reflect: false }, label: { type: String } },
        { count: { reflect: true }, active: { type: Boolean } },
      ),
      {
        count: { type: Number, reflect: true },
        label: { type: String },
        active: { type: Boolean },
      },
    );
    assert.strictEqual(MixedOnce.__litsxResolveStaticValue("ok"), "ok");
    const fallbackBase = { count: { type: Number } };
    assert.strictEqual(MixedOnce.__litsxMergeProperties(fallbackBase, null), fallbackBase);
    assert.deepStrictEqual(
      MixedOnce.__litsxMergeProperties(
        { count: { type: Number, reflect: false } },
        { count: new Date(0) },
      ),
      { count: new Date(0) },
    );
  });

  it("maps scoped elements and manages light-dom styles without duplicating the style tag", () => {
    const hostTag = nextTag("litsx-runtime-light-host");

    class Base extends HTMLElement {
      static elements = { "demo-child": class DemoChild extends HTMLElement {} };
      static elementStyles = [{ cssText: "button { color: red; }" }];
      static finalizeCalls = 0;

      static finalize() {
        this.finalizeCalls += 1;
      }

      update() {
        this.updated = true;
      }
    }

    const ShadowHost = ShadowDomElementsMixin(Base);
    const LightHost = LightDomMixin(Base);
    const shadowCtor = ShadowDomElementsMixin(ShadowHost);

    assert.strictEqual(shadowCtor, ShadowHost);
    assert.deepStrictEqual(ShadowHost.scopedElements, Base.elements);

    const host = defineTestElement(hostTag, LightHost);
    document.body.appendChild(host);

    assert.strictEqual(host.createRenderRoot(), host);
    host.update();

    let style = host.querySelector("style[data-litsx-light-dom-style]");
    assert(style);
    assert.match(style.textContent, /color: red/);
    assert.equal(LightHost.finalizeCalls, 1);

    LightHost.elementStyles = [{ cssText: "button { color: blue; }" }];
    host.update();

    const styles = host.querySelectorAll("style[data-litsx-light-dom-style]");
    style = styles[0];
    assert.equal(styles.length, 1);
    assert.match(style.textContent, /color: blue/);

    const sameStyleNode = style;
    host.update();

    assert.strictEqual(
      host.querySelector("style[data-litsx-light-dom-style]"),
      sameStyleNode,
    );
    assert.match(sameStyleNode.textContent, /color: blue/);

    host.remove();
  });

  it("skips light-dom style injection when there are no usable styles", () => {
    const hostTag = nextTag("litsx-runtime-empty-styles");

    class Base extends HTMLElement {
      static elementStyles = [null, "", { toString: () => "" }];

      update() {
        this.updated = true;
      }
    }

    const LightHost = LightDomMixin(Base);
    const host = defineTestElement(hostTag, LightHost);
    document.body.appendChild(host);

    host.update();

    assert.strictEqual(
      host.querySelector("style[data-litsx-light-dom-style]"),
      null
    );

    host.remove();
  });

  it("supports stylesheet and string-like style sources in light DOM", () => {
    const hostTag = nextTag("litsx-runtime-sheet-host");
    const originalSheet = globalThis.CSSStyleSheet;

    class FakeSheet {
      constructor() {
        this.cssRules = [{ cssText: "button { color: green; }" }];
      }
    }

    globalThis.CSSStyleSheet = FakeSheet;

    class Base extends HTMLElement {
      static elementStyles = [
        new FakeSheet(),
        { toString: () => ".badge { display: inline-flex; }" },
      ];

      update() {}
    }

    try {
      const LightHost = LightDomMixin(Base);
      const host = defineTestElement(hostTag, LightHost);
      document.body.appendChild(host);

      host.update();

      const style = host.querySelector("style[data-litsx-light-dom-style]");
      assert(style);
      assert.match(style.textContent, /color: green/);
      assert.match(style.textContent, /display: inline-flex/);

      host.remove();
    } finally {
      globalThis.CSSStyleSheet = originalSheet;
    }
  });

  it("connects and disconnects light-dom element registries through the mixin lifecycle", () => {
    const childTag = nextTag("litsx-runtime-child");
    const hostTag = nextTag("litsx-runtime-elements-host");

    class Base extends HTMLElement {
      connectedCallback() {
        this.connected = true;
      }

      disconnectedCallback() {
        this.disconnected = true;
      }
    }

    class ChildElement extends HTMLElement {}

    class HostElement extends LightDomElementsMixin(Base) {
      static elements = {
        [childTag]: ChildElement,
      };
    }

    const host = defineTestElement(hostTag, HostElement);

    assert(host.registry);
    assert.strictEqual(host.registry.get(childTag), ChildElement);

    host.connectedCallback();
    assert.equal(host.connected, true);
    assert.strictEqual(host.registry.get(childTag), ChildElement);

    host.disconnectedCallback();
    assert.equal(host.disconnected, true);
    assert.equal(host.registry, null);
  });

  it("dedupes repeated light-dom element mixin applications", () => {
    class Base extends HTMLElement {}

    const MixedOnce = LightDomElementsMixin(Base);
    const MixedTwice = LightDomElementsMixin(MixedOnce);

    assert.strictEqual(MixedTwice, MixedOnce);
  });

  it("creates per-instance scoped registries for shadow-dom hosts when the platform supports them", () => {
    const originalCustomElementRegistry = globalThis.CustomElementRegistry;
    const originalAttachShadow = Element.prototype.attachShadow;

    class FakeRegistry {
      constructor() {
        this.definitions = new Map();
      }

      define(tagName, elementClass) {
        if (this.definitions.has(tagName)) {
          throw new Error(`duplicate definition: ${tagName}`);
        }
        this.definitions.set(tagName, elementClass);
      }

      get(tagName) {
        return this.definitions.get(tagName);
      }
    }

    globalThis.CustomElementRegistry = FakeRegistry;
    Element.prototype.attachShadow = function attachShadow(init) {
      const registry = init.registry ?? init.customElements ?? init.customElementRegistry ?? null;
      const shadowRoot = {
        host: this,
        registry,
        customElements: registry,
        childNodes: [],
        appendChild(node) {
          this.childNodes.push(node);
          return node;
        },
      };
      Object.defineProperty(this, "shadowRoot", {
        configurable: true,
        value: shadowRoot,
      });
      return shadowRoot;
    };

    class DemoChild extends HTMLElement {}

    class Base {
      constructor() {
        this.shadowRoot = null;
      }

      attachShadow(init) {
        const registry = init.registry ?? init.customElements ?? init.customElementRegistry ?? null;
        const shadowRoot = {
          host: this,
          registry,
          customElements: registry,
          childNodes: [],
          appendChild(node) {
            this.childNodes.push(node);
            return node;
          },
        };
        this.shadowRoot = shadowRoot;
        return shadowRoot;
      }

      static elements = { "demo-child": DemoChild };
      static elementStyles = [{ cssText: ".ready { color: red; }" }];
      static shadowRootOptions = { mode: "open", delegatesFocus: true };

      static finalize() {}
    }

    try {
      const Host = ShadowDomElementsMixin(Base);
      const host = new Host();
      const root = host.createRenderRoot();
      const secondHost = new Host();
      const secondRoot = secondHost.createRenderRoot();

      assert(root);
      assert.strictEqual(root.registry, host.registry);
      assert.strictEqual(host.registry.get("demo-child"), DemoChild);
      assert.strictEqual(secondRoot.registry, secondHost.registry);
      assert.notStrictEqual(secondHost.registry, host.registry);
      assert.strictEqual(secondHost.registry.get("demo-child"), DemoChild);
      const adoptedStyles = root.adoptedStyleSheets ?? [];
      if (adoptedStyles.length > 0) {
        assert.equal(adoptedStyles.length, 1);
      } else {
        assert.equal(root.childNodes.length, 1);
        assert.match(root.childNodes[0].textContent, /color: red/);
      }
    } finally {
      globalThis.CustomElementRegistry = originalCustomElementRegistry;
      Element.prototype.attachShadow = originalAttachShadow;
    }
  });

  it("passes a scoped creationScope to Lit when shadow roots expose importNode", () => {
    const originalCustomElementRegistry = globalThis.CustomElementRegistry;
    const originalAttachShadow = Element.prototype.attachShadow;

    class FakeRegistry {
      define() {}
      get() {
        return undefined;
      }
    }

    globalThis.CustomElementRegistry = FakeRegistry;
    Element.prototype.attachShadow = function attachShadow(init) {
      const registry = init.registry ?? init.customElements ?? init.customElementRegistry ?? null;
      const shadowRoot = {
        host: this,
        registry,
        customElements: registry,
        firstChild: null,
        importNode(node) {
          return node;
        },
        appendChild() {},
      };
      Object.defineProperty(this, "shadowRoot", {
        configurable: true,
        value: shadowRoot,
      });
      return shadowRoot;
    };

    class Base {
      constructor() {
        this.shadowRoot = null;
        this.renderOptions = {};
      }

      attachShadow(init) {
        return Element.prototype.attachShadow.call(this, init);
      }

      static finalize() {}
    }

    try {
      const Host = ShadowDomElementsMixin(Base);
      const host = new Host();
      const shadowRoot = host.createRenderRoot();

      assert.strictEqual(host.renderOptions.creationScope, shadowRoot);
    } finally {
      globalThis.CustomElementRegistry = originalCustomElementRegistry;
      Element.prototype.attachShadow = originalAttachShadow;
    }
  });

  it("supports late scoped definitions through this.registry", () => {
    const originalCustomElementRegistry = globalThis.CustomElementRegistry;
    const originalAttachShadow = Element.prototype.attachShadow;

    class FakeRegistry {
      constructor() {
        this.definitions = new Map();
      }

      define(tagName, elementClass) {
        if (this.definitions.has(tagName)) {
          throw new Error(`duplicate definition: ${tagName}`);
        }
        this.definitions.set(tagName, elementClass);
      }

      get(tagName) {
        return this.definitions.get(tagName);
      }
    }

    class Base {
      constructor() {
        this.shadowRoot = null;
      }

      attachShadow(init) {
        const registry = init.registry ?? init.customElements ?? init.customElementRegistry ?? null;
        const shadowRoot = { host: this, registry, customElements: registry, appendChild() {} };
        this.shadowRoot = shadowRoot;
        return shadowRoot;
      }

      static finalize() {}
    }

    class LazyChild extends HTMLElement {}

    try {
      globalThis.CustomElementRegistry = FakeRegistry;
      Element.prototype.attachShadow = function attachShadow(init) {
        const registry = init.registry ?? init.customElements ?? init.customElementRegistry ?? null;
        const shadowRoot = { host: this, registry, customElements: registry, appendChild() {} };
        Object.defineProperty(this, "shadowRoot", {
          configurable: true,
          value: shadowRoot,
        });
        return shadowRoot;
      };

      const Host = ShadowDomElementsMixin(Base);
      const host = new Host();
      host.createRenderRoot();

      host.registry.define("lazy-child", LazyChild);

      assert.strictEqual(host.registry.get("lazy-child"), LazyChild);
    } finally {
      globalThis.CustomElementRegistry = originalCustomElementRegistry;
      Element.prototype.attachShadow = originalAttachShadow;
    }
  });

  it("allows different instances to redefine the same scoped tag with different constructors", () => {
    const originalCustomElementRegistry = globalThis.CustomElementRegistry;
    const originalAttachShadow = Element.prototype.attachShadow;

    class FakeRegistry {
      constructor() {
        this.definitions = new Map();
      }

      define(tagName, elementClass) {
        if (this.definitions.has(tagName)) {
          throw new Error(`duplicate definition: ${tagName}`);
        }
        this.definitions.set(tagName, elementClass);
      }

      get(tagName) {
        return this.definitions.get(tagName);
      }
    }

    class FirstChild extends HTMLElement {}
    class SecondChild extends HTMLElement {}

    class Base {
      constructor() {
        this.shadowRoot = null;
      }

      attachShadow(init) {
        const registry = init.registry ?? init.customElements ?? init.customElementRegistry ?? null;
        const shadowRoot = { host: this, registry, customElements: registry, appendChild() {} };
        this.shadowRoot = shadowRoot;
        return shadowRoot;
      }

      static elements = {
        "demo-child": FirstChild,
      };

      static finalize() {}
    }

    try {
      globalThis.CustomElementRegistry = FakeRegistry;
      Element.prototype.attachShadow = function attachShadow(init) {
        const registry = init.registry ?? init.customElements ?? init.customElementRegistry ?? null;
        const shadowRoot = { host: this, registry, customElements: registry, appendChild() {} };
        Object.defineProperty(this, "shadowRoot", {
          configurable: true,
          value: shadowRoot,
        });
        return shadowRoot;
      };

      const Host = ShadowDomElementsMixin(Base);
      const firstHost = new Host();
      firstHost.createRenderRoot();
      Host.elements = { "demo-child": SecondChild };

      const secondHost = new Host();
      assert.doesNotThrow(() => secondHost.createRenderRoot());
      assert.notStrictEqual(firstHost.registry, secondHost.registry);
      assert.strictEqual(firstHost.registry.get("demo-child"), FirstChild);
      assert.strictEqual(secondHost.registry.get("demo-child"), SecondChild);
    } finally {
      globalThis.CustomElementRegistry = originalCustomElementRegistry;
      Element.prototype.attachShadow = originalAttachShadow;
    }
  });

  it("allows instance-level registry overrides instead of forcing the class cache", () => {
    const originalCustomElementRegistry = globalThis.CustomElementRegistry;
    const originalAttachShadow = Element.prototype.attachShadow;

    class FakeRegistry {
      constructor() {
        this.definitions = new Map();
      }

      define(tagName, elementClass) {
        if (this.definitions.has(tagName)) {
          throw new Error(`duplicate definition: ${tagName}`);
        }
        this.definitions.set(tagName, elementClass);
      }

      get(tagName) {
        return this.definitions.get(tagName);
      }
    }

    class DemoChild extends HTMLElement {}

    class Base {
      constructor() {
        this.shadowRoot = null;
      }

      attachShadow(init) {
        const registry = init.registry ?? init.customElements ?? init.customElementRegistry ?? null;
        const shadowRoot = { host: this, registry, customElements: registry, appendChild() {} };
        this.shadowRoot = shadowRoot;
        return shadowRoot;
      }

      static elements = {
        "demo-child": DemoChild,
      };

      static finalize() {}
    }

    try {
      globalThis.CustomElementRegistry = FakeRegistry;
      Element.prototype.attachShadow = function attachShadow(init) {
        const registry = init.registry ?? init.customElements ?? init.customElementRegistry ?? null;
        const shadowRoot = { host: this, registry, customElements: registry, appendChild() {} };
        Object.defineProperty(this, "shadowRoot", {
          configurable: true,
          value: shadowRoot,
        });
        return shadowRoot;
      };

      const Host = ShadowDomElementsMixin(Base);
      const firstHost = new Host();
      const secondHost = new Host();
      firstHost.registry = new FakeRegistry();
      secondHost.registry = new FakeRegistry();

      firstHost.createRenderRoot();
      secondHost.createRenderRoot();

      assert.notStrictEqual(firstHost.registry, secondHost.registry);
      assert.strictEqual(firstHost.registry.get("demo-child"), DemoChild);
      assert.strictEqual(secondHost.registry.get("demo-child"), DemoChild);
    } finally {
      globalThis.CustomElementRegistry = originalCustomElementRegistry;
      Element.prototype.attachShadow = originalAttachShadow;
    }
  });

  it("falls back to LitSX shadow registries when native scoped registries are unavailable", () => {
    const originalCustomElementRegistry = globalThis.CustomElementRegistry;

    class DemoChild extends HTMLElement {}
    class Base {
      constructor() {
        this.shadowRoot = null;
      }

      attachShadow(init) {
        this.shadowRoot = { init };
        return this.shadowRoot;
      }

      static elements = { "demo-child": DemoChild };
    }

    try {
      globalThis.CustomElementRegistry = undefined;

      const Host = ShadowDomElementsMixin(Base);
      const host = new Host();

      const shadowRoot = host.createRenderRoot();
      assert.strictEqual(host.registry.get("demo-child"), DemoChild);
      assert.strictEqual(shadowRoot.registry, host.registry);
      assert.strictEqual(shadowRoot.customElements, host.registry);
      assert.strictEqual(shadowRoot.customElementRegistry, host.registry);
      assert.deepStrictEqual(shadowRoot.init, { mode: "open" });
    } finally {
      globalThis.CustomElementRegistry = originalCustomElementRegistry;
    }
  });

  it("falls back to LitSX shadow registries when scoped registry support is polyfilled", () => {
    const shadowHostTag = nextTag("litsx-runtime-polyfilled-shadow-host");
    const originalCustomElementRegistry = globalThis.CustomElementRegistry;
    const originalAttachShadow = Element.prototype.attachShadow;

    class PolyfilledRegistry {
      constructor() {
        this.h = new Map();
        this.m = new Map();
      }

      define(tagName, elementClass) {
        this.h.set(tagName, elementClass);
        this.m.set(elementClass, tagName);
      }

      get(tagName) {
        return this.h.get(tagName);
      }
    }

    globalThis.CustomElementRegistry = PolyfilledRegistry;
    Element.prototype.attachShadow = function attachShadow(init) {
      const registry = init.registry ?? init.customElements ?? init.customElementRegistry ?? null;
      const shadowRoot = document.createElement("div");
      shadowRoot.registry = registry;
      shadowRoot.customElements = registry;
      shadowRoot.customElementRegistry = registry;
      Object.defineProperty(this, "shadowRoot", {
        configurable: true,
        value: shadowRoot,
      });
      return shadowRoot;
    };

    try {
      class ShadowChild extends HTMLElement {}

      class ShadowBase extends HTMLElement {
        static elements = {
          "polyfilled-shadow-child": ShadowChild,
        };
      }

      const ShadowHost = ShadowDomElementsMixin(ShadowBase);
      if (!customElements.get(shadowHostTag)) {
        customElements.define(shadowHostTag, ShadowHost);
      }
      const shadowHost = document.createElement(shadowHostTag);
      const root = shadowHost.createRenderRoot();

      assert.notStrictEqual(shadowHost.registry.constructor, PolyfilledRegistry);
      assert.strictEqual(root.registry, shadowHost.registry);
      assert.strictEqual(shadowHost.registry.get("polyfilled-shadow-child"), ShadowChild);
    } finally {
      globalThis.CustomElementRegistry = originalCustomElementRegistry;
      Element.prototype.attachShadow = originalAttachShadow;
    }
  });

  it("uses fallback shadow registries for imported scoped children without the scoped-registry polyfill", () => {
    const hostTag = nextTag("litsx-runtime-shadow-fallback-host");
    const childTag = nextTag("litsx-runtime-shadow-fallback-child");

    class ScopedChild extends HTMLElement {
      connectedCallback() {
        this.connected = true;
      }
    }

    class HostBase extends HTMLElement {
      static elements = {
        [childTag]: ScopedChild,
      };
    }

    const Host = ShadowDomElementsMixin(HostBase);
    const host = defineTestElement(hostTag, Host);
    document.body.appendChild(host);

    const shadowRoot = host.createRenderRoot();
    const template = document.createElement("template");
    template.innerHTML = `<section><${childTag}></${childTag}></section>`;
    shadowRoot.appendChild(shadowRoot.importNode(template.content, true));

    const child = shadowRoot.querySelector(childTag);
    assert(child);
    assert.strictEqual(Object.getPrototypeOf(child), ScopedChild.prototype);
    assert.equal(child.connected, true);

    host.remove();
  });

  it("lets shadow-dom and light-dom registries coexist in the same runtime", () => {
    const lightChildTag = nextTag("litsx-runtime-light-child");
    const shadowChildTag = nextTag("litsx-runtime-shadow-child");
    const originalCustomElementRegistry = globalThis.CustomElementRegistry;
    const originalAttachShadow = Element.prototype.attachShadow;

    class FakeRegistry {
      constructor() {
        this.definitions = new Map();
      }

      define(tagName, elementClass) {
        if (this.definitions.has(tagName)) {
          throw new Error(`duplicate definition: ${tagName}`);
        }
        this.definitions.set(tagName, elementClass);
      }

      get(tagName) {
        return this.definitions.get(tagName);
      }
    }

    class LightChild extends HTMLElement {
      constructor() {
        super();
        this.kind = "light";
      }
    }

    class ShadowChild extends HTMLElement {}

    class ShadowBase {
      constructor() {
        this.shadowRoot = null;
      }

      attachShadow(init) {
        return Element.prototype.attachShadow.call(this, init);
      }

      static elements = {
        [shadowChildTag]: ShadowChild,
      };

      static finalize() {}
    }

    try {
      const lightHost = document.createElement("section");
      connectLightDomRegistry(lightHost, {
        [lightChildTag]: LightChild,
      });
      lightHost.innerHTML = `<${lightChildTag}></${lightChildTag}>`;
      document.body.appendChild(lightHost);

      const lightChild = lightHost.querySelector(lightChildTag);
      assert(lightChild);
      assert.strictEqual(Object.getPrototypeOf(lightChild), LightChild.prototype);
      assert.strictEqual(lightHost.registry.get(lightChildTag), LightChild);

      globalThis.CustomElementRegistry = FakeRegistry;
      Element.prototype.attachShadow = function attachShadow(init) {
        const registry = init.registry ?? init.customElements ?? init.customElementRegistry ?? null;
        const shadowRoot = {
          host: this,
          registry,
          customElements: registry,
          childNodes: [],
          appendChild(node) {
            this.childNodes.push(node);
            return node;
          },
        };
        Object.defineProperty(this, "shadowRoot", {
          configurable: true,
          value: shadowRoot,
        });
        return shadowRoot;
      };

      const ShadowHost = ShadowDomElementsMixin(ShadowBase);
      const shadowHost = new ShadowHost();
      shadowHost.createRenderRoot();

      assert(shadowHost.registry instanceof FakeRegistry);
      assert.strictEqual(shadowHost.registry.get(shadowChildTag), ShadowChild);
      assert.strictEqual(shadowHost.registry.get(lightChildTag), undefined);
      assert.strictEqual(lightHost.registry.get(shadowChildTag), null);

      lightHost.remove();
    } finally {
      globalThis.CustomElementRegistry = originalCustomElementRegistry;
      Element.prototype.attachShadow = originalAttachShadow;
    }
  });

  it("keeps globally registered shadow-dom hosts newable after the light-dom runtime patches HTMLElement", () => {
    const shadowHostTag = nextTag("litsx-runtime-global-shadow-host");
    const shadowChildTag = nextTag("litsx-runtime-global-shadow-child");

    class LightChild extends HTMLElement {}
    class ShadowChild extends HTMLElement {}

    class ShadowBase extends HTMLElement {
      static elements = {
        [shadowChildTag]: ShadowChild,
      };
    }

    const lightHost = document.createElement("section");
    connectLightDomRegistry(lightHost, {
      [nextTag("litsx-runtime-light-trigger")]: LightChild,
    });

    const ShadowHost = ShadowDomElementsMixin(ShadowBase);
    if (!customElements.get(shadowHostTag)) {
      customElements.define(shadowHostTag, ShadowHost);
    }

    assert.doesNotThrow(() => new ShadowHost());
    assert.doesNotThrow(() => new ShadowHost());

    lightHost.remove();
  });

  it("keeps previously defined global shadow-dom hosts newable after the light-dom runtime activates", () => {
    const shadowHostTag = nextTag("litsx-runtime-predefined-shadow-host");
    const shadowChildTag = nextTag("litsx-runtime-predefined-shadow-child");

    class LightChild extends HTMLElement {}
    class ShadowChild extends HTMLElement {}

    class ShadowBase extends HTMLElement {
      static elements = {
        [shadowChildTag]: ShadowChild,
      };
    }

    const ShadowHost = ShadowDomElementsMixin(ShadowBase);
    if (!customElements.get(shadowHostTag)) {
      customElements.define(shadowHostTag, ShadowHost);
    }

    assert.doesNotThrow(() => new ShadowHost());

    const lightHost = document.createElement("section");
    connectLightDomRegistry(lightHost, {
      [nextTag("litsx-runtime-light-trigger-late")]: LightChild,
    });

    assert.doesNotThrow(() => new ShadowHost());
    assert.doesNotThrow(() => new ShadowHost());

    lightHost.remove();
  });

  it("re-renders globally registered shadow-dom hosts after disconnect and reconnect with light-dom runtime active", async () => {
    const shadowHostTag = nextTag("litsx-runtime-reconnect-shadow-host");
    const shadowChildTag = "litsx-runtime-reconnect-shadow-child";
    const originalCustomElementRegistry = globalThis.CustomElementRegistry;
    const originalAttachShadow = Element.prototype.attachShadow;

    class FakeRegistry {
      constructor() {
        this.definitions = new Map();
      }

      define(tagName, elementClass) {
        if (this.definitions.has(tagName)) {
          throw new Error(`duplicate definition: ${tagName}`);
        }
        this.definitions.set(tagName, elementClass);
      }

      get(tagName) {
        return this.definitions.get(tagName);
      }
    }

    globalThis.CustomElementRegistry = FakeRegistry;
    Element.prototype.attachShadow = function attachShadow(init) {
      const registry = init.registry ?? init.customElements ?? init.customElementRegistry ?? null;
      const shadowRoot = document.createElement("div");
      shadowRoot.registry = registry;
      shadowRoot.customElements = registry;
      shadowRoot.customElementRegistry = registry;
      Object.defineProperty(this, "shadowRoot", {
        configurable: true,
        value: shadowRoot,
      });
      return shadowRoot;
    };

    try {
      class ShadowChild extends LitElement {
        render() {
          return html`<p data-child="ready">child ready</p>`;
        }
      }

      class ShadowBase extends LitElement {
        static elements = {
          [shadowChildTag]: ShadowChild,
        };

        render() {
          prepareEffects(this);
          const [connectCount, setConnectCount] = useState(this, 0);

          useOnConnect(this, () => {
            setConnectCount((count) => count + 1);
          }, []);

          return html`
            <section data-connect-count=${String(connectCount)}>
              <litsx-runtime-reconnect-shadow-child></litsx-runtime-reconnect-shadow-child>
            </section>
          `;
        }
      }

      const ShadowHost = ShadowDomElementsMixin(ShadowBase);
      if (!customElements.get(shadowHostTag)) {
        customElements.define(shadowHostTag, ShadowHost);
      }

      const lightHost = document.createElement("section");
      connectLightDomRegistry(lightHost, {
        [nextTag("litsx-runtime-light-trigger-reconnect")]: class LightChild extends HTMLElement {},
      });

      const host = document.createElement(shadowHostTag);
      document.body.appendChild(host);
      await host.updateComplete;
      await host.updateComplete;

      assert.match(host.shadowRoot.innerHTML, /litsx-runtime-reconnect-shadow-child/);
      assert.match(host.shadowRoot.innerHTML, /data-connect-count="1"/);

      host.remove();
      document.body.appendChild(host);
      await host.updateComplete;
      await host.updateComplete;

      assert.match(host.shadowRoot.innerHTML, /litsx-runtime-reconnect-shadow-child/);
      assert.match(host.shadowRoot.innerHTML, /data-connect-count="2"/);

      host.remove();
      lightHost.remove();
    } finally {
      globalThis.CustomElementRegistry = originalCustomElementRegistry;
      Element.prototype.attachShadow = originalAttachShadow;
    }
  });
});
