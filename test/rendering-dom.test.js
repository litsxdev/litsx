// @vitest-environment happy-dom

import assert from "assert";
import { LitElement, html } from "lit";
import { html as staticHtml, unsafeStatic } from "lit/static-html.js";
import { afterEach, describe, it } from "vitest";
import {
  bindRendererContext,
  renderRendererCall,
} from "../packages/core/src/rendering.js";
import {
  LightDomMixin,
  ShadowDomMixin,
} from "../packages/core/src/elements/index.js";

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

function findProjectedMount(scope) {
  const root = scope instanceof ShadowRoot ? scope : scope?.shadowRoot ?? scope;
  if (!root || typeof root.querySelectorAll !== "function") {
    return null;
  }

  for (const element of root.querySelectorAll("*")) {
    if (element.shadowRoot) {
      return element;
    }
  }

  return null;
}

function queryProjected(scope, selector) {
  const mount = findProjectedMount(scope);
  return mount?.shadowRoot?.querySelector?.(selector) ?? null;
}

function findProjectedHost(scope) {
  const root = scope instanceof ShadowRoot ? scope : scope?.shadowRoot ?? scope;
  if (!root || typeof root.querySelector !== "function") {
    return null;
  }

  return root.querySelector('div[style*="display: contents"]');
}

