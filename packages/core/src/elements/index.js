import { adoptStyles } from "@lit/reactive-element";
import {
  connectLightDomRegistry,
  createLightDomRegistry,
  disconnectLightDomRegistry,
  upgradeScopedRegistryTree,
} from "@litsx/scoped-registry-shim";

const DEDUPE_MIXIN_MARK = Symbol("litsx.dedupeMixinMark");
const HYDRATION_RENDER_BEFORE = Symbol("litsx.hydrationRenderBefore");
const HYDRATION_SUSPENSION = Symbol.for("litsx.hydrationSuspension");
const LIGHT_DOM_STYLE_ELEMENT = Symbol("litsx.lightDomStyleElement");
const SHADOW_DOM_CREATION_SCOPE = Symbol("litsx.shadowDomCreationScope");
const SHADOW_DOM_REGISTRY = Symbol("litsx.shadowDomRegistry");
export const LITSX_COMPONENT = Symbol.for("litsx.component");
export const LITSX_HOST_TYPE_ID = Symbol.for("litsx.hostTypeId");
export const LITSX_LIGHT_DOM_STYLE_SCOPE = Symbol.for("litsx.lightDomStyleScope");
export const LITSX_HYDRATABLE_TAG = Symbol.for("litsx.hydratableTag");
export const LITSX_SCOPED_TEMPLATE = Symbol.for("litsx.scopedTemplate");
export const LITSX_MODULE_ID = Symbol.for("litsx.moduleId");
export const LITSX_SSR_CONTEXT = Symbol.for("litsx.ssrContext");
export const LITSX_SERVER_COMPONENT = Symbol.for("litsx.serverComponent");
export const LITSX_SERVER_COMPONENT_CALL = Symbol.for("litsx.serverComponentCall");
// Opaque, serializable-by-identity marker used while SSR frameworks compose
// server-only route segments. It is deliberately not a DOM ref: the client
// hydration runtime recreates the normal `{ current }` ref from its markers.
export const LITSX_FORWARDED_REF = Symbol.for("litsx.forwardedRef");
export const LITSX_LIGHT_DOM = Symbol.for("litsx.lightDom");
export const LITSX_EVENTS = Symbol.for("litsx.events");

export function isLitsxComponentClass(value) {
  return typeof value === "function" && value[LITSX_COMPONENT] === true;
}

export function isCustomElementClass(value) {
  if (typeof value !== "function") {
    return false;
  }

  const HTMLElementCtor = globalThis.HTMLElement;
  if (typeof HTMLElementCtor === "function") {
    return value === HTMLElementCtor || value.prototype instanceof HTMLElementCtor;
  }

  return /^class\s/.test(Function.prototype.toString.call(value));
}

export function isHydratableCustomElementClass(value) {
  return (
    isCustomElementClass(value) &&
    typeof value[LITSX_HYDRATABLE_TAG] === "string" &&
    value[LITSX_HYDRATABLE_TAG].length > 0
  );
}

export function annotateHydratableCustomElement(ctor, metadata = {}) {
  if (!isCustomElementClass(ctor)) {
    throw new TypeError("Expected a custom element constructor.");
  }

  const tagName = typeof metadata.tagName === "string"
    ? metadata.tagName.trim()
    : "";
  if (tagName && !ctor[LITSX_HYDRATABLE_TAG]) {
    ctor[LITSX_HYDRATABLE_TAG] = tagName;
  }

  const moduleId = typeof metadata.moduleId === "string"
    ? metadata.moduleId.trim()
    : "";
  if (moduleId && !ctor[LITSX_MODULE_ID]) {
    ctor[LITSX_MODULE_ID] = moduleId;
  }

  return ctor;
}

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

export function __litsxServerComponentCall(component, props) {
  return {
    [LITSX_SERVER_COMPONENT_CALL]: true,
    component,
    props: props ?? {},
  };
}

export function __isLitsxServerComponentCall(value) {
  return Boolean(value?.[LITSX_SERVER_COMPONENT_CALL]);
}

export function __litsxForwardedRef(id) {
  const normalizedId = typeof id === "string" ? id.trim() : "";
  if (!normalizedId) {
    throw new TypeError("A forwarded LitSX ref requires a non-empty id.");
  }

  return {
    [LITSX_FORWARDED_REF]: normalizedId,
    // Server Components may forward the ref, but cannot observe a browser
    // element during SSR.
    current: null,
  };
}

