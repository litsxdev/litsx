import {
  isBooleanHostAttributeName,
  isBooleanValueHostAttributeName,
  isNativeDomEventHandlerPropertyName,
  isStandardHostAttributeName,
  normalizeSvgAttributeName,
  resolveExplicitJsxEventName,
  resolveStandardJsxEventName,
} from "@litsx/authoring";
import { html, isServer, noChange, nothing, svg } from "lit";
import { Directive, PartType, directive } from "lit/directive.js";
import { ifDefined } from "lit/directives/if-defined.js";
import { ref } from "lit/directives/ref.js";
import { resolveStyle } from "./style.js";

const HTML_ATTRIBUTE_ALIASES = new Map([["acceptCharset", "accept-charset"], ["className", "class"], ["htmlFor", "for"], ["httpEquiv", "http-equiv"]]);
const NATIVE_PROPERTY_NAMES = new Set(["checked", "files", "indeterminate", "selectedIndex", "value"]);
const SKIPPED_KEYS = new Set(["__proto__", "constructor", "prototype", "key", "children"]);
const SERVER_STRINGS_CACHE = new Map();
const CLIENT_STRINGS_CACHE = new Map();
const CLIENT_DESCRIPTOR_CACHE = new WeakMap();
const SAFE_BINDING_NAME = /^[A-Za-z_$][A-Za-z0-9_$:.-]*$/;
const DIGEST_MAPPINGS = Symbol.for("@litsx/ssr/spread-digest-mappings");
const HYDRATION_DEPTH = Symbol.for("@litsx/ssr/hydration-depth");
const CLIENT_RUNTIME = Symbol.for("@litsx/ssr/client-runtime");
const REST_PROPS = Symbol.for("litsx.restProps");
const MAX_DIGEST_MAPPINGS = 2048;
const MAX_TEMPLATE_STRINGS = 2048;
const ATTRIBUTE_NAMESPACES = new Map([
  ["xlink", "http://www.w3.org/1999/xlink"],
  ["xml", "http://www.w3.org/XML/1998/namespace"],
  ["xmlns", "http://www.w3.org/2000/xmlns/"],
]);

function templateStrings(values) {
  Object.defineProperty(values, "raw", { value: Object.freeze([...values]) });
  return Object.freeze(values);
}

function cacheTemplate(cache, key, strings) {
  cache.set(key, strings);
  if (cache.size > MAX_TEMPLATE_STRINGS) cache.delete(cache.keys().next().value);
  return strings;
}

export function normalizeName(rawName, nativeHtml, reactCompatEvents = false, namespace = "html") {
  if (rawName === "className") return { kind: "attribute", name: "class" };
  if (rawName === "htmlFor" && nativeHtml) return { kind: "attribute", name: "for" };
  const prefix = rawName[0];
  if (prefix === ".") return { kind: "property", name: rawName.slice(1) };
  if (prefix === "?") return { kind: "boolean", name: rawName.slice(1) };
  if (prefix === "@") return { kind: "event", name: rawName.slice(1) };
  if (isNativeDomEventHandlerPropertyName(rawName)) {
    return { kind: "property", name: rawName };
  }
  const explicitEventName = resolveExplicitJsxEventName(rawName);
  if (rawName.startsWith("on:") && !explicitEventName) {
    throw new TypeError(
      `Declarative event "${rawName.slice(3)}" must use lowercase kebab-case. ` +
      "Use addEventListener() for event names outside that convention.",
    );
  }
  if (explicitEventName) return { kind: "event", name: explicitEventName };
  if (reactCompatEvents && /^on[A-Z]/.test(rawName)) {
    const resolved = resolveStandardJsxEventName(rawName, {
      customElement: !nativeHtml,
    });
    return {
      kind: nativeHtml ? "event" : "custom-event-candidate",
      name: resolved.name,
      propertyName: rawName,
      capture: resolved.capture,
    };
  }
  if (rawName === "ref" || rawName === "style" || rawName === "dangerouslySetInnerHTML") {
    return { kind: "inferred", name: rawName, propertyName: rawName };
  }
  return {
    kind: "inferred",
    name: nativeHtml
      ? (HTML_ATTRIBUTE_ALIASES.get(rawName) ?? rawName.toLowerCase())
      : namespace === "svg"
        ? normalizeSvgAttributeName(rawName)
        : rawName,
    propertyName: rawName,
  };
}

