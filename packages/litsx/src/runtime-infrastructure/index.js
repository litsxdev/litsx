import { ScopedElementsMixin } from "@open-wc/scoped-elements/lit-element.js";
import {
  connectLightDomRegistry,
  disconnectLightDomRegistry,
} from "@litsx/light-dom-registry";

const DEDUPE_MIXIN_MARK = Symbol("litsx.dedupeMixinMark");
const LIGHT_DOM_STYLE_ELEMENT = Symbol("litsx.lightDomStyleElement");

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
  class ShadowDomElementsHost extends ScopedElementsMixin(Base) {
    static get scopedElements() {
      return this.elements ?? {};
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
