import { LitElement, html } from "lit";
import { render as renderLightDom } from "lit/html.js";
import { SuspenseBoundary } from "../../../packages/core/src/index.js";
import { ShadowDomMixin } from "../../../packages/core/src/elements/index.js";
import { bindRendererContext } from "../../../packages/core/src/rendering.js";
import { renderWithSoftSuspense } from "../../../packages/core/src/runtime-suspense.js";
import { connectLightDomRegistry } from "../../../packages/scoped-registry-shim/src/index.js";

// This fixture still imports the historical shim package directly because it is
// exercising fallback scoped-registry behavior in a real browser.
const canvas = document.getElementById("canvas");
const panelTag = "browser-repro-panel";
const nestedTag = "browser-repro-card";
const boundaryTag = "suspense-boundary";
const withBoundaryTag = "browser-repro-with-boundary";
const withoutBoundaryTag = "browser-repro-without-boundary";
const pendingByMode = new Map();
const resolvedModes = new Set();

function createDeferred() {
  let resolve = null;
  const promise = new Promise((nextResolve) => {
    resolve = nextResolve;
  });
  return { promise, resolve };
}

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

function defineTestElement(tagName, ctor) {
  if (!customElements.get(tagName)) {
    customElements.define(tagName, ctor);
  }
}

