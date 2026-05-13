// @vitest-environment happy-dom

import assert from "assert";
import { LitElement, html } from "lit";
import { afterEach, describe, it } from "vitest";
import {
  bindRendererContext,
  renderRendererCall,
} from "../packages/litsx/src/runtime-render-context.js";
import {
  LightDomElementsMixin,
  ShadowDomElementsMixin,
} from "../packages/litsx/src/runtime-infrastructure/index.js";

let tagCounter = 0;

function nextTag(prefix = "litsx-render-context-dom") {
  tagCounter += 1;
  return `${prefix}-${tagCounter}`;
}

function defineTestElement(tagName, ctor) {
  if (!customElements.get(tagName)) {
    customElements.define(tagName, ctor);
  }
}

async function settleHost(host) {
  await host.updateComplete;
  await Promise.resolve();
  await host.updateComplete;
}

afterEach(() => {
  document.body.innerHTML = "";
});

describe("runtime renderer context DOM integration", () => {
  it("projects renderer-created scoped elements through a shadow DOM host", async () => {
    const hostTag = nextTag("litsx-render-shadow-host");
    const childTag = nextTag("litsx-render-shadow-child");

    class ScopedChild extends HTMLElement {
      connectedCallback() {
        this.connected = true;
      }
    }

    class ShadowHost extends ShadowDomElementsMixin(LitElement) {
      static elements = {
        [childTag]: ScopedChild,
      };

      constructor() {
        super();
        this.itemRenderer = () => {
          const child = document.createElement(childTag);
          child.textContent = "shadow child";
          return child;
        };
      }

      render() {
        return html`
          <section>
            ${renderRendererCall(
              bindRendererContext(this, this.itemRenderer, { projected: true }),
            )}
          </section>
        `;
      }
    }

    defineTestElement(hostTag, ShadowHost);

    const host = document.createElement(hostTag);
    document.body.appendChild(host);
    await settleHost(host);

    const projectedHost = host.shadowRoot.querySelector("div[style*='contents'], div");
    const child = host.shadowRoot.querySelector(childTag);

    assert(projectedHost);
    assert(child);
    assert.strictEqual(Object.getPrototypeOf(child), ScopedChild.prototype);
    assert.equal(child.connected, true);
    assert.equal(child.textContent, "shadow child");
  });

  it("projects renderer-created scoped elements through a light DOM host", async () => {
    const hostTag = nextTag("litsx-render-light-host");
    const childTag = nextTag("litsx-render-light-child");

    class ScopedChild extends HTMLElement {
      connectedCallback() {
        this.connected = true;
      }
    }

    class LightHost extends LightDomElementsMixin(LitElement) {
      static elements = {
        [childTag]: ScopedChild,
      };

      constructor() {
        super();
        this.itemRenderer = () => {
          const child = document.createElement(childTag);
          child.textContent = "light child";
          return child;
        };
      }

      render() {
        return html`
          <section>
            ${renderRendererCall(
              bindRendererContext(this, this.itemRenderer, { projected: true }),
            )}
          </section>
        `;
      }
    }

    defineTestElement(hostTag, LightHost);

    const host = document.createElement(hostTag);
    document.body.appendChild(host);
    await settleHost(host);

    const child = host.querySelector(childTag);

    assert(child);
    assert.strictEqual(Object.getPrototypeOf(child), ScopedChild.prototype);
    assert.equal(child.connected, true);
    assert.equal(child.textContent, "light child");
  });

  it("keeps projected renderer output valid when a global definition appears between renders", async () => {
    const hostTag = nextTag("litsx-render-race-host");
    const childTag = nextTag("litsx-render-race-child");

    class ScopedChild extends HTMLElement {
      connectedCallback() {
        this.kind = "scoped";
      }
    }

    class GlobalChild extends HTMLElement {
      connectedCallback() {
        this.kind = "global";
      }
    }

    class ShadowHost extends ShadowDomElementsMixin(LitElement) {
      static properties = {
        label: { type: String },
      };

      static elements = {
        [childTag]: ScopedChild,
      };

      constructor() {
        super();
        this.label = "first";
      }

      itemRenderer(label) {
        const child = document.createElement(childTag);
        child.textContent = label;
        return child;
      }

      render() {
        return html`
          ${renderRendererCall(
            bindRendererContext(this, this.itemRenderer, { projected: true }),
            this.label,
          )}
        `;
      }
    }

    defineTestElement(hostTag, ShadowHost);

    const host = document.createElement(hostTag);
    document.body.appendChild(host);
    await settleHost(host);

    const firstChild = host.shadowRoot.querySelector(childTag);
    assert.strictEqual(Object.getPrototypeOf(firstChild), ScopedChild.prototype);
    assert.equal(firstChild.kind, "scoped");

    customElements.define(childTag, GlobalChild);
    host.label = "second";
    await settleHost(host);

    const secondChild = host.shadowRoot.querySelector(childTag);
    const globalChild = document.createElement(childTag);
    document.body.appendChild(globalChild);

    assert.strictEqual(Object.getPrototypeOf(secondChild), ScopedChild.prototype);
    assert.strictEqual(Object.getPrototypeOf(globalChild), GlobalChild.prototype);
    assert.equal(secondChild.textContent, "second");
    assert.equal(secondChild.kind, "scoped");
    assert.equal(globalChild.kind, "global");
  });
});
