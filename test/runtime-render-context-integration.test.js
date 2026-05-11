// @vitest-environment happy-dom

import assert from "assert";
import { render } from "lit/html.js";
import { html as staticHtml, unsafeStatic } from "lit/static-html.js";
import { describe, it } from "vitest";
import {
  connectLightDomRegistry,
  createLightDomRegistry,
} from "../packages/light-dom-registry/src/index.js";
import {
  bindRendererContext,
  renderRendererCall,
} from "../packages/litsx/src/runtime-render-context.js";

let tagCounter = 0;

function nextTag(prefix = "litsx-renderer") {
  tagCounter += 1;
  return `${prefix}-${tagCounter}`;
}

describe("runtime renderer context integration", () => {
  it("upgrades scoped projected content inside shadow-dom hosts", async () => {
    const hostTag = nextTag("litsx-shadow-projector");
    const childTag = nextTag("litsx-shadow-projected-child");

    class ProjectedChild extends HTMLElement {
      connectedCallback() {
        this.setAttribute("data-upgraded", "shadow");
      }
    }

    class ShadowProjector extends HTMLElement {
      static elements = {
        [childTag]: ProjectedChild,
      };

      connectedCallback() {
        if (this.shadowRoot) {
          return;
        }

        const shadowRoot = this.attachShadow({ mode: "open" });
        shadowRoot.customElements = createLightDomRegistry(this, this.constructor.elements);

        const projected = bindRendererContext(
          this,
          () => staticHtml`<${unsafeStatic(childTag)}></${unsafeStatic(childTag)}>`,
          { projected: true },
        );

        render(
          staticHtml`<section>${renderRendererCall(projected)}</section>`,
          shadowRoot,
          { host: this },
        );
      }
    }

    customElements.define(hostTag, ShadowProjector);

    const host = document.createElement(hostTag);
    document.body.appendChild(host);
    await globalThis.happyDOM.whenAsyncComplete();

    const child = host.shadowRoot.querySelector(childTag);
    const projectedHost = child.parentElement?.registry
      ? child.parentElement
      : host.shadowRoot.querySelector("div");

    assert(child);
    assert.strictEqual(Object.getPrototypeOf(child), ProjectedChild.prototype);
    assert.strictEqual(child.getAttribute("data-upgraded"), "shadow");
    assert(projectedHost.registry);
    assert.strictEqual(projectedHost.registry.get(childTag), ProjectedChild);

    document.body.innerHTML = "";
  });

  it("upgrades scoped projected content inside light-dom hosts", async () => {
    const childTag = nextTag("litsx-light-projected-child");

    class ProjectedChild extends HTMLElement {
      connectedCallback() {
        this.setAttribute("data-upgraded", "light");
      }
    }

    const host = document.createElement("section");
    connectLightDomRegistry(host, {
      [childTag]: ProjectedChild,
    });
    Object.defineProperty(host, "constructor", {
      value: {
        elements: {
          [childTag]: ProjectedChild,
        },
      },
      configurable: true,
    });

    const projected = bindRendererContext(
      host,
      () => staticHtml`<${unsafeStatic(childTag)}></${unsafeStatic(childTag)}>`,
      { projected: true },
    );

    document.body.appendChild(host);
    render(
      staticHtml`<section>${renderRendererCall(projected)}</section>`,
      host,
      { host },
    );
    await globalThis.happyDOM.whenAsyncComplete();

    const child = host.querySelector(childTag);

    assert(child);
    assert.strictEqual(Object.getPrototypeOf(child), ProjectedChild.prototype);
    assert.strictEqual(child.getAttribute("data-upgraded"), "light");
    assert(host.registry);
    assert.strictEqual(host.registry.get(childTag), ProjectedChild);

    document.body.innerHTML = "";
  });
});
