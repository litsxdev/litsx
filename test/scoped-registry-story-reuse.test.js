// @vitest-environment jsdom

import assert from "assert";
import { LitElement, html } from "lit";
import { render as renderLightDom } from "lit/html.js";
import { afterEach, describe, it } from "vitest";
import { SuspenseBoundary } from "../packages/core/src/index.js";
import { ShadowDomMixin } from "../packages/core/src/elements/index.js";
import { bindRendererContext } from "../packages/core/src/rendering.js";
import { renderWithSoftSuspense } from "../packages/core/src/runtime-suspense.js";
import { ensureLightDomProxy } from "../packages/scoped-registry-shim/src/index.js";

function defineTestElement(tagName, ctor) {
  if (!customElements.get(tagName)) {
    customElements.define(tagName, ctor);
  }
}

async function settleCanvas(canvas) {
  await Promise.resolve();
  const host = canvas.firstElementChild;
  await host?.updateComplete;
  await Promise.resolve();
  const boundary = host?.shadowRoot?.querySelector?.("[data-story-boundary]");
  await boundary?.updateComplete;
  await Promise.resolve();
  await host?.updateComplete;
}

function createDeferred() {
  let resolve = null;
  const promise = new Promise((nextResolve) => {
    resolve = nextResolve;
  });
  return { promise, resolve };
}

function getBoundaryRegionRoot(boundary, region) {
  const regionHost = boundary?.querySelector?.(
    `[data-litsx-suspense-region="${region}"]`,
  ) ?? null;
  const firstChild = regionHost?.firstElementChild ?? null;
  const isMountHost =
    firstChild?.localName === "div" &&
    firstChild.style?.display === "contents";
  return isMountHost
    ? firstChild.shadowRoot ?? null
    : regionHost ?? null;
}

function queryBoundaryContent(boundary, selector) {
  return getBoundaryRegionRoot(boundary, "content")?.querySelector?.(selector) ?? null;
}

function boundaryHasFallback(boundary) {
  return /data-fallback/.test(getBoundaryRegionRoot(boundary, "fallback")?.innerHTML ?? "");
}

afterEach(() => {
  document.body.innerHTML = "";
});

