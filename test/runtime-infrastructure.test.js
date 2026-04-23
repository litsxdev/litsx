// @vitest-environment happy-dom

import assert from "assert";
import { describe, it } from "vitest";
import {
  LightDomElementsMixin,
  LightDomMixin,
  LitsxStaticHoistsMixin,
  ShadowDomElementsMixin,
} from "../packages/litsx/src/runtime-infrastructure/index.js";

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

describe("litsx runtime infrastructure", () => {
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

    host.remove();
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
});
