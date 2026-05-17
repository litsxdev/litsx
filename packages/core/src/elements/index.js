import { adoptStyles } from "@lit/reactive-element";
import {
  createLightDomRegistry,
  isLightDomRegistryRuntimeActive,
  upgradeScopedRegistryTree,
} from "@litsx/scoped-registry-shim";

const DEDUPE_MIXIN_MARK = Symbol("litsx.dedupeMixinMark");
const HYDRATION_RENDER_BEFORE = Symbol("litsx.hydrationRenderBefore");
const LIGHT_DOM_STYLE_ELEMENT = Symbol("litsx.lightDomStyleElement");
const SHADOW_DOM_REGISTRY = Symbol("litsx.shadowDomRegistry");
export const LITSX_COMPONENT = Symbol.for("litsx.component");
export const LITSX_HOST_TYPE_ID = Symbol.for("litsx.hostTypeId");
export const LITSX_SCOPED_TEMPLATE = Symbol.for("litsx.scopedTemplate");
export const LITSX_MODULE_ID = Symbol.for("litsx.moduleId");
export const LITSX_SSR_CONTEXT = Symbol.for("litsx.ssrContext");
export const LITSX_SERVER_COMPONENT = Symbol.for("litsx.serverComponent");
export const LITSX_SERVER_COMPONENT_CALL = Symbol.for("litsx.serverComponentCall");
export const LITSX_LIGHT_DOM = Symbol.for("litsx.lightDom");
let shadowDomRegistryAttachKey;
let shadowDomRegistryAttachShadowRef;
let shadowDomRegistryCtorRef;
let shadowDomRegistryNativeSupport;

export function isLitsxComponentClass(value) {
  return typeof value === "function" && value[LITSX_COMPONENT] === true;
}

function getElementAttachShadowRef() {
  return typeof Element !== "undefined" ? Element.prototype.attachShadow : undefined;
}
let shadowDomRegistryProbeId = 0;

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

function isPolyfilledScopedRegistry(registry) {
  return Boolean(registry && "h" in registry && "m" in registry);
}

function supportsScopedRegistryElementCreation(shadowRoot, registry) {
  if (!shadowRoot || !registry) {
    return false;
  }

  const canCreateElement = typeof shadowRoot.createElement === "function";
  const canParseElement = typeof shadowRoot.querySelector === "function";
  if (!canCreateElement && !canParseElement) {
    return true;
  }

  const tagName = `litsx-scoped-registry-probe-${shadowDomRegistryProbeId++}`;
  const parsedTagName = `litsx-scoped-registry-parsed-probe-${shadowDomRegistryProbeId++}`;
  class ScopedRegistryProbe extends HTMLElement {}
  class ParsedScopedRegistryProbe extends HTMLElement {}

  try {
    registry.define(tagName, ScopedRegistryProbe);
    registry.define(parsedTagName, ParsedScopedRegistryProbe);
    const createdElementWorks =
      !canCreateElement ||
      shadowRoot.createElement(tagName) instanceof ScopedRegistryProbe;
    let parsedElementWorks = true;
    if (canParseElement) {
      shadowRoot.innerHTML = `<${parsedTagName}></${parsedTagName}>`;
      parsedElementWorks =
        shadowRoot.querySelector(parsedTagName) instanceof ParsedScopedRegistryProbe;
      shadowRoot.textContent = "";
    }
    return createdElementWorks && parsedElementWorks;
  } catch {
    return false;
  }
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
        if (
          shadowRoot?.[key] === registryOverride &&
          supportsScopedRegistryElementCreation(shadowRoot, registryOverride)
        ) {
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
    shadowDomRegistryAttachShadowRef === getElementAttachShadowRef() &&
    shadowDomRegistryCtorRef === globalThis.CustomElementRegistry &&
    shadowDomRegistryNativeSupport !== undefined
  ) {
    return shadowDomRegistryAttachKey;
  }

  if (
    typeof document === "undefined" ||
    typeof CustomElementRegistry !== "function" ||
    typeof Element === "undefined"
  ) {
    shadowDomRegistryAttachKey = null;
    shadowDomRegistryAttachShadowRef = getElementAttachShadowRef();
    shadowDomRegistryCtorRef = globalThis.CustomElementRegistry;
    shadowDomRegistryNativeSupport = false;
    return null;
  }

  let registry;
  try {
    registry = new CustomElementRegistry();
  } catch {
    shadowDomRegistryAttachKey = null;
    shadowDomRegistryAttachShadowRef = getElementAttachShadowRef();
    shadowDomRegistryCtorRef = globalThis.CustomElementRegistry;
    shadowDomRegistryNativeSupport = false;
    return null;
  }

  if (isPolyfilledScopedRegistry(registry)) {
    shadowDomRegistryAttachKey = null;
    shadowDomRegistryAttachShadowRef = getElementAttachShadowRef();
    shadowDomRegistryCtorRef = globalThis.CustomElementRegistry;
    shadowDomRegistryNativeSupport = false;
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
        shadowRoot?.[key] === registry &&
        supportsScopedRegistryElementCreation(shadowRoot, registry)
      ) {
        shadowDomRegistryAttachKey = key;
        shadowDomRegistryAttachShadowRef = getElementAttachShadowRef();
        shadowDomRegistryCtorRef = globalThis.CustomElementRegistry;
        shadowDomRegistryNativeSupport = true;
        return shadowDomRegistryAttachKey;
      }
    } catch {
      // Try the next known option name.
    }
  }

  shadowDomRegistryAttachKey = null;
  shadowDomRegistryAttachShadowRef = getElementAttachShadowRef();
  shadowDomRegistryCtorRef = globalThis.CustomElementRegistry;
  shadowDomRegistryNativeSupport = false;
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

