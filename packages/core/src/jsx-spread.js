import { html, isServer, noChange, nothing } from "lit";
import { Directive, PartType, directive } from "lit/directive.js";
import { ifDefined } from "lit/directives/if-defined.js";
import { ref } from "lit/directives/ref.js";
import { styleMap } from "lit/directives/style-map.js";

const ATTRIBUTE_NAMES = new Set(["class", "id", "slot", "part", "exportparts", "role", "title", "tabindex"]);
const BOOLEAN_ATTRIBUTE_NAMES = new Set(["allowfullscreen", "async", "autofocus", "autoplay", "checked", "controls", "default", "defer", "disabled", "formnovalidate", "hidden", "inert", "ismap", "itemscope", "loop", "multiple", "muted", "nomodule", "novalidate", "open", "playsinline", "readonly", "required", "reversed", "selected"]);
const BOOLEAN_VALUE_ATTRIBUTE_NAMES = new Set(["contenteditable", "draggable", "spellcheck"]);
const HTML_ATTRIBUTE_ALIASES = new Map([["acceptCharset", "accept-charset"], ["className", "class"], ["htmlFor", "for"], ["httpEquiv", "http-equiv"]]);
const NATIVE_PROPERTY_NAMES = new Set(["checked", "files", "indeterminate", "selectedIndex", "value"]);
const EVENT_ALIASES = new Map([["doubleclick", "dblclick"], ["focus", "focusin"], ["blur", "focusout"]]);
const SKIPPED_KEYS = new Set(["__proto__", "constructor", "prototype", "key", "children"]);
const SERVER_STRINGS_CACHE = new Map();
const CLIENT_STRINGS_CACHE = new Map();
const REACT_REF_CALLBACKS = new WeakMap();
const CLIENT_DESCRIPTOR_CACHE = new WeakMap();
const SAFE_BINDING_NAME = /^[A-Za-z_$][A-Za-z0-9_$:.-]*$/;
const DIGEST_MAPPINGS = Symbol.for("@litsx/ssr/spread-digest-mappings");
const HYDRATION_DEPTH = Symbol.for("@litsx/ssr/hydration-depth");
const CLIENT_RUNTIME = Symbol.for("@litsx/ssr/client-runtime");
const MAX_DIGEST_MAPPINGS = 2048;
const MAX_TEMPLATE_STRINGS = 2048;

function templateStrings(values) {
  Object.defineProperty(values, "raw", { value: Object.freeze([...values]) });
  return Object.freeze(values);
}

function cacheTemplate(cache, key, strings) {
  cache.set(key, strings);
  if (cache.size > MAX_TEMPLATE_STRINGS) cache.delete(cache.keys().next().value);
  return strings;
}

function normalizeName(rawName, nativeHtml) {
  if (rawName === "className") return { kind: "attribute", name: "class" };
  if (rawName === "htmlFor" && nativeHtml) return { kind: "attribute", name: "for" };
  const prefix = rawName[0];
  if (prefix === ".") return { kind: "property", name: rawName.slice(1) };
  if (prefix === "?") return { kind: "boolean", name: rawName.slice(1) };
  if (prefix === "@") return { kind: "event", name: rawName.slice(1) };
  if (/^on[A-Z]/.test(rawName)) {
    const reactName = rawName.slice(2).replace(/Capture$/, "");
    const normalized = reactName.replace(/[A-Z]/g, (match) => match.toLowerCase());
    return { kind: "event", name: EVENT_ALIASES.get(normalized) ?? normalized, capture: rawName.endsWith("Capture") || normalized === "focus" || normalized === "blur" };
  }
  if (rawName === "ref" || rawName === "style" || rawName === "dangerouslySetInnerHTML") {
    return { kind: "inferred", name: rawName, propertyName: rawName };
  }
  return {
    kind: "inferred",
    name: nativeHtml ? (HTML_ATTRIBUTE_ALIASES.get(rawName) ?? rawName.toLowerCase()) : rawName,
    propertyName: rawName,
  };
}

function isAttributeName(name) {
  return ATTRIBUTE_NAMES.has(name) || name.startsWith("data-") || name.startsWith("aria-");
}

function resolveConstructor(tagName, component, element) {
  if (typeof component === "function") return component;
  return element?.constructor ?? globalThis.customElements?.get?.(tagName);
}

function hasComponentProperty(tagName, name, component, element) {
  if (element && name in element) return true;
  const constructor = resolveConstructor(tagName, component, element);
  const properties = constructor?.elementProperties;
  return Boolean((properties && typeof properties.has === "function" && properties.has(name)) || (constructor?.prototype && name in constructor.prototype));
}

