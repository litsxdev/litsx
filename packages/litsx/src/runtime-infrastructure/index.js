import { adoptStyles } from "@lit/reactive-element";
import {
  connectLightDomRegistry,
  disconnectLightDomRegistry,
} from "@litsx/light-dom-registry";

const DEDUPE_MIXIN_MARK = Symbol("litsx.dedupeMixinMark");
const LIGHT_DOM_STYLE_ELEMENT = Symbol("litsx.lightDomStyleElement");
const SHADOW_DOM_REGISTRY = Symbol("litsx.shadowDomRegistry");
const SHADOW_DOM_REGISTRY_CACHE = new WeakMap();
let shadowDomRegistryAttachKey;
let shadowDomRegistryAttachShadowRef;
let shadowDomRegistryCtorRef;

function getShadowDomRegistryAttachKey() {
  if (
    shadowDomRegistryAttachKey !== undefined &&
    shadowDomRegistryAttachShadowRef === Element?.prototype?.attachShadow &&
    shadowDomRegistryCtorRef === globalThis.CustomElementRegistry
  ) {
    return shadowDomRegistryAttachKey;
  }

  if (
    typeof document === "undefined" ||
    typeof CustomElementRegistry !== "function" ||
    typeof Element === "undefined"
  ) {
    shadowDomRegistryAttachKey = null;
    shadowDomRegistryAttachShadowRef = Element?.prototype?.attachShadow;
    shadowDomRegistryCtorRef = globalThis.CustomElementRegistry;
    return null;
  }

  let registry;
  try {
    registry = new CustomElementRegistry();
  } catch {
    shadowDomRegistryAttachKey = null;
    shadowDomRegistryAttachShadowRef = Element.prototype.attachShadow;
    shadowDomRegistryCtorRef = globalThis.CustomElementRegistry;
    return null;
  }

  for (const key of ["registry", "customElements", "customElementRegistry"]) {
    const host = document.createElement("div");
    try {
      const shadowRoot = host.attachShadow({
        mode: "open",
        [key]: registry,
      });
      if (
        shadowRoot?.registry === registry ||
        shadowRoot?.customElements === registry ||
        shadowRoot?.customElementRegistry === registry
      ) {
        shadowDomRegistryAttachKey = key;
        shadowDomRegistryAttachShadowRef = Element.prototype.attachShadow;
        shadowDomRegistryCtorRef = globalThis.CustomElementRegistry;
        return key;
      }
    } catch {
      // Try the next known option name.
    }
  }

  shadowDomRegistryAttachKey = null;
  shadowDomRegistryAttachShadowRef = Element.prototype.attachShadow;
  shadowDomRegistryCtorRef = globalThis.CustomElementRegistry;
  return null;
}

function defineScopedElements(registry, elements = {}) {
  for (const [tagName, elementClass] of Object.entries(elements)) {
    if (!tagName || typeof elementClass !== "function") {
      continue;
    }

    const existing = registry.get?.(tagName);
    if (existing === elementClass) {
      continue;
    }

    if (existing && existing !== elementClass) {
      throw new Error(
        `ShadowDomElementsMixin cannot redefine scoped element "${tagName}" with a different constructor.`
      );
    }

    registry.define(tagName, elementClass);
  }

  return registry;
}

function createScopedRegistryForHost(host) {
  const attachKey = getShadowDomRegistryAttachKey();
  if (!attachKey) {
    throw new Error(
      "ShadowDomElementsMixin requires native scoped custom element registries or the @webcomponents/scoped-custom-element-registry polyfill."
    );
  }

  const ctor = host.constructor;
  const elements = ctor.scopedElements ?? ctor.elements ?? {};
  let registry = host.registry ?? SHADOW_DOM_REGISTRY_CACHE.get(ctor);

  if (!registry) {
    registry = new CustomElementRegistry();
    SHADOW_DOM_REGISTRY_CACHE.set(ctor, registry);
  }

  defineScopedElements(registry, elements);
  host.registry = registry;

  return { attachKey, registry };
}

function cssTextFromStyle(style) {
  if (!style) return "";

  if (typeof style.cssText === "string") {
    return style.cssText;
  }

  if (typeof CSSStyleSheet !== "undefined" && style instanceof CSSStyleSheet) {
    let cssText = "";
    for (const rule of style.cssRules || []) {
      cssText += rule.cssText;
    }
    return cssText;
  }

  return String(style);
}