function createScopedRegistryForHost(host, options = {}) {
  const ctor = host.constructor;
  const elements = ctor.scopedElements ?? ctor.elements ?? {};
  let registry = host.registry ?? null;
  let attachKey = null;

  if (options.forceLightDomRegistry && !isPolyfilledScopedRegistry(registry)) {
    registry = null;
    host.registry = null;
  }

  if (!registry) {
    if (!isLightDomRegistryRuntimeActive()) {
      attachKey = getShadowDomRegistryAttachKey();
      if (attachKey) {
        registry = new CustomElementRegistry();
      }
    }
  }

  if (!registry && !options.forceLightDomRegistry) {
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

function assertNoScopedLightDomElements(host) {
  if (!hasScopedElements(host)) {
    return;
  }

  const ctorName = host?.constructor?.name || "LightDom component";
  throw new Error(
    `${ctorName} cannot use static elements with LightDomMixin. Scoped elements in light DOM are not supported in this runtime.`,
  );
}

function syncShadowRootCreationScope(host, shadowRoot, registry) {
  if (!host?.renderOptions) {
    return;
  }

  const canUseScopedCreationScope =
    typeof shadowRoot?.importNode === "function" &&
    typeof registry?._getDefinition === "function";

  if (canUseScopedCreationScope) {
    host.renderOptions.creationScope = shadowRoot;
    host.renderOptions.renderBefore ??= shadowRoot.firstChild;
    return;
  }

  if (host.renderOptions.creationScope === shadowRoot) {
    delete host.renderOptions.creationScope;
  }
}
function hasHydratableLitMarkers(root) {
  for (const node of root?.childNodes ?? []) {
    if (node.nodeType === 8 && /^\/?lit-|^lit-/.test(node.data ?? "")) {
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
        const shouldForceHydrationRegistry =
          hasHydratableLitMarkers(existingRoot) && hasScopedElements(this);
        const rootRegistry =
          existingRoot.registry ??
          existingRoot.customElements ??
          existingRoot.customElementRegistry ??
          null;

        if (shouldForceHydrationRegistry) {
          const { registry } = createScopedRegistryForHost(this, {
            forceLightDomRegistry: true,
          });
          this.registry = registry;
          assignShadowRootRegistry(existingRoot, registry);
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

export const LightDomMixin = dedupeMixin((Base) =>
  class LightDomHost extends Base {
    static [LITSX_LIGHT_DOM] = true;

    constructor(...args) {
      super(...args);
      // Light DOM remains supported as a render-root mode, but scoped element
      // resolution now belongs exclusively to the shadow-based path.
      assertNoScopedLightDomElements(this);
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
      if (typeof super.connectedCallback === "function") {
        super.connectedCallback(...args);
      }
      assertNoScopedLightDomElements(this);
    }

    disconnectedCallback(...args) {
      if (typeof super.disconnectedCallback === "function") {
        super.disconnectedCallback(...args);
      }
    }

    update(...args) {
      if (typeof super.update === "function") {
        super.update(...args);
      }
      clearHydrationRenderBefore(this);
      ensureLightDomStyles(this);
    }
  }
);