export function resolveConstructor(tagName, component, element) {
  if (typeof component === "function") return component;
  return element?.constructor ?? globalThis.customElements?.get?.(tagName);
}

export function getComponentProperties(tagName, component, element) {
  const constructor = resolveConstructor(tagName, component, element);
  constructor?.finalize?.();
  const properties = constructor?.elementProperties;
  return properties && typeof properties.has === "function" ? properties : null;
}

export function getDeclaredComponentBinding(tagName, name, component, element) {
  const properties = getComponentProperties(tagName, component, element);
  if (!properties) return null;
  if (properties.has(name)) {
    return { kind: "property", name, options: properties.get(name) };
  }

  const normalizedName = String(name).toLowerCase();
  for (const [propertyName, options] of properties) {
    if (typeof propertyName !== "string" || options?.attribute === false) continue;
    const attributeName = typeof options?.attribute === "string"
      ? options.attribute
      : propertyName.toLowerCase();
    if (attributeName.toLowerCase() === normalizedName) {
      return {
        kind: options?.type === Boolean ? "boolean" : "attribute",
        name: attributeName,
        options,
        propertyName,
      };
    }
  }
  return null;
}

export function hasComponentProperty(tagName, name, component, element) {
  if (element && name in element) return true;
  const constructor = resolveConstructor(tagName, component, element);
  const properties = getComponentProperties(tagName, component, element);
  return Boolean((properties && typeof properties.has === "function" && properties.has(name)) || (constructor?.prototype && name in constructor.prototype));
}

function hasDeclaredComponentProperty(tagName, name, component, element) {
  return getDeclaredComponentBinding(tagName, name, component, element) != null;
}

export function routeComponentRestProps(
  tagName,
  sources,
  component,
  element,
  forwardHostAttributes = false,
) {
  const constructor = resolveConstructor(tagName, component, element);
  const metadata = constructor?.[REST_PROPS];
  const propertyName = metadata?.property;
  if (typeof propertyName !== "string" || propertyName.length === 0) return sources;

  constructor?.finalize?.();
  const routed = [];
  const rest = {};
  let hasRest = false;

  for (const source of sources || []) {
    if (source == null || (typeof source !== "object" && typeof source !== "function")) continue;
    const explicit = {};
    let hasExplicit = false;
    for (const rawName of Object.keys(source)) {
      if (SKIPPED_KEYS.has(rawName) || rawName === propertyName) continue;
      const prefix = rawName[0];
      const routedName = prefix === "." || prefix === "?" || prefix === "@"
        ? rawName.slice(1)
        : rawName;
      const normalizedHostName = HTML_ATTRIBUTE_ALIASES.get(routedName) ?? routedName;
      const targetsHost = prefix === "@" || rawName === "ref" ||
        resolveExplicitJsxEventName(rawName) != null ||
        isNativeDomEventHandlerPropertyName(routedName) ||
        hasDeclaredComponentProperty(tagName, routedName, component, element) ||
        (!forwardHostAttributes && (
          isStandardHostAttributeName(normalizedHostName) ||
          isBooleanHostAttributeName(normalizedHostName) ||
          isBooleanValueHostAttributeName(normalizedHostName)
        ));
      if (targetsHost) {
        explicit[rawName] = source[rawName];
        hasExplicit = true;
      } else {
        rest[routedName] = source[rawName];
        hasRest = true;
      }
    }
    if (hasExplicit) routed.push(explicit);
  }

  routed.push({ [propertyName]: hasRest ? rest : {} });
  return routed;
}

