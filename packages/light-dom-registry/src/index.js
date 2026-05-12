/**
 * @license
 * Copyright (c) 2020 The Polymer Project Authors. All rights reserved.
 * This code may only be used under the BSD style license found at
 * http://polymer.github.io/LICENSE.txt
 * The complete set of authors may be found at
 * http://polymer.github.io/AUTHORS.txt
 * The complete set of contributors may be found at
 * http://polymer.github.io/CONTRIBUTORS.txt
 * Code distributed by Google as part of the polymer project is also
 * subject to an additional IP rights grant found at
 * http://polymer.github.io/PATENTS.txt
 *
 * Adapted for LitSX light DOM contextual registries.
 */

const RUNTIME_KEY = Symbol.for("litsx.lightDomRegistry.runtime");
const HOST_REGISTRY = Symbol.for("litsx.lightDomRegistry.hostRegistry");
const HOST_ELEMENTS = Symbol.for("litsx.lightDomRegistry.hostElements");
const STAND_IN_MARK = Symbol.for("litsx.lightDomRegistry.standIn");

function isBrowserLikeEnvironment() {
  return typeof window !== "undefined" &&
    typeof document !== "undefined" &&
    typeof customElements !== "undefined" &&
    typeof HTMLElement !== "undefined";
}

function isRegistryLike(value) {
  return value &&
    typeof value.define === "function" &&
    typeof value.get === "function" &&
    typeof value._getDefinition === "function";
}