describe("runtime renderer context DOM integration", () => {
  it("projects renderer-created scoped elements through a shadow DOM host", async () => {
    const hostTag = nextTag("litsx-render-shadow-host");
    const childTag = nextTag("litsx-render-shadow-child");

    class ScopedChild extends HTMLElement {
      connectedCallback() {
        this.connected = true;
      }
    }

    class ShadowHost extends ShadowDomMixin(LitElement) {
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

    const projectedHost = findProjectedMount(host.shadowRoot);
    const child = queryProjected(host.shadowRoot, childTag);

    assert(projectedHost);
    assert(child);
    assert.strictEqual(Object.getPrototypeOf(child), ScopedChild.prototype);
    assert.equal(child.connected, true);
    assert.equal(child.textContent, "shadow child");
  });

  it("rejects renderer-created scoped elements through a light DOM host", async () => {
    const hostTag = nextTag("litsx-render-light-host");
    const childTag = nextTag("litsx-render-light-child");

    class ScopedChild extends HTMLElement {
      connectedCallback() {
        this.connected = true;
      }
    }

    class LightHost extends LightDomMixin(LitElement) {
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

    assert.throws(
      () => document.createElement(hostTag),
      /cannot use static elements with LightDomMixin/
    );
  });

  it("projects plain renderer output directly through a light DOM host", async () => {
    const hostTag = nextTag("litsx-render-light-plain-host");

    class LightHost extends LightDomMixin(LitElement) {
      constructor() {
        super();
        this.itemRenderer = (label) => html`<span class="light-projected">${label}</span>`;
      }

      render() {
        return html`
          <section>
            ${renderRendererCall(
              bindRendererContext(this, this.itemRenderer, { projected: true }),
              "light child",
            )}
          </section>
        `;
      }
    }

    defineTestElement(hostTag, LightHost);

    const host = document.createElement(hostTag);
    document.body.appendChild(host);
    await settleHost(host);

    const projectedHost = findProjectedHost(host);
    const child = projectedHost?.querySelector?.(".light-projected") ?? null;

    assert(projectedHost, "expected a renderer host placeholder in light DOM");
    assert.strictEqual(findProjectedMount(host), null);
    assert(child, "expected projected light DOM content to render directly");
    assert.equal(child.textContent.trim(), "light child");
  });

  it("rejects renderer props with scoped custom elements through nested light DOM components", async () => {
    const hostTag = nextTag("litsx-render-light-prop-host");
    const panelTag = "litsx-render-light-prop-panel";
    const childTag = "litsx-render-light-prop-child";

    class ScopedChild extends HTMLElement {
      connectedCallback() {
        this.connected = true;
      }
    }

    class LightPanel extends LightDomMixin(LitElement) {
      static properties = {
        footerRenderer: { attribute: false },
      };

      constructor() {
        super();
        this.footerRenderer = null;
      }

      render() {
        return html`
          <article>
            <footer>
              ${renderRendererCall(this.footerRenderer)}
            </footer>
          </article>
        `;
      }
    }

    class LightHost extends LightDomMixin(LitElement) {
      static elements = {
        [panelTag]: LightPanel,
        [childTag]: ScopedChild,
      };

      renderFooter() {
        const child = document.createElement(childTag);
        child.textContent = "projected child";
        return child;
      }
    }

    defineTestElement(hostTag, LightHost);

    assert.throws(
      () => document.createElement(hostTag),
      /cannot use static elements with LightDomMixin/
    );
  });

  it("projects renderer props with scoped custom elements through nested shadow DOM components", async () => {
    const hostTag = nextTag("litsx-render-shadow-prop-host");
    const panelTag = nextTag("litsx-render-shadow-prop-panel");
    const childTag = nextTag("litsx-render-shadow-prop-child");

    class ScopedChild extends HTMLElement {
      connectedCallback() {
        this.connected = true;
      }
    }

    class ShadowPanel extends ShadowDomMixin(LitElement) {
      static properties = {
        footerRenderer: { attribute: false },
      };

      constructor() {
        super();
        this.footerRenderer = null;
      }

      render() {
        return html`
          <article>
            <footer>
              ${renderRendererCall(this.footerRenderer)}
            </footer>
          </article>
        `;
      }
    }

    class ShadowHost extends ShadowDomMixin(LitElement) {
      static elements = {
        [panelTag]: ShadowPanel,
        [childTag]: ScopedChild,
      };

      renderFooter() {
        const child = document.createElement(childTag);
        child.textContent = "projected shadow child";
        return child;
      }

      render() {
        const panel = this.renderRoot.createElement(panelTag);
        panel.footerRenderer = bindRendererContext(this, this.renderFooter, { projected: true });
        return panel;
      }
    }

    defineTestElement(hostTag, ShadowHost);

    const host = document.createElement(hostTag);
    document.body.appendChild(host);
    await settleHost(host);

    const panel = host.shadowRoot.querySelector(panelTag);
    await settleHost(panel);
    const child = queryProjected(panel.shadowRoot, childTag);

    assert(panel, "expected the nested shadow panel to render");
    assert(child, "expected the renderer-created scoped shadow child to render");
    assert.strictEqual(Object.getPrototypeOf(panel), ShadowPanel.prototype);
    assert.strictEqual(Object.getPrototypeOf(child), ScopedChild.prototype);
    assert.equal(child.connected, true);
    assert.equal(child.textContent.trim(), "projected shadow child");
  });

  it("projects renderer props with plain content through nested light DOM components", async () => {
    const hostTag = nextTag("litsx-render-light-prop-plain-host");
    const panelTag = nextTag("litsx-render-light-prop-plain-panel");

    class LightPanel extends LightDomMixin(LitElement) {
      static properties = {
        footerRenderer: { attribute: false },
      };

      constructor() {
        super();
        this.footerRenderer = null;
      }

      render() {
        return html`
          <article>
            <footer>
              ${renderRendererCall(this.footerRenderer)}
            </footer>
          </article>
        `;
      }
    }

    class LightHost extends LightDomMixin(LitElement) {
      renderFooter() {
        return html`<span class="plain-footer">projected light footer</span>`;
      }

      render() {
        const panel = document.createElement(panelTag);
        panel.footerRenderer = bindRendererContext(this, this.renderFooter, { projected: true });
        return panel;
      }
    }

    defineTestElement(panelTag, LightPanel);
    defineTestElement(hostTag, LightHost);

    const host = document.createElement(hostTag);
    document.body.appendChild(host);
    await settleHost(host);

    const panel = host.querySelector(panelTag);
    await settleHost(panel);
    const footer = panel.querySelector(".plain-footer");

    assert(panel, "expected the nested light panel to render");
    assert.strictEqual(findProjectedMount(panel), null);
    assert(footer, "expected projected plain light DOM content to render directly");
    assert.equal(footer.textContent.trim(), "projected light footer");
  });

  it("resolves different constructors for the same tag across nested shadow DOM scopes", async () => {
    const hostTag = nextTag("litsx-render-shadow-nested-host");
    const panelTag = nextTag("litsx-render-shadow-nested-panel");
    const sharedTag = nextTag("litsx-render-shadow-nested-action");
    const sharedTagStatic = unsafeStatic(sharedTag);
    const panelTagStatic = unsafeStatic(panelTag);

    class OuterAction extends HTMLElement {
      connectedCallback() {
        this.scope = "outer";
      }
    }

    class InnerAction extends HTMLElement {
      connectedCallback() {
        this.scope = "inner";
      }
    }

    class InnerPanel extends ShadowDomMixin(LitElement) {
      static elements = {
        [sharedTag]: InnerAction,
      };

      render() {
        return staticHtml`
          <${sharedTagStatic}>inner action</${sharedTagStatic}>
        `;
      }
    }

    class OuterHost extends ShadowDomMixin(LitElement) {
      static elements = {
        [sharedTag]: OuterAction,
        [panelTag]: InnerPanel,
      };

      render() {
        return staticHtml`
          <${sharedTagStatic}>outer action</${sharedTagStatic}>
          <${panelTagStatic}></${panelTagStatic}>
        `;
      }
    }

    defineTestElement(hostTag, OuterHost);

    const host = document.createElement(hostTag);
    document.body.appendChild(host);
    await settleHost(host);

    const outerAction = host.shadowRoot.querySelector(sharedTag);
    const panel = host.shadowRoot.querySelector(panelTag);
    await settleHost(panel);
    const innerAction = panel.shadowRoot.querySelector(sharedTag);

    assert(outerAction, "expected the outer scoped element to render");
    assert(panel, "expected the nested scoped shadow component to render");
    assert(innerAction, "expected the inner scoped element to render");
    assert.strictEqual(Object.getPrototypeOf(outerAction), OuterAction.prototype);
    assert.strictEqual(Object.getPrototypeOf(panel), InnerPanel.prototype);
    assert.strictEqual(Object.getPrototypeOf(innerAction), InnerAction.prototype);
    assert.equal(outerAction.scope, "outer");
    assert.equal(innerAction.scope, "inner");
    assert.equal(outerAction.textContent.trim(), "outer action");
    assert.equal(innerAction.textContent.trim(), "inner action");
  });

  it("rejects different constructors for the same tag across nested light DOM scopes", async () => {
    const hostTag = nextTag("litsx-render-light-nested-host");
    const panelTag = nextTag("litsx-render-light-nested-panel");
    const sharedTag = nextTag("litsx-render-light-nested-action");
    const sharedTagStatic = unsafeStatic(sharedTag);
    const panelTagStatic = unsafeStatic(panelTag);

    class OuterAction extends HTMLElement {
      connectedCallback() {
        this.scope = "outer";
      }
    }

    class InnerAction extends HTMLElement {
      connectedCallback() {
        this.scope = "inner";
      }
    }

    class InnerPanel extends LightDomMixin(LitElement) {
      static elements = {
        [sharedTag]: InnerAction,
      };

      render() {
        return staticHtml`
          <${sharedTagStatic}>inner action</${sharedTagStatic}>
        `;
      }
    }

    class OuterHost extends LightDomMixin(LitElement) {
      static elements = {
        [sharedTag]: OuterAction,
        [panelTag]: InnerPanel,
      };

      render() {
        return staticHtml`
          <${sharedTagStatic}>outer action</${sharedTagStatic}>
          <${panelTagStatic}></${panelTagStatic}>
        `;
      }
    }

    defineTestElement(hostTag, OuterHost);

    assert.throws(
      () => document.createElement(hostTag),
      /cannot use static elements with LightDomMixin/
    );
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

    class ShadowHost extends ShadowDomMixin(LitElement) {
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

    const firstChild = queryProjected(host.shadowRoot, childTag);
    assert.strictEqual(Object.getPrototypeOf(firstChild), ScopedChild.prototype);
    assert.equal(firstChild.kind, "scoped");

    customElements.define(childTag, GlobalChild);
    host.label = "second";
    await settleHost(host);

    const secondChild = queryProjected(host.shadowRoot, childTag);
    const globalChild = document.createElement(childTag);
    document.body.appendChild(globalChild);

    assert.strictEqual(Object.getPrototypeOf(secondChild), ScopedChild.prototype);
    assert.strictEqual(Object.getPrototypeOf(globalChild), GlobalChild.prototype);
    assert.equal(secondChild.textContent, "second");
    assert.equal(secondChild.kind, "scoped");
    assert.equal(globalChild.kind, "global");
  });

  it("updates attributes, text, and component type in shadow DOM projected renderer output", async () => {
    const hostTag = nextTag("litsx-render-shadow-update-host");
    const firstTag = nextTag("litsx-render-shadow-update-first");
    const secondTag = nextTag("litsx-render-shadow-update-second");

    class FirstProjected extends HTMLElement {
      connectedCallback() {
        this.kind = "first";
      }
    }

    class SecondProjected extends HTMLElement {
      connectedCallback() {
        this.kind = "second";
      }
    }

    class ShadowHost extends ShadowDomMixin(LitElement) {
      static properties = {
        label: { type: String },
        mode: { type: String },
        state: { type: String },
      };

      static elements = {
        [firstTag]: FirstProjected,
        [secondTag]: SecondProjected,
      };

      constructor() {
        super();
        this.label = "initial shadow label";
        this.mode = "first";
        this.state = "initial";
      }

      itemRenderer(mode, state, label) {
        const child = document.createElement(mode === "second" ? secondTag : firstTag);
        child.textContent = `${mode} projected action`;
        return [
          html`<span class="projected-status" data-state=${state}>${label}</span>`,
          child,
        ];
      }

      render() {
        return html`
          ${renderRendererCall(
            bindRendererContext(this, this.itemRenderer, { projected: true }),
            this.mode,
            this.state,
            this.label,
          )}
        `;
      }
    }

    defineTestElement(hostTag, ShadowHost);

    const host = document.createElement(hostTag);
    document.body.appendChild(host);
    await settleHost(host);

    const firstChild = queryProjected(host.shadowRoot, firstTag);
    const firstStatus = queryProjected(host.shadowRoot, ".projected-status");
    assert(firstStatus, "expected initial projected shadow status");
    assert(firstChild, "expected initial projected shadow component");
    assert.strictEqual(Object.getPrototypeOf(firstChild), FirstProjected.prototype);
    assert.equal(firstChild.kind, "first");
    assert.equal(firstStatus.getAttribute("data-state"), "initial");
    assert.equal(firstStatus.textContent.trim(), "initial shadow label");
    assert.equal(firstChild.textContent.trim(), "first projected action");

    host.state = "updated";
    host.label = "updated shadow label";
    await settleHost(host);

    const updatedFirstChild = queryProjected(host.shadowRoot, firstTag);
    const updatedFirstStatus = queryProjected(host.shadowRoot, ".projected-status");
    assert(updatedFirstStatus, "expected updated projected shadow status");
    assert(updatedFirstChild, "expected updated projected shadow component");
    assert.strictEqual(Object.getPrototypeOf(updatedFirstChild), FirstProjected.prototype);
    assert.equal(updatedFirstStatus.getAttribute("data-state"), "updated");
    assert.equal(updatedFirstStatus.textContent.trim(), "updated shadow label");
    assert.equal(updatedFirstChild.textContent.trim(), "first projected action");

    host.mode = "second";
    host.state = "replaced";
    host.label = "replacement shadow label";
    await settleHost(host);

    const removedFirstChild = queryProjected(host.shadowRoot, firstTag);
    const secondChild = queryProjected(host.shadowRoot, secondTag);
    const secondStatus = queryProjected(host.shadowRoot, ".projected-status");
    assert.strictEqual(removedFirstChild, null);
    assert(secondStatus, "expected replacement projected shadow status");
    assert(secondChild, "expected replacement projected shadow component");
    assert.strictEqual(Object.getPrototypeOf(secondChild), SecondProjected.prototype);
    assert.equal(secondChild.kind, "second");
    assert.equal(secondStatus.getAttribute("data-state"), "replaced");
    assert.equal(secondStatus.textContent.trim(), "replacement shadow label");
    assert.equal(secondChild.textContent.trim(), "second projected action");
  });

  it("rejects light DOM projected renderer output that depends on scoped elements", async () => {
    const hostTag = nextTag("litsx-render-light-update-host");
    const firstTag = nextTag("litsx-render-light-update-first");
    const secondTag = nextTag("litsx-render-light-update-second");

    class FirstProjected extends HTMLElement {
      connectedCallback() {
        this.kind = "first";
      }
    }

    class SecondProjected extends HTMLElement {
      connectedCallback() {
        this.kind = "second";
      }
    }

    class LightHost extends LightDomMixin(LitElement) {
      static properties = {
        label: { type: String },
        mode: { type: String },
        state: { type: String },
      };

      static elements = {
        [firstTag]: FirstProjected,
        [secondTag]: SecondProjected,
      };

      constructor() {
        super();
        this.label = "initial light label";
        this.mode = "first";
        this.state = "initial";
      }

      itemRenderer(mode, state, label) {
        const child = document.createElement(mode === "second" ? secondTag : firstTag);
        child.textContent = `${mode} projected action`;
        return [
          html`<span class="projected-status" data-state=${state}>${label}</span>`,
          child,
        ];
      }

      render() {
        return html`
          ${renderRendererCall(
            bindRendererContext(this, this.itemRenderer, { projected: true }),
            this.mode,
            this.state,
            this.label,
          )}
        `;
      }
    }

    defineTestElement(hostTag, LightHost);

    assert.throws(
      () => document.createElement(hostTag),
      /cannot use static elements with LightDomMixin/
    );
  });
});