export function shallowEqualRecords(left, right) {
  if (left === right) return true;
  if (!left || !right || typeof left !== "object" || typeof right !== "object") return false;
  const leftKeys = Object.keys(left);
  const rightKeys = Object.keys(right);
  if (leftKeys.length !== rightKeys.length) return false;
  return leftKeys.every((key) => Object.prototype.hasOwnProperty.call(right, key) && Object.is(left[key], right[key]));
}

export function inferDescriptor(tagName, rawName, value, component, element, namespace, reactCompatEvents = false) {
  const nativeHtml = namespace !== "svg" && !tagName.includes("-") && !component;
  const descriptor = normalizeName(rawName, nativeHtml, reactCompatEvents, namespace);
  if (!SAFE_BINDING_NAME.test(descriptor.name)) return null;
  if (descriptor.kind === "custom-event-candidate") {
    return hasComponentProperty(tagName, descriptor.propertyName, component, element)
      ? { kind: "property", name: descriptor.propertyName }
      : { kind: "event", name: descriptor.name, capture: descriptor.capture };
  }
  if (descriptor.kind !== "inferred") return descriptor;
  const { name, propertyName } = descriptor;
  if (name === "ref") return { kind: "ref", name };
  if (name === "dangerouslySetInnerHTML") return { kind: "inner-html", name };
  if (name === "style" && value && typeof value === "object") return { kind: "style", name };
  // Native SVG bindings are attributes unless authoring explicitly selected a
  // property with the `.name` prefix. SVG DOM properties are commonly readonly
  // SVGAnimated* wrappers and cannot be used as an inference source.
  if (namespace === "svg") {
    return typeof value === "boolean"
      ? { kind: "attribute", name, booleanValue: true }
      : { kind: "attribute", name };
  }
  const declaredBinding = !nativeHtml
    ? getDeclaredComponentBinding(tagName, propertyName, component, element)
    : null;
  if (declaredBinding) {
    return declaredBinding.kind === "property"
      ? { kind: "property", name: declaredBinding.name }
      : { kind: declaredBinding.kind, name: declaredBinding.name };
  }
  if (namespace !== "svg" && isBooleanHostAttributeName(name)) {
    return { kind: "boolean", name };
  }
  if (namespace !== "svg" && isBooleanValueHostAttributeName(name)) {
    return { kind: "attribute", name, booleanValue: true };
  }
  if (isStandardHostAttributeName(name)) return { kind: "attribute", name };
  if (namespace === "svg" && typeof value === "boolean") return { kind: "attribute", name, booleanValue: true };
  if (hasComponentProperty(tagName, propertyName, component, element)) return { kind: "property", name: propertyName };
  if (typeof value === "boolean") return { kind: "boolean", name };
  if (NATIVE_PROPERTY_NAMES.has(propertyName) || (value != null && (typeof value === "object" || typeof value === "function"))) return { kind: "property", name: propertyName };
  return { kind: "attribute", name };
}

function inferClientDescriptor(tagName, rawName, value, component, element, namespace, reactCompatEvents = false) {
  const constructor = resolveConstructor(tagName, component, element) ?? element.constructor;
  let cache = CLIENT_DESCRIPTOR_CACHE.get(constructor);
  if (!cache) {
    cache = new Map();
    CLIENT_DESCRIPTOR_CACHE.set(constructor, cache);
  }
  const cacheKey = `${namespace === "svg" ? "svg" : "html"}:${reactCompatEvents ? "react" : "native"}:${rawName}`;
  if (cache.has(cacheKey)) return cache.get(cacheKey);
  const descriptor = inferDescriptor(tagName, rawName, value, component, element, namespace, reactCompatEvents);
  const nativeHtml = namespace !== "svg" && !tagName.includes("-") && !component;
  const normalized = normalizeName(rawName, nativeHtml, reactCompatEvents, namespace);
  const valueDependent = normalized.kind === "inferred" && (
    normalized.name === "style" || (
      normalized.name !== "ref" && normalized.name !== "dangerouslySetInnerHTML" &&
      !isStandardHostAttributeName(normalized.name) &&
      !hasComponentProperty(tagName, normalized.propertyName, component, element) &&
      !isBooleanHostAttributeName(normalized.name) &&
      !isBooleanValueHostAttributeName(normalized.name) &&
      !NATIVE_PROPERTY_NAMES.has(normalized.propertyName)
    )
  );
  if (!valueDependent) cache.set(cacheKey, descriptor);
  return descriptor;
}