async function settleCanvas() {
  await Promise.resolve();
  const host = canvas.firstElementChild;
  await host?.updateComplete;
  await Promise.resolve();
  const boundary = host?.shadowRoot?.querySelector?.("[data-story-boundary]");
  await boundary?.updateComplete;
  await Promise.resolve();
  await host?.updateComplete;
  return host;
}

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
          <browser-repro-card .label=${this.label}></browser-repro-card>
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
              html`<browser-repro-panel .label=${this.label} mode="with-boundary"></browser-repro-panel>`,
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
        <browser-repro-panel .label=${this.label} mode="without-boundary"></browser-repro-panel>
      </section>
    `;
  }
}

defineTestElement(withBoundaryTag, StoryWithBoundary);
defineTestElement(withoutBoundaryTag, StoryWithoutBoundary);

window.__repro = {
  async renderStory(kind) {
    if (kind === "with") {
      renderLightDom(
        html`<browser-repro-with-boundary .label=${"With boundary"}></browser-repro-with-boundary>`,
        canvas,
      );
    } else {
      renderLightDom(
        html`<browser-repro-without-boundary .label=${"Without boundary"}></browser-repro-without-boundary>`,
        canvas,
      );
    }
    return settleCanvas();
  },
  async resolveMode(mode) {
    await resolveMode(mode);
    await Promise.resolve();
    const host = canvas.firstElementChild;
    await host?.updateComplete;
    const panel = host?.shadowRoot?.querySelector?.(panelTag);
    await panel?.updateComplete;
    await Promise.resolve();
    await host?.updateComplete;
    await panel?.updateComplete;
    return true;
  },
  snapshot() {
    const host = canvas.firstElementChild;
    const boundary = host?.shadowRoot?.querySelector?.(boundaryTag) ?? null;
    const contentRegion =
      boundary?.querySelector?.('[data-litsx-suspense-region="content"]') ?? null;
    const fallbackRegion =
      boundary?.querySelector?.('[data-litsx-suspense-region="fallback"]') ?? null;
    const contentFirstChild = contentRegion?.firstElementChild ?? null;
    const contentUsesMountHost =
      contentFirstChild?.localName === "div" &&
      contentFirstChild?.style?.display === "contents";
    const directPanel =
      contentUsesMountHost ? null : contentRegion?.querySelector?.(panelTag) ?? null;
    const mountedPanel =
      contentUsesMountHost
        ? contentFirstChild?.shadowRoot?.querySelector?.(panelTag) ?? null
        : null;
    const panel = directPanel ?? mountedPanel ?? host?.shadowRoot?.querySelector?.(panelTag) ?? null;
    const nested = panel?.shadowRoot?.querySelector?.(nestedTag) ?? null;
    return {
      hostTag: host?.localName ?? null,
      hostShadow: host?.shadowRoot?.innerHTML ?? null,
      boundaryHtml: boundary?.innerHTML ?? null,
      contentRegionHtml: contentRegion?.innerHTML ?? null,
      fallbackRegionHtml: fallbackRegion?.innerHTML ?? null,
      contentUsesMountHost,
      boundaryDirectPanelTag: directPanel?.localName ?? null,
      boundaryDirectPanelCtor: directPanel ? Object.getPrototypeOf(directPanel).constructor.name : null,
      panelHtml: panel?.shadowRoot?.innerHTML ?? null,
      panelCtor: panel ? Object.getPrototypeOf(panel).constructor.name : null,
      nestedHtml: nested?.shadowRoot?.innerHTML ?? null,
      nestedProtoName: nested ? Object.getPrototypeOf(nested).constructor.name : null,
    };
  },
  async probeScopedTagCollision({ sameTag }) {
    const attachKey = (() => {
      const registry = new CustomElementRegistry();
      for (const key of ["registry", "customElements", "customElementRegistry"]) {
        const host = document.createElement("div");
        try {
          const root = host.attachShadow({ mode: "open", [key]: registry });
          if (root?.[key] === registry) {
            return key;
          }
        } catch {
          // Try the next supported attach option.
        }
      }
      return null;
    })();

    const collisionPanelTag = "probe-panel";
    const collisionCardTag = "probe-card";
    const collisionHostTag = "probe-host";
    const collisionShellTag = "probe-shell";
    const collisionLightTag = sameTag ? collisionPanelTag : "probe-light";

    class ForcedNativeShadowHost extends LitElement {
      createRenderRoot() {
        if (this.shadowRoot) {
          return this.shadowRoot;
        }

        const elements = this.constructor.elements ?? {};
        const registry = new CustomElementRegistry();
        for (const [tagName, ctor] of Object.entries(elements)) {
          registry.define(tagName, ctor);
        }

        this.registry = registry;
        const root = this.attachShadow({
          mode: "open",
          ...(attachKey ? { [attachKey]: registry } : {}),
        });

        for (const key of ["registry", "customElements", "customElementRegistry"]) {
          try {
            root[key] = registry;
          } catch {
            // Ignore readonly aliases.
          }
        }

        return root;
      }
    }

    class ProbeCard extends LitElement {
      render() {
        return html`<div>ok</div>`;
      }
    }

    class ProbePanel extends ForcedNativeShadowHost {
      static elements = {
        [collisionCardTag]: ProbeCard,
      };

      render() {
        return html`<probe-card></probe-card>`;
      }
    }

    class ProbeHost extends ForcedNativeShadowHost {
      static elements = {
        [collisionPanelTag]: ProbePanel,
      };

      render() {
        return html`<probe-panel></probe-panel>`;
      }
    }

    class ProbeShell extends LitElement {
      createRenderRoot() {
        return this.shadowRoot ?? this.attachShadow({ mode: "open" });
      }

      render() {
        return html`<probe-host></probe-host>`;
      }
    }

    class LightDomOnly extends LitElement {
      render() {
        return html`<div>light</div>`;
      }
    }

    if (!customElements.get(collisionHostTag)) {
      customElements.define(collisionHostTag, ProbeHost);
    }
    if (!customElements.get(collisionShellTag)) {
      customElements.define(collisionShellTag, ProbeShell);
    }

    const anchor = document.createElement("div");
    connectLightDomRegistry(anchor, {
      [collisionLightTag]: sameTag ? ProbePanel : LightDomOnly,
    });

    const independent = document.createElement(collisionHostTag);
    document.body.appendChild(independent);
    await independent.updateComplete;
    const independentPanel = independent.shadowRoot?.querySelector?.(collisionPanelTag) ?? null;
    await independentPanel?.updateComplete;
    const independentCard = independentPanel?.shadowRoot?.querySelector?.(collisionCardTag) ?? null;

    const shell = document.createElement(collisionShellTag);
    document.body.appendChild(shell);
    await shell.updateComplete;
    const nestedHost = shell.shadowRoot?.querySelector?.(collisionHostTag) ?? null;
    await nestedHost?.updateComplete;
    const nestedPanel = nestedHost?.shadowRoot?.querySelector?.(collisionPanelTag) ?? null;
    await nestedPanel?.updateComplete;
    const nestedCard = nestedPanel?.shadowRoot?.querySelector?.(collisionCardTag) ?? null;

    independent.remove();
    shell.remove();

    return {
      sameTag,
      independent: {
        panelCtor: independentPanel?.constructor?.name ?? null,
        cardCtor: independentCard?.constructor?.name ?? null,
      },
      nested: {
        hostCtor: nestedHost?.constructor?.name ?? null,
        panelCtor: nestedPanel?.constructor?.name ?? null,
        cardCtor: nestedCard?.constructor?.name ?? null,
      },
    };
  },
};