function ensureLightDomStyles(host) {
  if (!host) {
    return;
  }

  const ctor = host.constructor;
  if (typeof ctor.finalize === "function") {
    ctor.finalize();
  }

  const styles = Array.isArray(ctor.elementStyles) ? ctor.elementStyles : [];
  if (styles.length === 0) {
    return;
  }

  const styleTexts = styles
    .map(cssTextFromStyle)
    .filter(Boolean);

  if (styleTexts.length === 0) {
    return;
  }

  const cssText = styleTexts.join("\n");
  let styleElement = host[LIGHT_DOM_STYLE_ELEMENT];

  if (styleElement?.isConnected) {
    if (styleElement.textContent !== cssText) {
      styleElement.textContent = cssText;
    }
    return;
  }

  styleElement = host.ownerDocument.createElement("style");
  styleElement.setAttribute("data-litsx-light-dom-style", "");
  styleElement.textContent = cssText;
  host.appendChild(styleElement);
  host[LIGHT_DOM_STYLE_ELEMENT] = styleElement;
}

function dedupeMixin(applyMixin) {
  const mixinId = Symbol("litsx.mixin");

  return (Base) => {
    if (
      Base &&
      typeof Base === "function" &&
      Base[DEDUPE_MIXIN_MARK] &&
      Base[DEDUPE_MIXIN_MARK].has(mixinId)
    ) {
      return Base;
    }

    const Mixed = applyMixin(Base);
    const marks = new Set(Base?.[DEDUPE_MIXIN_MARK] || []);
    marks.add(mixinId);
    Object.defineProperty(Mixed, DEDUPE_MIXIN_MARK, {
      value: marks,
      configurable: true,
    });
    return Mixed;
  };
}

function isPlainObject(value) {
  return value !== null &&
    typeof value === "object" &&
    Object.getPrototypeOf(value) === Object.prototype;
}

export const LitsxStaticHoistsMixin = dedupeMixin((Base) =>
  class LitsxStaticHoistsHost extends Base {
    static __litsxStatic(cacheKey, compute) {
      if (!Object.prototype.hasOwnProperty.call(this, cacheKey)) {
        this[cacheKey] = compute();
      }

      return this[cacheKey];
    }

    static __litsxResolveStaticValue(value) {
      return value;
    }

    static __litsxMergeProperties(base, override) {
      if (!override) return base;

      const next = { ...(base || {}) };

      for (const key in override) {
        const baseEntry = next[key];
        const overrideEntry = override[key];

        if (isPlainObject(baseEntry) && isPlainObject(overrideEntry)) {
          next[key] = {
            ...baseEntry,
            ...overrideEntry,
          };
        } else {
          next[key] = overrideEntry;
        }
      }

      return next;
    }
  }
);

export const ShadowDomElementsMixin = dedupeMixin((Base) =>
  class ShadowDomElementsHost extends Base {
    static get scopedElements() {
      return this.elements ?? {};
    }

    get registry() {
      return this[SHADOW_DOM_REGISTRY] ?? null;
    }

    set registry(registry) {
      this[SHADOW_DOM_REGISTRY] = registry;
    }

    createRenderRoot() {
      const existingRoot = this.shadowRoot;
      if (existingRoot) {
        this.registry ??= existingRoot.registry ?? existingRoot.customElements ?? existingRoot.customElementRegistry ?? null;
        return existingRoot;
      }

      const ctor = this.constructor;
      if (typeof ctor.finalize === "function") {
        ctor.finalize();
      }

      const { attachKey, registry } = createScopedRegistryForHost(this);
      const shadowRootOptions = {
        mode: "open",
        ...(ctor.shadowRootOptions ?? {}),
        [attachKey]: registry,
      };
      const shadowRoot = this.attachShadow(shadowRootOptions);
      adoptStyles(shadowRoot, ctor.elementStyles ?? []);
      return shadowRoot;
    }
  }
);

export const LightDomMixin = dedupeMixin((Base) =>
  class LightDomElementsHost extends Base {
    createRenderRoot() {
      return this;
    }

    update(...args) {
      if (typeof super.update === "function") {
        super.update(...args);
      }
      ensureLightDomStyles(this);
    }
  }
);

export const LightDomElementsMixin = dedupeMixin((Base) =>
  class LightDomElementsHost extends LightDomMixin(Base) {
    constructor(...args) {
      super(...args);
      this.registry = connectLightDomRegistry(this, this.constructor.elements ?? {});
    }

    connectedCallback(...args) {
      if (typeof super.connectedCallback === "function") {
        super.connectedCallback(...args);
      }
      this.registry = connectLightDomRegistry(this, this.constructor.elements ?? {});
    }

    disconnectedCallback(...args) {
      if (typeof super.disconnectedCallback === "function") {
        super.disconnectedCallback(...args);
      }
      disconnectLightDomRegistry(this);
    }
  }
);