export const descriptorKey = (descriptor) =>
  descriptor.name === "style" && (descriptor.kind === "style" || descriptor.kind === "attribute")
    ? "style:style"
    : `${descriptor.kind}:${descriptor.name}`;

function mergeSources(tagName, sources, component, element, namespace, reactCompatEvents = false) {
  sources = routeComponentRestProps(
    tagName,
    sources,
    component,
    element,
    reactCompatEvents,
  );
  const merged = new Map();
  for (const source of sources || []) {
    if (source == null || (typeof source !== "object" && typeof source !== "function")) continue;
    for (const rawName of Object.keys(source)) {
      if (SKIPPED_KEYS.has(rawName)) continue;
      const value = source[rawName];
      const descriptor = inferDescriptor(tagName, rawName, value, component, element, namespace, reactCompatEvents);
      if (descriptor) merged.set(descriptorKey(descriptor), { descriptor, value });
    }
  }
  // An explicit `undefined` still wins over an earlier spread source, but it
  // does not materialize a binding. This matches parameter destructuring:
  // component defaults apply to undefined while null remains an explicit value.
  return [...merged.values()].filter(({ value }) => value !== undefined);
}

function mergeSourcesReverse(tagName, sources, component, element, seen, namespace, reactCompatEvents = false) {
  const bindings = [];
  const validSources = routeComponentRestProps(
    tagName,
    sources,
    component,
    element,
    reactCompatEvents,
  ) || [];
  const dedupe = validSources.length > 1;
  if (dedupe) seen.clear();
  for (let sourceIndex = validSources.length - 1; sourceIndex >= 0; sourceIndex -= 1) {
    const source = validSources[sourceIndex];
    if (source == null || (typeof source !== "object" && typeof source !== "function")) continue;
    const names = Object.keys(source);
    for (let nameIndex = names.length - 1; nameIndex >= 0; nameIndex -= 1) {
      const rawName = names[nameIndex];
      if (SKIPPED_KEYS.has(rawName)) continue;
      const value = source[rawName];
      const descriptor = inferClientDescriptor(tagName, rawName, value, component, element, namespace, reactCompatEvents);
      if (!descriptor) continue;
      const key = descriptorKey(descriptor);
      if (dedupe && seen.has(key)) continue;
      if (dedupe) seen.add(key);
      if (value === undefined) continue;
      bindings.push({ descriptor, value });
    }
  }
  return bindings;
}

export function bindingPrefix(descriptor) {
  if (descriptor.kind === "property") return `.${descriptor.name}`;
  if (descriptor.kind === "boolean") return `?${descriptor.name}`;
  if (descriptor.kind === "event") return `@${descriptor.name}`;
  return descriptor.name;
}

export function assignRef(value, element) {
  if (typeof value === "function") value(element);
  else if (value && typeof value === "object") value.value = element;
}

export function adaptRefBindings(bindings, adapter) {
  if (typeof adapter !== "function") return bindings;
  for (const binding of bindings) {
    if (
      binding.descriptor.kind === "ref" ||
      (binding.descriptor.kind === "property" && binding.descriptor.name === "ref")
    ) {
      binding.value = adapter(binding.value);
    }
  }
  return bindings;
}

function serverBindingValue(descriptor, value) {
  if (descriptor.kind === "attribute") {
    if (descriptor.booleanValue) return ifDefined(value == null ? undefined : String(value));
    return ifDefined(value == null || value === false ? undefined : value === true ? "" : value);
  }
  if (descriptor.kind === "style") return resolveStyle(value);
  if (descriptor.kind === "boolean") return booleanAttributeValue(value);
  if (descriptor.kind === "ref") return ref(value);
  if (descriptor.kind === "event" && descriptor.capture && value != null) return { handleEvent: value, capture: true };
  return value;
}

