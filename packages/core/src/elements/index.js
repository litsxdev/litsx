import { adoptStyles } from "@lit/reactive-element";
import {
  connectLightDomRegistry,
  createLightDomRegistry,
  disconnectLightDomRegistry,
  upgradeLightDomTree,
} from "@litsx/light-dom-registry";

const DEDUPE_MIXIN_MARK = Symbol("litsx.dedupeMixinMark");
const LIGHT_DOM_STYLE_ELEMENT = Symbol("litsx.lightDomStyleElement");
const SHADOW_DOM_REGISTRY = Symbol("litsx.shadowDomRegistry");
export const LITSX_SCOPED_TEMPLATE = Symbol.for("litsx.scopedTemplate");
export const LITSX_MODULE_ID = Symbol.for("litsx.moduleId");
export const LITSX_SSR_CONTEXT = Symbol.for("litsx.ssrContext");
export const LITSX_SERVER_COMPONENT = Symbol.for("litsx.serverComponent");
let shadowDomRegistryAttachKey;
let shadowDomRegistryAttachShadowRef;
let shadowDomRegistryCtorRef;

export function __litsxScopedTemplate(template, elements) {
  return {
    [LITSX_SCOPED_TEMPLATE]: true,
    template,
    elements: elements ?? {},
  };
}

export function __isLitsxScopedTemplate(value) {
  return Boolean(value?.[LITSX_SCOPED_TEMPLATE]);
}

function isPolyfilledScopedRegistry(registry) {
  return Boolean(registry && "h" in registry && "m" in registry);
}

function getShadowDomRegistryAttachKey(registryOverride = null) {
  if (registryOverride) {
    if (isPolyfilledScopedRegistry(registryOverride)) {
      return null;
    }

    if (
      typeof CustomElementRegistry === "function" &&
      !(registryOverride instanceof CustomElementRegistry)
    ) {
      return null;
    }

    for (const key of ["registry", "customElements", "customElementRegistry"]) {
      const host = document.createElement("div");
      try {
        const shadowRoot = host.attachShadow({
          mode: "open",
          [key]: registryOverride,
        });
        if (shadowRoot?.[key] === registryOverride) {
          return key;
        }
      } catch {
        // Try the next known option name.
      }
    }
    return null;
  }

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

  if (isPolyfilledScopedRegistry(registry)) {
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
      if (shadowRoot?.[key] === registry) {
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
        `ShadowDomMixin cannot redefine scoped element "${tagName}" with a different constructor.`
      );
    }

    registry.define(tagName, elementClass);
  }

  return registry;
}

function createScopedRegistryForHost(host) {
  const ctor = host.constructor;
  const elements = ctor.scopedElements ?? ctor.elements ?? {};
  let registry = host.registry ?? null;
  let attachKey = null;

  if (!registry) {
    attachKey = getShadowDomRegistryAttachKey();
    if (attachKey) {
      registry = new CustomElementRegistry();
    }
  }

  if (!registry) {
    registry = createLightDomRegistry(host, {});
  }

  if (attachKey === null) {
    attachKey = getShadowDomRegistryAttachKey(registry);
  }

  defineScopedElements(registry, elements);
  host.registry = registry;

  return { attachKey, registry };
}

function assignShadowRootRegistry(shadowRoot, registry) {
  for (const key of ["registry", "customElements", "customElementRegistry"]) {
    try {
      shadowRoot[key] = registry;
    } catch {
      // Some browsers expose readonly experimental registry aliases.
    }
  }
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

function hasScopedElements(host) {
  const elements = host?.constructor?.elements ?? host?.constructor?.scopedElements ?? {};
  return elements && typeof elements === "object" && Object.keys(elements).length > 0;
}

export const ShadowDomMixin = dedupeMixin((Base) =>
  class ShadowDomHost extends Base {
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
      const scopedRegistryOption = attachKey ? { [attachKey]: registry } : {};
      const shadowRootOptions = {
        mode: "open",
        ...(ctor.shadowRootOptions ?? {}),
        ...scopedRegistryOption,
      };
      const shadowRoot = this.attachShadow(shadowRootOptions);
      if (!attachKey) {
        assignShadowRootRegistry(shadowRoot, registry);
      }
      if (this.renderOptions && typeof shadowRoot.importNode === "function") {
        this.renderOptions.creationScope = shadowRoot;
        this.renderOptions.renderBefore ??= shadowRoot.firstChild;
      }
      adoptStyles(shadowRoot, ctor.elementStyles ?? []);
      return shadowRoot;
    }

    update(...args) {
      if (typeof super.update === "function") {
        super.update(...args);
      }
      if (this.registry && typeof this.registry._getDefinition === "function") {
        upgradeLightDomTree(this.shadowRoot, this.registry);
      }
    }
  }
);

export const LightDomMixin = dedupeMixin((Base) =>
  class LightDomHost extends Base {
    constructor(...args) {
      super(...args);
      if (hasScopedElements(this)) {
        this.registry = connectLightDomRegistry(this, this.constructor.elements ?? {});
      }
    }

    createRenderRoot() {
      return this;
    }

    connectedCallback(...args) {
      if (typeof super.connectedCallback === "function") {
        super.connectedCallback(...args);
      }
      if (hasScopedElements(this)) {
        this.registry = connectLightDomRegistry(this, this.constructor.elements ?? {});
      }
    }

    disconnectedCallback(...args) {
      if (typeof super.disconnectedCallback === "function") {
        super.disconnectedCallback(...args);
      }
      if (hasScopedElements(this)) {
        disconnectLightDomRegistry(this);
      }
    }

    update(...args) {
      if (typeof super.update === "function") {
        super.update(...args);
      }
      ensureLightDomStyles(this);
    }
  }
);