function inferDescriptor(tagName, rawName, value, component, element, namespace) {
  const nativeHtml = namespace !== "svg" && !tagName.includes("-") && !component;
  const descriptor = normalizeName(rawName, nativeHtml);
  if (!SAFE_BINDING_NAME.test(descriptor.name)) return null;
  if (descriptor.kind !== "inferred") return descriptor;
  const { name, propertyName } = descriptor;
  if (name === "ref") return { kind: "ref", name };
  if (name === "dangerouslySetInnerHTML") return { kind: "inner-html", name };
  if (name === "style" && value && typeof value === "object") return { kind: "style", name };
  if (isAttributeName(name)) return { kind: "attribute", name };
  if (nativeHtml && BOOLEAN_ATTRIBUTE_NAMES.has(name)) return { kind: "boolean", name };
  if (nativeHtml && BOOLEAN_VALUE_ATTRIBUTE_NAMES.has(name)) return { kind: "attribute", name, booleanValue: true };
  if (namespace === "svg" && typeof value === "boolean") return { kind: "attribute", name, booleanValue: true };
  if (hasComponentProperty(tagName, propertyName, component, element)) return { kind: "property", name: propertyName };
  if (typeof value === "boolean") return { kind: "boolean", name };
  if (NATIVE_PROPERTY_NAMES.has(propertyName) || (value != null && (typeof value === "object" || typeof value === "function"))) return { kind: "property", name: propertyName };
  return { kind: "attribute", name };
}

function inferClientDescriptor(tagName, rawName, value, component, element, namespace) {
  const constructor = resolveConstructor(tagName, component, element) ?? element.constructor;
  let cache = CLIENT_DESCRIPTOR_CACHE.get(constructor);
  if (!cache) {
    cache = new Map();
    CLIENT_DESCRIPTOR_CACHE.set(constructor, cache);
  }
  if (cache.has(rawName)) return cache.get(rawName);
  const descriptor = inferDescriptor(tagName, rawName, value, component, element, namespace);
  const nativeHtml = namespace !== "svg" && !tagName.includes("-") && !component;
  const normalized = normalizeName(rawName, nativeHtml);
  const valueDependent = normalized.kind === "inferred" && (
    normalized.name === "style" || (
      normalized.name !== "ref" && normalized.name !== "dangerouslySetInnerHTML" &&
      !isAttributeName(normalized.name) &&
      !hasComponentProperty(tagName, normalized.propertyName, component, element) &&
      !BOOLEAN_ATTRIBUTE_NAMES.has(normalized.name.toLowerCase()) &&
      !BOOLEAN_VALUE_ATTRIBUTE_NAMES.has(normalized.name.toLowerCase()) &&
      !NATIVE_PROPERTY_NAMES.has(normalized.propertyName)
    )
  );
  if (!valueDependent) cache.set(rawName, descriptor);
  return descriptor;
}

const descriptorKey = (descriptor) => `${descriptor.kind}:${descriptor.name}`;

function mergeSources(tagName, sources, component, element, namespace) {
  const merged = new Map();
  for (const source of sources || []) {
    if (source == null || (typeof source !== "object" && typeof source !== "function")) continue;
    for (const rawName of Object.keys(source)) {
      if (SKIPPED_KEYS.has(rawName)) continue;
      const value = source[rawName];
      const descriptor = inferDescriptor(tagName, rawName, value, component, element, namespace);
      if (descriptor) merged.set(descriptorKey(descriptor), { descriptor, value });
    }
  }
  return [...merged.values()];
}

function mergeSourcesReverse(tagName, sources, component, element, seen, namespace) {
  const bindings = [];
  const validSources = sources || [];
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
      const descriptor = inferClientDescriptor(tagName, rawName, value, component, element, namespace);
      if (!descriptor) continue;
      const key = descriptorKey(descriptor);
      if (dedupe && seen.has(key)) continue;
      if (dedupe) seen.add(key);
      bindings.push({ descriptor, value });
    }
  }
  return bindings;
}

function bindingPrefix(descriptor) {
  if (descriptor.kind === "property") return `.${descriptor.name}`;
  if (descriptor.kind === "boolean") return `?${descriptor.name}`;
  if (descriptor.kind === "event") return `@${descriptor.name}`;
  return descriptor.name;
}

function reactRef(value) {
  if (!(value && typeof value === "object" && "current" in value)) return value;
  let callback = REACT_REF_CALLBACKS.get(value);
  if (!callback) {
    callback = (element) => { value.current = element; };
    REACT_REF_CALLBACKS.set(value, callback);
  }
  return callback;
}