function digest(strings) {
  const hash = new Uint32Array(2).fill(5381);
  for (const string of strings) for (let index = 0; index < string.length; index += 1) hash[index % 2] = 33 * hash[index % 2] ^ string.charCodeAt(index);
  let binary = "";
  for (const byte of new Uint8Array(hash.buffer)) binary += String.fromCharCode(byte);
  return globalThis.btoa(binary);
}

function registerDigestMapping(serverStrings, clientStrings) {
  const mappings = globalThis[DIGEST_MAPPINGS] ??= new Map();
  const serverDigest = digest(serverStrings);
  if (mappings.has(serverDigest)) mappings.delete(serverDigest);
  mappings.set(serverDigest, digest(clientStrings));
  if (mappings.size > MAX_DIGEST_MAPPINGS) mappings.delete(mappings.keys().next().value);
}

function getClientStrings(tagName, isVoid, hasChildren, namespace) {
  const signature = `${namespace}|${tagName}|${isVoid ? 1 : 0}|${hasChildren ? 1 : 0}`;
  let strings = CLIENT_STRINGS_CACHE.get(signature);
  if (!strings) {
    strings = templateStrings(hasChildren ? [`<${tagName} `, ">", `</${tagName}>`] : [`<${tagName} `, isVoid ? ">" : `></${tagName}>`]);
    cacheTemplate(CLIENT_STRINGS_CACHE, signature, strings);
  }
  return strings;
}

function getServerStrings(tagName, bindings, isVoid, hasChildren, innerHtml, namespace) {
  const innerMarkup = innerHtml?.value?.__html == null ? "" : String(innerHtml.value.__html);
  const signature = `${namespace}|${tagName}|${isVoid ? 1 : 0}|${hasChildren ? 1 : 0}|${innerMarkup}|${bindings.map(({ descriptor }) => descriptorKey(descriptor)).join("|")}`;
  let strings = SERVER_STRINGS_CACHE.get(signature);
  if (strings) return strings;
  const next = [`<${tagName} @__litsx_spread=` , ""];
  for (const { descriptor } of bindings) {
    next[next.length - 1] += descriptor.kind === "ref" ? " " : ` ${bindingPrefix(descriptor)}=`;
    next.push("");
  }
  next[next.length - 1] += `>${innerMarkup}`;
  if (hasChildren && !innerHtml) next.push("");
  if (!isVoid) next[next.length - 1] += `</${tagName}>`;
  strings = templateStrings(next);
  return innerHtml ? strings : cacheTemplate(SERVER_STRINGS_CACHE, signature, strings);
}

export function serializedValue(value) {
  return value == null || value === false ? null : value === true ? "" : String(value);
}

export function booleanAttributeValue(value) {
  return value !== false && value != null;
}

export function eventOptions(descriptor, value) {
  const listener = value && typeof value === "object" ? value : null;
  return {
    capture: descriptor.capture === true || listener?.capture === true,
    once: listener?.once === true,
    passive: listener?.passive === true,
  };
}

export function cssPropertyName(name) {
  return name.includes("-")
    ? name
    : name.replace(/(?:^(webkit|moz|ms|o)|)(?=[A-Z])/g, "-$&").toLowerCase();
}

export function clearBinding(element, descriptor, previous) {
  if (!element) return;
  if (descriptor.kind === "event") element.removeEventListener(descriptor.name, previous.value, eventOptions(descriptor, previous.value));
  else if (descriptor.kind === "ref") assignRef(previous.value, undefined);
  else if (descriptor.kind === "style") {
    for (const name of previous.styleNames || Object.keys(previous.value || {})) {
      element.style.removeProperty(cssPropertyName(name));
    }
  }
  else if (descriptor.kind === "property") element[descriptor.name] = typeof element[descriptor.name] === "boolean" ? false : undefined;
  else if (descriptor.kind !== "inner-html") removeElementAttribute(element, descriptor.name);
}

