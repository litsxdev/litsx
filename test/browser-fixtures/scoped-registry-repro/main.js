import { LitElement, html } from "lit";
import { render as renderLightDom } from "lit/html.js";
import { SuspenseBoundary } from "../../../packages/core/src/index.js";
import { LightDomMixin, ShadowDomMixin } from "../../../packages/core/src/elements/index.js";
import { bindRendererContext } from "../../../packages/core/src/rendering.js";
import { renderWithSoftSuspense } from "../../../packages/core/src/runtime-suspense.js";
import {
  connectLightDomRegistry,
  isLightDomRegistryRuntimeActive,
} from "../../../packages/scoped-registry-shim/src/index.js";

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
  async probePlainLightDomCost() {
    const hostTag = "probe-plain-light-host";
    const registryBefore = window.customElements;

    class PlainLightHost extends LightDomMixin(LitElement) {
      render() {
        return html`<span>plain</span>`;
      }
    }

    defineTestElement(hostTag, PlainLightHost);
    const host = document.createElement(hostTag);
    document.body.appendChild(host);
    await host.updateComplete;

    return {
      hostCtor: host.constructor.name,
      usesLightDom: host.shadowRoot === null,
      shimActive: isLightDomRegistryRuntimeActive(),
      registryUnchanged: window.customElements === registryBefore,
      text: host.textContent.trim(),
    };
  },

  async probeLightDomInitialization() {
    const childTag = "probe-light-init-child";
    const hostTag = "probe-light-init-host";
    const calls = [];

    class InitChild extends LitElement {
      static properties = {
        value: { type: String },
        enabled: { type: Boolean, reflect: true },
      };

      constructor() {
        super();
        calls.push("child:constructor");
        this.value ??= "constructor-default";
      }

      connectedCallback() {
        super.connectedCallback();
        calls.push("child:connected");
      }

      disconnectedCallback() {
        calls.push("child:disconnected");
        super.disconnectedCallback();
      }

      render() {
        return html`<span data-value=${this.value}>${this.value}</span>`;
      }
    }

    class InitHost extends LightDomMixin(LitElement) {
      static elements = { [childTag]: InitChild };

      render() {
        return html`<probe-light-init-child .value=${"bound-value"} .enabled=${true}></probe-light-init-child>`;
      }
    }

    defineTestElement(hostTag, InitHost);
    const host = document.createElement(hostTag);
    document.body.appendChild(host);
    await host.updateComplete;
    const child = host.querySelector(childTag);
    await child?.updateComplete;

    const beforeReconnect = {
      hostCtor: host.constructor.name,
      hostUsesLightDom: host.shadowRoot === null,
      childCtor: child?.constructor?.name ?? null,
      value: child?.value ?? null,
      enabled: child?.enabled ?? null,
      enabledAttribute: child?.hasAttribute("enabled") ?? false,
      renderedValue: child?.shadowRoot?.querySelector("span")?.textContent ?? null,
      calls: [...calls],
    };

    host.remove();
    document.body.appendChild(host);
    await host.updateComplete;
    await child?.updateComplete;

    return {
      beforeReconnect,
      afterReconnect: {
        sameChild: host.querySelector(childTag) === child,
        registryRestored: host.registry?.get(childTag) === InitChild,
        calls: [...calls],
      },
    };
  },

  async probeNestedLightScopes() {
    const sharedTag = "probe-context-item";
    const innerTag = "probe-context-inner";
    const outerTag = "probe-context-outer";

    class OuterItem extends HTMLElement {
      constructor() {
        super();
        this.kind = "outer";
      }
    }

    class InnerItem extends HTMLElement {
      constructor() {
        super();
        this.kind = "inner";
      }
    }

    class InnerHost extends LightDomMixin(LitElement) {
      static elements = { [sharedTag]: InnerItem };
      render() {
        return html`<probe-context-item data-scope="inner"></probe-context-item>`;
      }
    }

    class OuterHost extends LightDomMixin(LitElement) {
      static elements = {
        [sharedTag]: OuterItem,
        [innerTag]: InnerHost,
      };
      render() {
        return html`
          <probe-context-item data-scope="outer"></probe-context-item>
          <probe-context-inner></probe-context-inner>
        `;
      }
    }

    defineTestElement(outerTag, OuterHost);
    const outer = document.createElement(outerTag);
    document.body.appendChild(outer);
    await outer.updateComplete;
    const inner = outer.querySelector(innerTag);
    await inner?.updateComplete;
    const outerItem = outer.querySelector(`${sharedTag}[data-scope="outer"]`);
    const innerItem = inner?.querySelector(sharedTag);

    return {
      outerHostCtor: outer.constructor.name,
      innerHostCtor: inner?.constructor?.name ?? null,
      outerItemCtor: outerItem?.constructor?.name ?? null,
      innerItemCtor: innerItem?.constructor?.name ?? null,
      outerKind: outerItem?.kind ?? null,
      innerKind: innerItem?.kind ?? null,
    };
  },

  async probeLightShadowInteroperability() {
    const leafTag = "probe-mixed-leaf";
    const innerLightTag = "probe-mixed-inner-light";
    const shadowTag = "probe-mixed-shadow";
    const outerLightTag = "probe-mixed-outer-light";

    class MixedLeaf extends LitElement {
      constructor() {
        super();
        this.initialized = "leaf-ready";
      }
      render() {
        return html`<button @click=${() => this.dispatchEvent(new CustomEvent("mixed-ready", {
          bubbles: true,
          composed: true,
          detail: this.initialized,
        }))}>${this.initialized}</button>`;
      }
    }

    class InnerLight extends LightDomMixin(LitElement) {
      static elements = { [leafTag]: MixedLeaf };
      render() {
        return html`<probe-mixed-leaf></probe-mixed-leaf>`;
      }
    }

    class MiddleShadow extends ShadowDomMixin(LitElement) {
      static elements = { [innerLightTag]: InnerLight };
      render() {
        return html`<probe-mixed-inner-light></probe-mixed-inner-light>`;
      }
    }

    class OuterLight extends LightDomMixin(LitElement) {
      static elements = { [shadowTag]: MiddleShadow };
      constructor() {
        super();
        this.addEventListener("mixed-ready", (event) => {
          this.receivedDetail = event.detail;
        });
      }
      render() {
        return html`<probe-mixed-shadow></probe-mixed-shadow>`;
      }
    }

    defineTestElement(outerLightTag, OuterLight);
    const outer = document.createElement(outerLightTag);
    document.body.appendChild(outer);
    await outer.updateComplete;
    const shadow = outer.querySelector(shadowTag);
    await shadow?.updateComplete;
    const inner = shadow?.shadowRoot?.querySelector(innerLightTag);
    await inner?.updateComplete;
    const leaf = inner?.querySelector(leafTag);
    await leaf?.updateComplete;
    leaf?.shadowRoot?.querySelector("button")?.click();

    return {
      outerCtor: outer.constructor.name,
      shadowCtor: shadow?.constructor?.name ?? null,
      shadowHasRoot: Boolean(shadow?.shadowRoot),
      innerCtor: inner?.constructor?.name ?? null,
      innerUsesLightDom: inner?.shadowRoot === null,
      innerRegistryLeaf: inner?.registry?.get?.(leafTag)?.name ?? null,
      innerRegistryKind: typeof inner?.registry?._getDefinition === "function" ? "shim" : "native",
      leafRoot: leaf?.getRootNode?.()?.constructor?.name ?? null,
      leafCtor: leaf?.constructor?.name ?? null,
      leafInitialized: leaf?.initialized ?? null,
      leafHtml: leaf?.shadowRoot?.textContent?.trim() ?? null,
      composedEventDetail: outer.receivedDetail ?? null,
    };
  },

  async probeShadowToLightInitialization() {
    const leafTag = "probe-reverse-leaf";
    const lightTag = "probe-reverse-light";
    const shadowTag = "probe-reverse-shadow";

    class ReverseLeaf extends HTMLElement {
      constructor() {
        super();
        this.initialized = true;
      }
      connectedCallback() {
        this.connected = true;
      }
    }

    class ReverseLight extends LightDomMixin(LitElement) {
      static elements = { [leafTag]: ReverseLeaf };
      render() {
        return html`<probe-reverse-leaf></probe-reverse-leaf>`;
      }
    }

    class ReverseShadow extends ShadowDomMixin(LitElement) {
      static elements = { [lightTag]: ReverseLight };
      render() {
        return html`<probe-reverse-light></probe-reverse-light>`;
      }
    }

    defineTestElement(shadowTag, ReverseShadow);
    const shadow = document.createElement(shadowTag);
    document.body.appendChild(shadow);
    await shadow.updateComplete;
    const light = shadow.shadowRoot?.querySelector(lightTag);
    await light?.updateComplete;
    const leaf = light?.querySelector(leafTag);

    return {
      shadowCtor: shadow.constructor.name,
      lightCtor: light?.constructor?.name ?? null,
      lightUsesLightDom: light?.shadowRoot === null,
      leafCtor: leaf?.constructor?.name ?? null,
      leafInitialized: leaf?.initialized ?? false,
      leafConnected: leaf?.connected ?? false,
    };
  },

  async probeGlobalElementInteroperability() {
    const globalTag = "probe-global-third-party";
    const scopedTag = "probe-global-scoped-child";
    const hostTag = "probe-global-light-host";
    const calls = [];

    class ThirdPartyElement extends HTMLElement {
      constructor() {
        super();
        calls.push("global:constructor");
      }
      connectedCallback() {
        calls.push("global:connected");
      }
    }
    defineTestElement(globalTag, ThirdPartyElement);

    class ScopedChild extends HTMLElement {
      constructor() {
        super();
        this.initialized = true;
      }
    }

    class GlobalLightHost extends LightDomMixin(LitElement) {
      static elements = { [scopedTag]: ScopedChild };
      render() {
        return html`
          <probe-global-third-party></probe-global-third-party>
          <probe-global-scoped-child></probe-global-scoped-child>
        `;
      }
    }

    defineTestElement(hostTag, GlobalLightHost);
    const host = document.createElement(hostTag);
    document.body.appendChild(host);
    await host.updateComplete;
    const globalChild = host.querySelector(globalTag);
    const scopedChild = host.querySelector(scopedTag);

    return {
      globalCtor: globalChild?.constructor?.name ?? null,
      scopedCtor: scopedChild?.constructor?.name ?? null,
      scopedInitialized: scopedChild?.initialized ?? false,
      globalStillRegistered: customElements.get(globalTag)?.name ?? null,
      calls,
    };
  },

  async probeLateLightDefinition() {
    const childTag = "probe-late-light-child";
    const hostTag = "probe-late-light-host";

    class LateHost extends LightDomMixin(LitElement) {
      static elements = {};
      render() {
        return html`<probe-late-light-child .value=${"before-definition"}></probe-late-light-child>`;
      }
    }

    defineTestElement(hostTag, LateHost);
    const host = document.createElement(hostTag);
    document.body.appendChild(host);
    await host.updateComplete;
    const pending = host.querySelector(childTag);
    const before = {
      ctor: pending?.constructor?.name ?? null,
      value: pending?.value ?? null,
    };

    class LateChild extends LitElement {
      static properties = { value: { type: String } };
      constructor() {
        super();
        this.constructed = true;
        this.value ??= "late-default";
      }
      render() {
        return html`<i>${this.value}</i>`;
      }
    }

    host.registry.define(childTag, LateChild);
    await pending?.updateComplete;

    return {
      before,
      after: {
        sameNode: host.querySelector(childTag) === pending,
        ctor: pending?.constructor?.name ?? null,
        constructed: pending?.constructed ?? false,
        value: pending?.value ?? null,
        html: pending?.shadowRoot?.textContent?.trim() ?? null,
      },
    };
  },

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

    class ForcedNativeShadowHost extends HTMLElement {
      constructor() {
        super();
        const elements = this.constructor.elements ?? {};
        const registry = new CustomElementRegistry();
        for (const [tagName, ctor] of Object.entries(elements)) {
          registry.define(tagName, ctor);
        }

        this.registry = registry;
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

      }

      connectedCallback() {
        this.shadowRoot.innerHTML = this.renderMarkup();
      }

      get updateComplete() {
        return Promise.resolve(true);
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

      renderMarkup() {
        return `<probe-card></probe-card>`;
      }
    }

    class ProbeHost extends ForcedNativeShadowHost {
      static elements = {
        [collisionPanelTag]: ProbePanel,
      };

      renderMarkup() {
        return `<probe-panel></probe-panel>`;
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