function serverBindingValue(descriptor, value) {
  if (descriptor.kind === "attribute") {
    if (descriptor.booleanValue) return ifDefined(value == null ? undefined : String(value));
    return ifDefined(value == null || value === false ? undefined : value === true ? "" : value);
  }
  if (descriptor.kind === "style") return styleMap(value || {});
  if (descriptor.kind === "ref") return ref(reactRef(value));
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

function getClientStrings(tagName, isVoid, hasChildren) {
  const signature = `${tagName}|${isVoid ? 1 : 0}|${hasChildren ? 1 : 0}`;
  let strings = CLIENT_STRINGS_CACHE.get(signature);
  if (!strings) {
    strings = templateStrings(hasChildren ? [`<${tagName} `, ">", `</${tagName}>`] : [`<${tagName} `, isVoid ? ">" : `></${tagName}>`]);
    cacheTemplate(CLIENT_STRINGS_CACHE, signature, strings);
  }
  return strings;
}

function getServerStrings(tagName, bindings, isVoid, hasChildren, innerHtml) {
  const innerMarkup = innerHtml?.value?.__html == null ? "" : String(innerHtml.value.__html);
  const signature = `${tagName}|${isVoid ? 1 : 0}|${hasChildren ? 1 : 0}|${innerMarkup}|${bindings.map(({ descriptor }) => descriptorKey(descriptor)).join("|")}`;
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

function serializedValue(value) {
  return value == null || value === false ? null : value === true ? "" : String(value);
}

function clearBinding(element, descriptor, previous) {
  if (!element) return;
  if (descriptor.kind === "event") element.removeEventListener(descriptor.name, previous.value, { capture: descriptor.capture });
  else if (descriptor.kind === "ref") reactRef(previous.value)?.(null);
  else if (descriptor.kind === "style") for (const name of Object.keys(previous.value || {})) element.style[name] = "";
  else if (descriptor.kind === "property") element[descriptor.name] = typeof element[descriptor.name] === "boolean" ? false : undefined;
  else if (descriptor.kind !== "inner-html") element.removeAttribute(descriptor.name);
}

function applyBinding(element, descriptor, value, previous, adoptAttributes) {
  if (descriptor.kind === "attribute") {
    if (adoptAttributes) return;
    const next = descriptor.booleanValue && value != null ? String(value) : serializedValue(value);
    if (next == null) element.removeAttribute(descriptor.name);
    else if (element.getAttribute(descriptor.name) !== next) element.setAttribute(descriptor.name, next);
  } else if (descriptor.kind === "boolean") {
    if (!adoptAttributes) element.toggleAttribute(descriptor.name, Boolean(value));
  } else if (descriptor.kind === "property") {
    if (element[descriptor.name] !== value) element[descriptor.name] = value;
  } else if (descriptor.kind === "event") {
    if (previous?.value === value) return;
    if (previous) element.removeEventListener(descriptor.name, previous.value, { capture: descriptor.capture });
    if (value != null) element.addEventListener(descriptor.name, value, { capture: descriptor.capture });
  } else if (descriptor.kind === "ref") {
    if (previous?.value === value) return;
    if (previous) reactRef(previous.value)?.(null);
    reactRef(value)?.(element);
  } else if (descriptor.kind === "style") {
    const oldStyle = previous?.value || {};
    const nextStyle = value || {};
    for (const name of Object.keys(oldStyle)) if (!(name in nextStyle)) element.style[name] = "";
    Object.assign(element.style, nextStyle);
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
    const next = mergeSourcesReverse(tagName, sources, options.component, element, this.seen, options.namespace);
    const nextKeys = new Set(next.map(({ descriptor }) => descriptorKey(descriptor)));
    for (const [key, previous] of this.bindings) if (!nextKeys.has(key)) clearBinding(element, previous.descriptor, previous);
    const adoptAttributes = !this.hydrated && (globalThis[HYDRATION_DEPTH] ?? 0) > 0;
    const updated = new Map();
    for (const binding of next) {
      const key = descriptorKey(binding.descriptor);
      applyBinding(element, binding.descriptor, binding.value, this.bindings.get(key), adoptAttributes);
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
  const clientStrings = getClientStrings(tagName, isVoid, hasChildren);
  if (!isServer || globalThis[CLIENT_RUNTIME] === true) {
    const values = [jsxSpread(tagName, sources, options)];
    if (hasChildren) values.push(children);
    return html(clientStrings, ...values);
  }
  const descriptors = mergeSources(tagName, sources, options.component, undefined, options.namespace);
  const innerHtml = descriptors.find(({ descriptor }) => descriptor.kind === "inner-html");
  const bindings = innerHtml ? descriptors.filter(({ descriptor }) => descriptor.kind !== "inner-html") : descriptors;
  const serverHasChildren = !isVoid && (innerHtml != null || hasChildren);
  const strings = getServerStrings(tagName, bindings, isVoid, serverHasChildren, innerHtml);
  registerDigestMapping(strings, clientStrings);
  const values = [nothing, ...bindings.map(({ descriptor, value }) => serverBindingValue(descriptor, value))];
  if (serverHasChildren && !innerHtml) values.push(children);
  return html(strings, ...values);
}