function namespacedAttribute(name) {
  const separator = name.indexOf(":");
  if (separator <= 0) return null;
  const namespace = ATTRIBUTE_NAMESPACES.get(name.slice(0, separator));
  return namespace
    ? { namespace, localName: name.slice(separator + 1) }
    : null;
}

function removeElementAttribute(element, name) {
  const namespaced = namespacedAttribute(name);
  if (namespaced) element.removeAttributeNS(namespaced.namespace, namespaced.localName);
  else element.removeAttribute(name);
}

function setElementAttribute(element, name, value) {
  const namespaced = namespacedAttribute(name);
  if (namespaced) element.setAttributeNS(namespaced.namespace, name, value);
  else element.setAttribute(name, value);
}

function getElementAttribute(element, name) {
  const namespaced = namespacedAttribute(name);
  return namespaced
    ? element.getAttributeNS(namespaced.namespace, namespaced.localName)
    : element.getAttribute(name);
}

export function applyStyleBinding(element, value, previous) {
  // A runtime JSX spread is attached to Lit's ElementPart, where an attribute
  // directive cannot run. Apply styleMap's DOM update semantics directly;
  // serialization still goes through the official directive on the server.
  const nextStyle = value || {};
  const oldNames = previous?.styleNames || new Set(Object.keys(previous?.value || {}));
  const nextNames = new Set();

  for (const name of oldNames) {
    if (!(name in nextStyle) || nextStyle[name] == null) {
      element.style.removeProperty(cssPropertyName(name));
    }
  }

  for (const name of Object.keys(nextStyle)) {
    const next = nextStyle[name];
    if (next == null) continue;
    nextNames.add(name);
    const isImportant = typeof next === "string" && next.endsWith(" !important");
    if (name.includes("-") || isImportant) {
      element.style.setProperty(
        name,
        isImportant ? next.slice(0, -11) : next,
        isImportant ? "important" : "",
      );
    } else {
      element.style[name] = next;
    }
  }

  return nextNames;
}

export function applyBinding(element, descriptor, value, previous, adoptAttributes) {
  if (descriptor.kind === "attribute") {
    if (adoptAttributes) return;
    const next = descriptor.booleanValue && value != null ? String(value) : serializedValue(value);
    if (next == null) removeElementAttribute(element, descriptor.name);
    else if (getElementAttribute(element, descriptor.name) !== next) {
      setElementAttribute(element, descriptor.name, next);
    }
  } else if (descriptor.kind === "boolean") {
    if (!adoptAttributes) element.toggleAttribute(descriptor.name, booleanAttributeValue(value));
  } else if (descriptor.kind === "property") {
    if (element[descriptor.name] !== value) element[descriptor.name] = value;
  } else if (descriptor.kind === "event") {
    if (previous?.value === value) return;
    if (previous) element.removeEventListener(descriptor.name, previous.value, eventOptions(descriptor, previous.value));
    if (value != null) element.addEventListener(descriptor.name, value, eventOptions(descriptor, value));
  } else if (descriptor.kind === "ref") {
    if (previous?.value === value) return;
    if (previous) assignRef(previous.value, undefined);
    assignRef(value, element);
  } else if (descriptor.kind === "style") {
    return applyStyleBinding(element, value, previous);
  } else if (descriptor.kind === "inner-html") {
    const markup = value?.__html == null ? "" : String(value.__html);
    if (element.innerHTML !== markup) element.innerHTML = markup;
  }
}