describe("scoped registry story host reuse", () => {
  it("keeps scoped local story elements working across A -> B -> A navigation without global registration", async () => {
    const childPanelTag = "litsx-story-repro-child-panel";
    const boundaryTag = "suspense-boundary";
    const withBoundaryTag = "litsx-story-repro-with-boundary";
    const withoutBoundaryTag = "litsx-story-repro-without-boundary";

    // Preinstall shim stand-ins so the fixture exercises the projected scoped
    // registry path without relying on later global tag definition order.
    ensureLightDomProxy(childPanelTag);
    ensureLightDomProxy(boundaryTag);

    class BoundaryChildPanel extends LitElement {
      static properties = {
        label: { type: String },
      };

      constructor() {
        super();
        this.label = "Boundary panel";
      }

      render() {
        return html`<div data-panel-label data-kind="boundary">${this.label}</div>`;
      }
    }

    class PlainChildPanel extends LitElement {
      static properties = {
        label: { type: String },
      };

      constructor() {
        super();
        this.label = "Plain panel";
      }

      render() {
        return html`<div data-panel-label data-kind="plain">${this.label}</div>`;
      }
    }

    class StoryWithBoundary extends ShadowDomMixin(LitElement) {
      static properties = {
        label: { type: String },
      };

      static elements = {
        [childPanelTag]: BoundaryChildPanel,
        [boundaryTag]: SuspenseBoundary,
      };

      constructor() {
        super();
        this.label = "With boundary";
      }

      render() {
        return html`
          <section>
            <suspense-boundary
              data-story-boundary
              .fallback=${() => html`<div>Loading...</div>`}
              .content=${bindRendererContext(
                this,
                () => html`<litsx-story-repro-child-panel label=${this.label}></litsx-story-repro-child-panel>`,
                { projected: true },
              )}
            ></suspense-boundary>
          </section>
        `;
      }
    }

    class StoryWithoutBoundary extends ShadowDomMixin(LitElement) {
      static properties = {
        label: { type: String },
      };

      static elements = {
        [childPanelTag]: PlainChildPanel,
      };

      constructor() {
        super();
        this.label = "Without boundary";
      }

      render() {
        return html`
          <section>
            <litsx-story-repro-child-panel label=${this.label}></litsx-story-repro-child-panel>
          </section>
        `;
      }
    }

    defineTestElement(withBoundaryTag, StoryWithBoundary);
    defineTestElement(withoutBoundaryTag, StoryWithoutBoundary);

    const canvas = document.createElement("div");
    document.body.appendChild(canvas);

    let currentHost = document.createElement(withBoundaryTag);
    currentHost.label = "With boundary";
    canvas.replaceChildren(currentHost);
    await settleCanvas(canvas);

    let host = canvas.firstElementChild;
    let boundary = host.shadowRoot.querySelector(boundaryTag);
    let panel = queryBoundaryContent(boundary, childPanelTag);
    assert(panel, "expected the scoped child panel to render in the boundary story");
    assert.strictEqual(Object.getPrototypeOf(panel), BoundaryChildPanel.prototype);
    assert.match(panel.shadowRoot.innerHTML, /With boundary/);
    assert.match(panel.shadowRoot.innerHTML, /data-kind="boundary"/);

    currentHost = document.createElement(withoutBoundaryTag);
    currentHost.label = "Without boundary";
    canvas.replaceChildren(currentHost);
    await settleCanvas(canvas);

    host = canvas.firstElementChild;
    panel = host.shadowRoot.querySelector(childPanelTag);
    assert(panel, "expected the scoped child panel to render in the non-boundary story");
    assert.strictEqual(Object.getPrototypeOf(panel), PlainChildPanel.prototype);
    assert.match(panel.shadowRoot.innerHTML, /Without boundary/);
    assert.match(panel.shadowRoot.innerHTML, /data-kind="plain"/);

    currentHost = document.createElement(withBoundaryTag);
    currentHost.label = "With boundary again";
    canvas.replaceChildren(currentHost);
    await settleCanvas(canvas);

    host = canvas.firstElementChild;
    boundary = host.shadowRoot.querySelector(boundaryTag);
    panel = queryBoundaryContent(boundary, childPanelTag);
    assert(panel, "expected the scoped child panel to render again after host reuse");
    assert.strictEqual(Object.getPrototypeOf(panel), BoundaryChildPanel.prototype);
    assert.match(panel.shadowRoot.innerHTML, /With boundary again/);
    assert.match(panel.shadowRoot.innerHTML, /data-kind="boundary"/);
  });

  it("keeps scoped local elements working when the same story host instance toggles boundary usage", async () => {
    const childPanelTag = "litsx-story-repro-toggle-child-panel";
    const boundaryTag = "suspense-boundary";
    const hostTag = "litsx-story-repro-toggle-host";

    ensureLightDomProxy(childPanelTag);
    ensureLightDomProxy(boundaryTag);

    class ChildPanel extends LitElement {
      static properties = {
        label: { type: String },
      };

      constructor() {
        super();
        this.label = "Panel";
      }

      render() {
        return html`<div data-panel-label>${this.label}</div>`;
      }
    }

    class ToggleStoryHost extends ShadowDomMixin(LitElement) {
      static properties = {
        label: { type: String },
        useBoundary: { type: Boolean },
      };

      static elements = {
        [childPanelTag]: ChildPanel,
        [boundaryTag]: SuspenseBoundary,
      };

      constructor() {
        super();
        this.label = "Panel";
        this.useBoundary = true;
      }

      renderPanel() {
        return html`<litsx-story-repro-toggle-child-panel label=${this.label}></litsx-story-repro-toggle-child-panel>`;
      }

      render() {
        return html`
          <section>
            ${this.useBoundary
              ? html`
                  <suspense-boundary
                    data-story-boundary
                    .fallback=${() => html`<div>Loading...</div>`}
                    .content=${bindRendererContext(this, () => this.renderPanel(), { projected: true })}
                  ></suspense-boundary>
                `
              : this.renderPanel()}
          </section>
        `;
      }
    }

    defineTestElement(hostTag, ToggleStoryHost);

    const host = document.createElement(hostTag);
    document.body.appendChild(host);

    host.label = "With boundary";
    host.useBoundary = true;
    await host.updateComplete;
    await Promise.resolve();
    await host.updateComplete;

    let boundary = host.shadowRoot.querySelector(boundaryTag);
    let panel = queryBoundaryContent(boundary, childPanelTag);
    assert(panel, "expected the scoped child panel to render with the boundary enabled");
    assert.strictEqual(Object.getPrototypeOf(panel), ChildPanel.prototype);
    assert.match(panel.shadowRoot.innerHTML, /With boundary/);

    host.label = "Without boundary";
    host.useBoundary = false;
    await host.updateComplete;
    await Promise.resolve();
    await host.updateComplete;

    panel = host.shadowRoot.querySelector(childPanelTag);
    assert(panel, "expected the scoped child panel to render after removing the boundary");
    assert.strictEqual(Object.getPrototypeOf(panel), ChildPanel.prototype);
    assert.match(panel.shadowRoot.innerHTML, /Without boundary/);

    host.label = "With boundary again";
    host.useBoundary = true;
    await host.updateComplete;
    await Promise.resolve();
    await host.updateComplete;

    boundary = host.shadowRoot.querySelector(boundaryTag);
    panel = queryBoundaryContent(boundary, childPanelTag);
    assert(panel, "expected the scoped child panel to render after re-enabling the boundary");
    assert.strictEqual(Object.getPrototypeOf(panel), ChildPanel.prototype);
    assert.match(panel.shadowRoot.innerHTML, /With boundary again/);
  });

  it("keeps scoped local elements working across storybook-style canvas rerenders after a suspended pass", async () => {
    const panelTag = "litsx-storybook-repro-panel";
    const boundaryTag = "suspense-boundary";
    const withBoundaryTag = "litsx-storybook-repro-with-boundary";
    const withoutBoundaryTag = "litsx-storybook-repro-without-boundary";
    const pending = createDeferred();
    let resolved = false;

    ensureLightDomProxy(panelTag);
    ensureLightDomProxy(boundaryTag);

    class LocalPanel extends ShadowDomMixin(LitElement) {
      static properties = {
        label: { type: String },
        suspend: { type: Boolean },
      };

      constructor() {
        super();
        this.label = "Panel";
        this.suspend = false;
      }

      render() {
        return renderWithSoftSuspense(this, () => {
          if (this.suspend && !resolved) {
            throw pending.promise;
          }

          return html`<div data-panel-label>${this.label}</div>`;
        });
      }
    }

    class StoryWithBoundary extends ShadowDomMixin(LitElement) {
      static properties = {
        label: { type: String },
      };

      static elements = {
        [panelTag]: LocalPanel,
        [boundaryTag]: SuspenseBoundary,
      };

      constructor() {
        super();
        this.label = "With boundary";
      }

      render() {
        return html`
          <section>
            <suspense-boundary
              data-story-boundary
              .fallback=${() => html`<div data-fallback>Loading...</div>`}
              .content=${bindRendererContext(
                this,
                () =>
                  html`<litsx-storybook-repro-panel .label=${this.label} ?suspend=${true}></litsx-storybook-repro-panel>`,
                { projected: true },
              )}
            ></suspense-boundary>
          </section>
        `;
      }
    }

    class StoryWithoutBoundary extends ShadowDomMixin(LitElement) {
      static properties = {
        label: { type: String },
      };

      static elements = {
        [panelTag]: LocalPanel,
      };

      constructor() {
        super();
        this.label = "Without boundary";
      }

      render() {
        return html`
          <section>
            <litsx-storybook-repro-panel .label=${this.label}></litsx-storybook-repro-panel>
          </section>
        `;
      }
    }

    defineTestElement(withBoundaryTag, StoryWithBoundary);
    defineTestElement(withoutBoundaryTag, StoryWithoutBoundary);

    const canvas = document.createElement("div");
    document.body.appendChild(canvas);

    renderLightDom(
      html`<litsx-storybook-repro-with-boundary .label=${"With boundary"}></litsx-storybook-repro-with-boundary>`,
      canvas,
    );
    await settleCanvas(canvas);

    let host = canvas.firstElementChild;
    let boundary = host.shadowRoot.querySelector(boundaryTag);
    await boundary.updateComplete;
    await Promise.resolve();
    await boundary.updateComplete;
    assert(boundaryHasFallback(boundary));

    renderLightDom(
      html`<litsx-storybook-repro-without-boundary .label=${"Without boundary"}></litsx-storybook-repro-without-boundary>`,
      canvas,
    );
    await settleCanvas(canvas);

    host = canvas.firstElementChild;
    let panel = host.shadowRoot.querySelector(panelTag);
    assert(panel, "expected the scoped panel to render in the non-boundary story");
    assert.strictEqual(Object.getPrototypeOf(panel), LocalPanel.prototype);
    assert.match(panel.shadowRoot.innerHTML, /Without boundary/);

    resolved = true;
    pending.resolve();
    await pending.promise;
    await Promise.resolve();

    renderLightDom(
      html`<litsx-storybook-repro-with-boundary .label=${"With boundary again"}></litsx-storybook-repro-with-boundary>`,
      canvas,
    );
    await settleCanvas(canvas);

    host = canvas.firstElementChild;
    boundary = host.shadowRoot.querySelector(boundaryTag);
    await boundary.updateComplete;
    await Promise.resolve();
    await boundary.updateComplete;

    panel = queryBoundaryContent(boundary, panelTag);
    assert(panel, "expected the scoped panel to render again after returning to the suspended story");
    assert.strictEqual(Object.getPrototypeOf(panel), LocalPanel.prototype);
    assert.match(panel.shadowRoot.innerHTML, /With boundary again/);
  });

  it("keeps nested scoped children working when navigating from a suspended boundary story to a direct async story", async () => {
    const panelTag = "litsx-storybook-nested-panel";
    const nestedTag = "litsx-storybook-nested-card";
    const boundaryTag = "suspense-boundary";
    const withBoundaryTag = "litsx-storybook-nested-with-boundary";
    const withoutBoundaryTag = "litsx-storybook-nested-without-boundary";
    const pendingByMode = new Map();
    const resolvedModes = new Set();

    function getPending(mode) {
      let pending = pendingByMode.get(mode);
      if (!pending) {
        pending = createDeferred();
        pendingByMode.set(mode, pending);
      }
      return pending;
    }

    function suspendMode(mode) {
      if (resolvedModes.has(mode)) {
        return;
      }
      throw getPending(mode).promise;
    }

    async function resolveMode(mode) {
      resolvedModes.add(mode);
      const pending = getPending(mode);
      pending.resolve();
      await pending.promise;
    }

    ensureLightDomProxy(panelTag);
    ensureLightDomProxy(boundaryTag);

    class NestedCard extends LitElement {
      static properties = {
        label: { type: String },
      };

      constructor() {
        super();
        this.label = "Nested";
      }

      render() {
        return html`<div data-nested-card>${this.label}</div>`;
      }
    }

    class NestedPanel extends ShadowDomMixin(LitElement) {
      static properties = {
        label: { type: String },
        mode: { type: String },
      };

      static elements = {
        [nestedTag]: NestedCard,
      };

      constructor() {
        super();
        this.label = "Panel";
        this.mode = "ready";
      }

      render() {
        return renderWithSoftSuspense(this, () => {
          if (this.mode !== "ready") {
            suspendMode(this.mode);
          }

          return html`
            <section>
              <litsx-storybook-nested-card .label=${this.label}></litsx-storybook-nested-card>
            </section>
          `;
        });
      }
    }

    class StoryWithBoundary extends ShadowDomMixin(LitElement) {
      static properties = {
        label: { type: String },
      };

      static elements = {
        [panelTag]: NestedPanel,
        [boundaryTag]: SuspenseBoundary,
      };

      constructor() {
        super();
        this.label = "With boundary";
      }

      render() {
        return html`
          <section>
            <suspense-boundary
              data-story-boundary
              .fallback=${() => html`<div data-fallback>Loading...</div>`}
              .content=${bindRendererContext(
                this,
                () =>
                  html`<litsx-storybook-nested-panel .label=${this.label} mode="with-boundary"></litsx-storybook-nested-panel>`,
                { projected: true },
              )}
            ></suspense-boundary>
          </section>
        `;
      }
    }

    class StoryWithoutBoundary extends ShadowDomMixin(LitElement) {
      static properties = {
        label: { type: String },
      };

      static elements = {
        [panelTag]: NestedPanel,
      };

      constructor() {
        super();
        this.label = "Without boundary";
      }

      render() {
        return html`
          <section>
            <litsx-storybook-nested-panel .label=${this.label} mode="without-boundary"></litsx-storybook-nested-panel>
          </section>
        `;
      }
    }

    defineTestElement(withBoundaryTag, StoryWithBoundary);
    defineTestElement(withoutBoundaryTag, StoryWithoutBoundary);

    const canvas = document.createElement("div");
    document.body.appendChild(canvas);

    renderLightDom(
      html`<litsx-storybook-nested-with-boundary .label=${"With boundary"}></litsx-storybook-nested-with-boundary>`,
      canvas,
    );
    await settleCanvas(canvas);

    let host = canvas.firstElementChild;
    let boundary = host.shadowRoot.querySelector(boundaryTag);
    await boundary.updateComplete;
    await Promise.resolve();
    await boundary.updateComplete;
    assert(boundaryHasFallback(boundary));

    renderLightDom(
      html`<litsx-storybook-nested-without-boundary .label=${"Without boundary"}></litsx-storybook-nested-without-boundary>`,
      canvas,
    );
    await settleCanvas(canvas);

    host = canvas.firstElementChild;
    let panel = host.shadowRoot.querySelector(panelTag);
    assert(panel, "expected the direct async panel to remain mounted after navigation");
    assert.strictEqual(Object.getPrototypeOf(panel), NestedPanel.prototype);
    assert.match(panel.shadowRoot.innerHTML, /<!---->/);

    await resolveMode("with-boundary");
    await resolveMode("without-boundary");
    await Promise.resolve();
    await host.updateComplete;
    await Promise.resolve();
    await host.updateComplete;
    await panel.updateComplete;
    await Promise.resolve();
    await panel.updateComplete;

    panel = host.shadowRoot.querySelector(panelTag);
    const nested = panel.shadowRoot.querySelector(nestedTag);
    assert(nested, "expected the nested scoped child to render after the direct async panel resolves");
    assert.strictEqual(Object.getPrototypeOf(nested), NestedCard.prototype);
    assert.match(nested.shadowRoot.innerHTML, /Without boundary/);
  });

});