export function __isLitsxForwardedRef(value) {
  return typeof value?.[LITSX_FORWARDED_REF] === "string";
}

export function __getLitsxForwardedRefId(value) {
  return __isLitsxForwardedRef(value) ? value[LITSX_FORWARDED_REF] : null;
}

function createPlatformScopedRegistry() {
  if (typeof CustomElementRegistry !== "function") {
    return null;
  }

  try {
    return new CustomElementRegistry();
  } catch {
    return null;
  }
}

function isPlatformScopedRegistry(registry) {
  return Boolean(
    registry &&
    typeof CustomElementRegistry === "function" &&
    registry instanceof CustomElementRegistry,
  );
}

function isLitsxScopedRegistry(registry) {
  return Boolean(registry && typeof registry._getDefinition === "function");
}

function isUsableScopedRegistry(registry) {
  return isPlatformScopedRegistry(registry) || isLitsxScopedRegistry(registry);
}

function attachScopedShadowRoot(host, options, registry) {
  if (!isPlatformScopedRegistry(registry)) {
    return host.attachShadow(options);
  }

  const supportsCurrentApi =
    typeof ShadowRoot === "function" &&
    "customElementRegistry" in ShadowRoot.prototype;

  if (!supportsCurrentApi) {
    return host.attachShadow({
      ...options,
      customElements: registry,
      registry,
    });
  }

  try {
    return host.attachShadow({
      ...options,
      customElementRegistry: registry,
    });
  } catch (error) {
    if (host.shadowRoot) {
      throw error;
    }

    // The published Web Components polyfill implements the earlier proposal
    // spellings. Retry the actual operation instead of probing or inspecting
    // the provider's private representation.
    return host.attachShadow({
      ...options,
      customElements: registry,
      registry,
    });
  }
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
  if (!registry) {
    registry = createPlatformScopedRegistry();
  }

  if (!registry) {
    registry = createLightDomRegistry(host, {});
  }

  defineScopedElements(registry, elements);
  host.registry = registry;

  return { registry };
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

function initializeShadowRootRegistry(shadowRoot, registry) {
  if (!shadowRoot || !registry) {
    return;
  }

  if (typeof registry.initialize === "function") {
    try {
      registry.initialize(shadowRoot);
      return;
    } catch {
      // A declarative root created without the platform opt-in cannot adopt a
      // native registry after parsing. Legacy polyfills expose assignable
      // aliases instead, so keep the compatibility assignment below.
    }
  }

  assignShadowRootRegistry(shadowRoot, registry);
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
  const elements = host?.constructor?.elements ?? host?.constructor?.scopedElements;
  return elements !== undefined && elements !== null && typeof elements === "object";
}

function syncShadowRootCreationScope(host, shadowRoot, registry) {
  if (!host?.renderOptions) {
    return;
  }

  let creationScope = null;
  if (typeof shadowRoot?.importNode === "function" && registry) {
    creationScope = shadowRoot;
  } else if (registry && typeof registry.initialize === "function") {
    const ownerDocument = shadowRoot?.ownerDocument ?? host.ownerDocument;
    if (typeof ownerDocument?.importNode === "function") {
      const cached = shadowRoot[SHADOW_DOM_CREATION_SCOPE];
      if (cached?.registry === registry) {
        creationScope = cached.scope;
      } else {
        creationScope = {
          importNode(node, deep = false) {
            return ownerDocument.importNode(node, {
              customElementRegistry: registry,
              selfOnly: deep === false,
            });
          },
        };
        shadowRoot[SHADOW_DOM_CREATION_SCOPE] = {
          registry,
          scope: creationScope,
        };
      }
    }
  }

  if (creationScope) {
    host.renderOptions.creationScope = creationScope;
    host.renderOptions.renderBefore ??= shadowRoot.firstChild;
    return;
  }

  if (host.renderOptions.creationScope === shadowRoot) {
    delete host.renderOptions.creationScope;
  }
}
function hasHydratableLitMarkers(root) {
  for (const node of root?.childNodes ?? []) {
    if (node.nodeType === 8 && /^lit-part(?:\s|$)/.test(node.data ?? "")) {
      return true;
    }
  }
  return false;
}

function prepareLitHydration(host, root) {
  host._$AG = true;
  host._$needsHydration = true;

  const renderBefore = root?.firstChild ?? null;
  if (host.renderOptions && renderBefore) {
    host[HYDRATION_RENDER_BEFORE] = renderBefore;
    host.renderOptions.renderBefore ??= renderBefore;
  }
}

function clearHydrationRenderBefore(host) {
  const renderBefore = host[HYDRATION_RENDER_BEFORE];
  if (!renderBefore) {
    return;
  }

  if (host.renderOptions?.renderBefore === renderBefore) {
    delete host.renderOptions.renderBefore;
  }
  host[HYDRATION_RENDER_BEFORE] = null;
  host._$AG = false;
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
        prepareLitHydration(this, existingRoot);
        const exposedRootRegistry =
          existingRoot.registry ??
          existingRoot.customElements ??
          existingRoot.customElementRegistry ??
          null;
        // A polyfill can coexist with a browser that already exposes the
        // native ShadowRoot property. In that case the declarative root may
        // still point at the superseded native global registry. Only adopt a
        // registry owned by the current provider (or by LitSX itself).
        const rootRegistry = isUsableScopedRegistry(exposedRootRegistry)
          ? exposedRootRegistry
          : null;
        const needsHydrationRegistry = hasScopedElements(this) && !rootRegistry;

        if (needsHydrationRegistry) {
          const { registry } = createScopedRegistryForHost(this);
          this.registry = registry;
          initializeShadowRootRegistry(existingRoot, registry);
        } else if (rootRegistry) {
          this.registry = rootRegistry;
        } else {
          this.registry ??= createScopedRegistryForHost(this).registry;
          assignShadowRootRegistry(existingRoot, this.registry);
        }

        if (this.registry) {
          defineScopedElements(this.registry, this.constructor.elements ?? {});
          if (typeof this.registry._getDefinition === "function") {
            upgradeScopedRegistryTree(existingRoot, this.registry);
          } else if (typeof this.registry.upgrade === "function") {
            this.registry.upgrade(existingRoot);
          }
        }
        syncShadowRootCreationScope(this, existingRoot, this.registry);
        return existingRoot;
      }

      const ctor = this.constructor;
      if (typeof ctor.finalize === "function") {
        ctor.finalize();
      }

      const { registry } = createScopedRegistryForHost(this);
      const shadowRootOptions = {
        mode: "open",
        ...(ctor.shadowRootOptions ?? {}),
      };
      const shadowRoot = attachScopedShadowRoot(this, shadowRootOptions, registry);
      if (!isPlatformScopedRegistry(registry)) {
        assignShadowRootRegistry(shadowRoot, registry);
      }
      syncShadowRootCreationScope(this, shadowRoot, registry);
      adoptStyles(shadowRoot, ctor.elementStyles ?? []);
      return shadowRoot;
    }

    update(...args) {
      if (typeof super.update === "function") {
        super.update(...args);
      }
      clearHydrationRenderBefore(this);
      if (this.registry && typeof this.registry._getDefinition === "function") {
        upgradeScopedRegistryTree(this.shadowRoot, this.registry);
      } else if (typeof this.registry?.upgrade === "function") {
        this.registry.upgrade(this.shadowRoot);
      }
    }
  }
);