function getRuntime() {
  if (!isBrowserLikeEnvironment()) {
    return null;
  }

  if (window[RUNTIME_KEY]) {
    return window[RUNTIME_KEY];
  }

  const polyfillWindow = window;
  if (!polyfillWindow.CustomElementRegistryPolyfill?.formAssociated) {
    polyfillWindow.CustomElementRegistryPolyfill = {
      formAssociated: new Set(),
    };
  }

  const NativeHTMLElement = window.HTMLElement;
  const nativeRegistry = window.customElements;
  const nativeDefine = nativeRegistry.define.bind(nativeRegistry);
  const nativeGet = nativeRegistry.get.bind(nativeRegistry);

  const definitionForElement = new WeakMap();
  const pendingRegistryForElement = new WeakMap();
  const globalDefinitionForConstructor = new WeakMap();
  const scopeForElement = new WeakMap();
  const standInDefinitionByTag = new Map();

  let upgradingInstance;
  let elementsPendingAttributes;

  if (document.readyState === "loading") {
    elementsPendingAttributes = new Set();
    document.addEventListener("readystatechange", () => {
      elementsPendingAttributes.forEach((instance) =>
        customizeAttributes(instance, definitionForElement.get(instance))
      );
    }, { once: true });
  }

  class AsyncInfo {
    constructor() {
      this.promise = new Promise((resolve) => {
        this.resolve = resolve;
      });
    }
  }

  class ShimmedCustomElementsRegistry {
    constructor(host = null) {
      this.host = host;
      this._definitionsByTag = new Map();
      this._definitionsByClass = new Map();
      this._whenDefinedPromises = new Map();
      this._awaitingUpgrade = new Map();
    }

    define(tagName, elementClass) {
      tagName = String(tagName).toLowerCase();
      if (!tagName) {
        throw new DOMException(
          "Failed to execute 'define' on 'CustomElementRegistry': the tag name must not be empty"
        );
      }
      if (this._getDefinition(tagName) !== undefined) {
        throw new DOMException(
          `Failed to execute 'define' on 'CustomElementRegistry': the name "${tagName}" has already been used with this registry`
        );
      }
      if (this._definitionsByClass.get(elementClass) !== undefined) {
        throw new DOMException(
          "Failed to execute 'define' on 'CustomElementRegistry': this constructor has already been used with this registry"
        );
      }

      const attributeChangedCallback = elementClass.prototype.attributeChangedCallback;
      const observedAttributes = new Set(elementClass.observedAttributes || []);
      patchAttributes(elementClass, observedAttributes, attributeChangedCallback);

      let standInClass = nativeGet(tagName);
      if (standInClass && !standInClass[STAND_IN_MARK]) {
        throw new Error(
          `Global custom element tag "${tagName}" is already registered to a different constructor.`
        );
      }

      const formAssociated =
        standInClass?.formAssociated ??
        (elementClass.formAssociated ||
          polyfillWindow.CustomElementRegistryPolyfill.formAssociated.has(tagName));

      if (formAssociated) {
        polyfillWindow.CustomElementRegistryPolyfill.formAssociated.add(tagName);
      }

      if (formAssociated !== elementClass.formAssociated) {
        try {
          elementClass.formAssociated = formAssociated;
        } catch {
          // ignore write failures on readonly constructors
        }
      }

      const definition = {
        tagName,
        elementClass,
        connectedCallback: elementClass.prototype.connectedCallback,
        disconnectedCallback: elementClass.prototype.disconnectedCallback,
        adoptedCallback: elementClass.prototype.adoptedCallback,
        attributeChangedCallback,
        formAssociated,
        formAssociatedCallback: elementClass.prototype.formAssociatedCallback,
        formDisabledCallback: elementClass.prototype.formDisabledCallback,
        formResetCallback: elementClass.prototype.formResetCallback,
        formStateRestoreCallback: elementClass.prototype.formStateRestoreCallback,
        observedAttributes,
      };

      this._definitionsByTag.set(tagName, definition);
      this._definitionsByClass.set(elementClass, definition);

      if (!standInClass) {
        standInClass = createStandInElement(tagName);
        standInClass[STAND_IN_MARK] = true;
        nativeDefine(tagName, standInClass);
      }

      definition.standInClass = standInClass;
      standInDefinitionByTag.set(tagName, definition);
      globalDefinitionForConstructor.set(elementClass, definition);

      const awaiting = this._awaitingUpgrade.get(tagName);
      if (awaiting) {
        this._awaitingUpgrade.delete(tagName);
        for (const element of awaiting) {
          pendingRegistryForElement.delete(element);
          customize(element, definition, true);
        }
      }

      const info = this._whenDefinedPromises.get(tagName);
      if (info) {
        info.resolve(elementClass);
        this._whenDefinedPromises.delete(tagName);
      }

      return elementClass;
    }

    get(tagName) {
      return this._definitionsByTag.get(tagName)?.elementClass ?? null;
    }

    getName(elementClass) {
      return this._definitionsByClass.get(elementClass)?.tagName ?? null;
    }

    _getDefinition(tagName) {
      return this._definitionsByTag.get(String(tagName).toLowerCase());
    }

    whenDefined(tagName) {
      const definition = this._getDefinition(tagName);
      if (definition !== undefined) {
        return Promise.resolve(definition.elementClass);
      }
      let info = this._whenDefinedPromises.get(tagName);
      if (info === undefined) {
        info = new AsyncInfo();
        this._whenDefinedPromises.set(tagName, info);
      }
      return info.promise;
    }

    _upgradeWhenDefined(element, tagName, shouldUpgrade) {
      let awaiting = this._awaitingUpgrade.get(tagName);
      if (!awaiting) {
        awaiting = new Set();
        this._awaitingUpgrade.set(tagName, awaiting);
      }
      if (shouldUpgrade) {
        awaiting.add(element);
      } else {
        awaiting.delete(element);
      }
    }

    resolve(tagName) {
      const definition = this._getDefinition(tagName);
      if (!definition) {
        return null;
      }
      return {
        host: this.host,
        ctor: definition.elementClass,
        tagName: definition.tagName,
        standInClass: definition.standInClass ?? null,
      };
    }

    entries() {
      return Array.from(this._definitionsByTag.entries()).map(([tagName, definition]) => [
        tagName,
        definition.elementClass,
      ]);
    }
  }

  const isValidScope = (node) =>
    node === document || node instanceof ShadowRoot;

  const registryFromScope = (scope) => {
    if (!scope) {
      return null;
    }
    if (isRegistryLike(scope.registry)) {
      return scope.registry;
    }
    if (isRegistryLike(scope.customElements)) {
      return scope.customElements;
    }
    if (scope.nodeType === Node.ELEMENT_NODE && isRegistryLike(scope[HOST_REGISTRY])) {
      return scope[HOST_REGISTRY];
    }
    return null;
  };

  const registryForNode = (node) => {
    let current = node;

    while (current) {
      const direct = registryFromScope(current);
      if (direct) {
        return direct;
      }

      const root = typeof current.getRootNode === "function"
        ? current.getRootNode()
        : null;
      if (root && root !== current) {
        const rootRegistry = registryFromScope(root);
        if (rootRegistry) {
          return rootRegistry;
        }
      }

      if (current.parentNode) {
        current = current.parentNode;
        continue;
      }

      if (current instanceof ShadowRoot && current.host) {
        current = current.host;
        continue;
      }

      break;
    }

    let scope = node.getRootNode?.() ?? null;
    if (!isValidScope(scope)) {
      const context = creationContext[creationContext.length - 1];
      if (isRegistryLike(context)) {
        return context;
      }
      const contextRegistry = registryFromScope(context);
      if (contextRegistry) {
        return contextRegistry;
      }
      if (context?.getRootNode) {
        scope = context.getRootNode();
      }
      if (!isValidScope(scope)) {
        scope = scopeForElement.get(scope)?.getRootNode?.() || document;
      }
    }

    return registryFromScope(scope);
  };

  function ensureAttributesCustomized(instance) {
    if (!elementsPendingAttributes?.has(instance)) {
      return;
    }
    customizeAttributes(instance, definitionForElement.get(instance));
  }

  function customizeAttributes(instance, definition) {
    elementsPendingAttributes?.delete(instance);
    if (!definition?.attributeChangedCallback) {
      return;
    }
    definition.observedAttributes.forEach((attr) => {
      if (!instance.hasAttribute(attr)) {
        return;
      }
      definition.attributeChangedCallback.call(
        instance,
        attr,
        null,
        instance.getAttribute(attr)
      );
    });
  }

  function patchAttributes(elementClass, observedAttributes, attributeChangedCallback) {
    if (observedAttributes.size === 0 || attributeChangedCallback === undefined) {
      return;
    }

    const setAttribute = elementClass.prototype.setAttribute;
    if (setAttribute && !setAttribute.__litsxPatched) {
      const patched = function (name, value) {
        ensureAttributesCustomized(this);
        const normalizedName = String(name).toLowerCase();
        if (observedAttributes.has(normalizedName)) {
          const oldValue = this.getAttribute(normalizedName);
          setAttribute.call(this, normalizedName, value);
          attributeChangedCallback.call(this, normalizedName, oldValue, value);
        } else {
          setAttribute.call(this, normalizedName, value);
        }
      };
      patched.__litsxPatched = true;
      elementClass.prototype.setAttribute = patched;
    }

    const removeAttribute = elementClass.prototype.removeAttribute;
    if (removeAttribute && !removeAttribute.__litsxPatched) {
      const patched = function (name) {
        ensureAttributesCustomized(this);
        const normalizedName = String(name).toLowerCase();
        if (observedAttributes.has(normalizedName)) {
          const oldValue = this.getAttribute(normalizedName);
          removeAttribute.call(this, normalizedName);
          attributeChangedCallback.call(this, normalizedName, oldValue, null);
        } else {
          removeAttribute.call(this, normalizedName);
        }
      };
      patched.__litsxPatched = true;
      elementClass.prototype.removeAttribute = patched;
    }

    const toggleAttribute = elementClass.prototype.toggleAttribute;
    if (toggleAttribute && !toggleAttribute.__litsxPatched) {
      const patched = function (name, force) {
        ensureAttributesCustomized(this);
        const normalizedName = String(name).toLowerCase();
        if (observedAttributes.has(normalizedName)) {
          const oldValue = this.getAttribute(normalizedName);
          toggleAttribute.call(this, normalizedName, force);
          const newValue = this.getAttribute(normalizedName);
          if (oldValue !== newValue) {
            attributeChangedCallback.call(this, normalizedName, oldValue, newValue);
          }
          return newValue !== null;
        }
        return toggleAttribute.call(this, normalizedName, force);
      };
      patched.__litsxPatched = true;
      elementClass.prototype.toggleAttribute = patched;
    }
  }

  function patchHTMLElement(elementClass) {
    const parentClass = Object.getPrototypeOf(elementClass);

    if (parentClass !== window.HTMLElement) {
      if (parentClass === NativeHTMLElement) {
        Object.setPrototypeOf(elementClass, window.HTMLElement);
        return;
      }
      patchHTMLElement(parentClass);
    }
  }

  function customize(instance, definition, isUpgrade = false) {
    Object.setPrototypeOf(instance, definition.elementClass.prototype);
    definitionForElement.set(instance, definition);
    upgradingInstance = instance;
    try {
      new definition.elementClass();
    } catch {
      patchHTMLElement(definition.elementClass);
      new definition.elementClass();
    }

    if (definition.attributeChangedCallback) {
      if (elementsPendingAttributes !== undefined && !instance.hasAttributes()) {
        elementsPendingAttributes.add(instance);
      } else {
        customizeAttributes(instance, definition);
      }
    }

    if (isUpgrade && definition.connectedCallback && instance.isConnected) {
      definition.connectedCallback.call(instance);
    }
  }

  function createStandInElement(tagName) {
    return class ScopedCustomElementBase {
      static get formAssociated() {
        return polyfillWindow.CustomElementRegistryPolyfill.formAssociated.has(tagName);
      }

      constructor() {
        const instance = Reflect.construct(NativeHTMLElement, [], this.constructor);
        Object.setPrototypeOf(instance, window.HTMLElement.prototype);

        const registry = registryForNode(instance);
        const definition = registry?._getDefinition(tagName);
        if (definition) {
          customize(instance, definition);
        } else if (registry) {
          pendingRegistryForElement.set(instance, registry);
        }
        return instance;
      }

      connectedCallback(...args) {
        ensureAttributesCustomized(this);
        const definition = definitionForElement.get(this);
        if (definition) {
          definition.connectedCallback?.apply(this, args);
          return;
        }

        const registry = pendingRegistryForElement.get(this) || registryForNode(this);
        if (!registry) {
          return;
        }

        const resolvedDefinition = registry._getDefinition(tagName);
        if (resolvedDefinition) {
          pendingRegistryForElement.delete(this);
          customize(this, resolvedDefinition, true);
          return;
        }

        pendingRegistryForElement.set(this, registry);
        registry._upgradeWhenDefined(this, tagName, true);
      }

      disconnectedCallback(...args) {
        const definition = definitionForElement.get(this);
        if (definition) {
          definition.disconnectedCallback?.apply(this, args);
          return;
        }

        const registry = pendingRegistryForElement.get(this);
        registry?._upgradeWhenDefined(this, tagName, false);
      }

      adoptedCallback(...args) {
        const definition = definitionForElement.get(this);
        definition?.adoptedCallback?.apply(this, args);
      }

      formAssociatedCallback(...args) {
        const definition = definitionForElement.get(this);
        if (definition?.formAssociated) {
          definition.formAssociatedCallback?.apply(this, args);
        }
      }

      formDisabledCallback(...args) {
        const definition = definitionForElement.get(this);
        if (definition?.formAssociated) {
          definition.formDisabledCallback?.apply(this, args);
        }
      }

      formResetCallback(...args) {
        const definition = definitionForElement.get(this);
        if (definition?.formAssociated) {
          definition.formResetCallback?.apply(this, args);
        }
      }

      formStateRestoreCallback(...args) {
        const definition = definitionForElement.get(this);
        if (definition?.formAssociated) {
          definition.formStateRestoreCallback?.apply(this, args);
        }
      }
    };
  }

  window.HTMLElement = function HTMLElement() {
    let instance = upgradingInstance;
    if (instance) {
      upgradingInstance = undefined;
      return instance;
    }

    const definition = globalDefinitionForConstructor.get(this.constructor);
    if (!definition) {
      try {
        return Reflect.construct(NativeHTMLElement, [], this.constructor);
      } catch {
        throw new TypeError(
          "Illegal constructor (custom element class must be registered with the LitSX light DOM registry to be newable)"
        );
      }
    }

    instance = Reflect.construct(NativeHTMLElement, [], definition.standInClass);
    Object.setPrototypeOf(instance, this.constructor.prototype);
    definitionForElement.set(instance, definition);
    return instance;
  };
  window.HTMLElement.prototype = NativeHTMLElement.prototype;

  const creationContext = [document];

  function installScopedCreationMethod(ctor, method, from) {
    const native = (from ? Object.getPrototypeOf(from) : ctor.prototype)[method];
    if (typeof native !== "function") {
      return;
    }

    ctor.prototype[method] = function (...args) {
      creationContext.push(this);
      const result = native.apply(from || this, args);
      if (result !== undefined) {
        scopeForElement.set(result, this);
      }
      creationContext.pop();
      return result;
    };
  }

  function installScopedCreationSetter(ctor, name) {
    const descriptor = Object.getOwnPropertyDescriptor(ctor.prototype, name);
    if (!descriptor?.set) {
      return;
    }
    Object.defineProperty(ctor.prototype, name, {
      ...descriptor,
      set(value) {
        creationContext.push(this);
        descriptor.set.call(this, value);
        creationContext.pop();
      },
    });
  }

  installScopedCreationMethod(ShadowRoot, "createElement", document);
  installScopedCreationMethod(ShadowRoot, "createElementNS", document);
  installScopedCreationMethod(ShadowRoot, "importNode", document);
  installScopedCreationMethod(Element, "insertAdjacentHTML");
  installScopedCreationSetter(Element, "innerHTML");
  installScopedCreationSetter(ShadowRoot, "innerHTML");

  const runtime = {
    NativeHTMLElement,
    ShimmedCustomElementsRegistry,
    createRegistry(host) {
      return new ShimmedCustomElementsRegistry(host);
    },
    ensureLightDomProxy(tagName) {
      const normalizedTag = String(tagName).toLowerCase();
      const existing = nativeGet(normalizedTag);
      if (existing) {
        if (existing[STAND_IN_MARK]) {
          return existing;
        }
        throw new Error(
          `Global custom element tag "${normalizedTag}" is already registered to a different constructor.`
        );
      }
      const standInClass = createStandInElement(normalizedTag);
      standInClass[STAND_IN_MARK] = true;
      nativeDefine(normalizedTag, standInClass);
      return standInClass;
    },
    getDefinitionForElement(element) {
      return definitionForElement.get(element) ?? null;
    },
    getStandInDefinition(tagName) {
      return standInDefinitionByTag.get(String(tagName).toLowerCase()) ?? null;
    },
    withCreationContext(scope, callback) {
      creationContext.push(scope ?? document);
      try {
        return callback();
      } finally {
        creationContext.pop();
      }
    },
  };

  window[RUNTIME_KEY] = runtime;
  return runtime;
}