class JsxSpreadDirective extends Directive {
  constructor(partInfo) {
    super(partInfo);
    if (partInfo.type !== PartType.ELEMENT) throw new Error("jsxSpreadElement requires an ElementPart");
    this.bindings = new Map();
    this.hydrated = false;
    this.element = null;
    this.seen = new Set();
  }
  render() { return noChange; }
  update(part, [tagName, sources, options]) {
    const element = this.element = part.element;
    const next = adaptRefBindings(
      mergeSourcesReverse(tagName, sources, options.component, element, this.seen, options.namespace, options.reactCompatEvents === true),
      options.refAdapter,
    );
    const restPropertyName = resolveConstructor(tagName, options.component, element)?.[REST_PROPS]?.property;
    const nextKeys = new Set(next.map(({ descriptor }) => descriptorKey(descriptor)));
    for (const [key, previous] of this.bindings) if (!nextKeys.has(key)) clearBinding(element, previous.descriptor, previous);
    const adoptAttributes = !this.hydrated && (globalThis[HYDRATION_DEPTH] ?? 0) > 0;
    const updated = new Map();
    for (const binding of next) {
      const key = descriptorKey(binding.descriptor);
      let previous = this.bindings.get(key);
      if (previous && previous.descriptor.kind !== binding.descriptor.kind) {
        clearBinding(element, previous.descriptor, previous);
        previous = null;
      }
      if (
        binding.descriptor.kind === "property" &&
        binding.descriptor.name === restPropertyName &&
        shallowEqualRecords(previous?.value ?? element[restPropertyName], binding.value)
      ) {
        binding.value = previous?.value ?? element[restPropertyName];
      }
      const styleNames = applyBinding(element, binding.descriptor, binding.value, previous, adoptAttributes);
      if (styleNames) binding.styleNames = styleNames;
      updated.set(key, binding);
    }
    this.bindings = updated;
    this.hydrated = true;
    return noChange;
  }
  disconnected() {
    for (const binding of this.bindings.values()) if (binding.descriptor.kind === "event" || binding.descriptor.kind === "ref") clearBinding(this.element, binding.descriptor, binding);
  }
}

const jsxSpread = directive(JsxSpreadDirective);

/**
 * Uses a stable ElementPart template in browsers and SSR-compatible ordinary
 * parts on the server. @litsx/ssr reconciles their template digests at the
 * streaming boundary so Lit can hydrate the original server node.
 */
export function jsxSpreadElement(tagName, sources, options = {}, children = nothing) {
  tagName = String(tagName);
  const isVoid = options.void === true;
  const hasChildren = !isVoid && children !== nothing;
  const namespace = options.namespace === "svg" ? "svg" : "html";
  const templateTag = namespace === "svg" ? svg : html;
  const clientStrings = getClientStrings(tagName, isVoid, hasChildren, namespace);
  // `server: true` is a compiler hint carried by modules transformed through
  // an SSR-configured Vite pipeline. Those same modules can execute in the
  // browser during hydration, where the client runtime must still select the
  // stable ElementPart template that matches the registered digest mapping.
  const hasClientDom = typeof window !== "undefined" && typeof document !== "undefined";
  const clientRuntime = (hasClientDom && globalThis[CLIENT_RUNTIME] === true) || (
    options.server !== true && !isServer
  );
  if (clientRuntime) {
    const values = [jsxSpread(tagName, sources, options)];
    if (hasChildren) values.push(children);
    return templateTag(clientStrings, ...values);
  }
  const descriptors = adaptRefBindings(
    mergeSources(tagName, sources, options.component, undefined, options.namespace, options.reactCompatEvents === true),
    options.refAdapter,
  );
  const innerHtml = descriptors.find(({ descriptor }) => descriptor.kind === "inner-html");
  const bindings = innerHtml ? descriptors.filter(({ descriptor }) => descriptor.kind !== "inner-html") : descriptors;
  const serverHasChildren = !isVoid && (innerHtml != null || hasChildren);
  const strings = getServerStrings(tagName, bindings, isVoid, serverHasChildren, innerHtml, namespace);
  registerDigestMapping(strings, clientStrings);
  const values = [nothing, ...bindings.map(({ descriptor, value }) => serverBindingValue(descriptor, value))];
  if (serverHasChildren && !innerHtml) values.push(children);
  return templateTag(strings, ...values);
}