export const HydrationSuspenseMixin = dedupeMixin((Base) =>
  class HydrationSuspenseHost extends Base {
    scheduleUpdate(...args) {
      try {
        return super.scheduleUpdate(...args);
      } catch (thrown) {
        if (this[HYDRATION_SUSPENSION] !== thrown) {
          throw thrown;
        }
        return Promise.resolve(thrown);
      }
    }
  }
);

export const LightDomMixin = dedupeMixin((Base) =>
  class LightDomHost extends Base {
    static [LITSX_LIGHT_DOM] = true;

    constructor(...args) {
      super(...args);
      if (hasScopedElements(this)) {
        this.registry = connectLightDomRegistry(this, this.constructor.elements ?? {});
      }
    }

    createRenderRoot() {
      if (hasHydratableLitMarkers(this)) {
        prepareLitHydration(this, this);
      }
      return this;
    }

    renderLight() {
      return typeof this.render === "function" ? this.render() : undefined;
    }

    connectedCallback(...args) {
      const styleScope = this.constructor[LITSX_LIGHT_DOM_STYLE_SCOPE];
      if (typeof styleScope === "string" && styleScope.length > 0) {
        this.setAttribute("data-litsx-style-scope", styleScope);
      }
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
      clearHydrationRenderBefore(this);
      ensureLightDomStyles(this);
      if (this.registry && typeof this.registry._getDefinition === "function") {
        upgradeScopedRegistryTree(this, this.registry);
      }
    }
  }
);