export function ensureLightDomProxy(tagName) {
  const runtime = getRuntime();
  if (!runtime) {
    return null;
  }
  return runtime.ensureLightDomProxy(tagName);
}

export function createLightDomRegistry(host, initialElements = {}) {
  const runtime = getRuntime();
  if (!runtime) {
    return null;
  }

  const registry = runtime.createRegistry(host);
  host[HOST_REGISTRY] = registry;
  host[HOST_ELEMENTS] = { ...(initialElements || {}) };
  host.registry = registry;

  Object.entries(initialElements || {}).forEach(([tagName, ctor]) => {
    registry.define(tagName, ctor);
  });

  return registry;
}

export function connectLightDomRegistry(host, elements) {
  const runtime = getRuntime();
  if (!runtime || !host) {
    return null;
  }

  const registry = isRegistryLike(host[HOST_REGISTRY])
    ? host[HOST_REGISTRY]
    : createLightDomRegistry(host, {});

  const nextElements = elements || {};
  const previousElements = host[HOST_ELEMENTS] || {};

  for (const [tagName, ctor] of Object.entries(nextElements)) {
    if (previousElements[tagName] === ctor && registry.get(tagName) === ctor) {
      continue;
    }
    registry.define(tagName, ctor);
  }

  host[HOST_ELEMENTS] = { ...nextElements };
  host[HOST_REGISTRY] = registry;
  host.registry = registry;
  return registry;
}

export function disconnectLightDomRegistry(host) {
  if (!host || typeof host !== "object") {
    return;
  }
  if (host.registry === host[HOST_REGISTRY]) {
    host.registry = null;
  }
}

export function withLightDomCreationContext(scope, callback) {
  const runtime = getRuntime();
  if (!runtime || typeof callback !== "function") {
    return typeof callback === "function" ? callback() : undefined;
  }

  return runtime.withCreationContext(scope, callback);
}
