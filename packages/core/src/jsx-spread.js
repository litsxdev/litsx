import { html, nothing } from "lit";
import { ifDefined } from "lit/directives/if-defined.js";
import { ref } from "lit/directives/ref.js";
import { styleMap } from "lit/directives/style-map.js";
import { unsafeHTML } from "lit/directives/unsafe-html.js";

const ATTRIBUTE_NAMES = new Set([
  "class",
  "id",
  "slot",
  "part",
  "exportparts",
  "role",
  "title",
  "tabindex",
]);
const BOOLEAN_ATTRIBUTE_NAMES = new Set([
  "allowfullscreen",
  "async",
  "autofocus",
  "autoplay",
  "checked",
  "controls",
  "default",
  "defer",
  "disabled",
  "formnovalidate",
  "hidden",
  "inert",
  "ismap",
  "itemscope",
  "loop",
  "multiple",
  "muted",
  "nomodule",
  "novalidate",
  "open",
  "playsinline",
  "readonly",
  "required",
  "reversed",
  "selected",
]);
const NATIVE_PROPERTY_NAMES = new Set([
  "checked",
  "files",
  "indeterminate",
  "selectedIndex",
  "value",
]);
const EVENT_ALIASES = new Map([
  ["doubleclick", "dblclick"],
  ["focus", "focusin"],
  ["blur", "focusout"],
]);
const SKIPPED_KEYS = new Set([
  "__proto__",
  "constructor",
  "prototype",
  "key",
  "children",
]);
const TEMPLATE_STRINGS_CACHE = new Map();
const REACT_REF_CALLBACKS = new WeakMap();
const SAFE_BINDING_NAME = /^[A-Za-z_$][A-Za-z0-9_$:.-]*$/;

function normalizeName(rawName) {
  if (rawName === "className") {
    return { kind: "attribute", name: "class" };
  }

  const prefix = rawName[0];
  if (prefix === ".") {
    return { kind: "property", name: rawName.slice(1) };
  }
  if (prefix === "?") {
    return { kind: "boolean", name: rawName.slice(1) };
  }
  if (prefix === "@") {
    return { kind: "event", name: rawName.slice(1) };
  }

  if (/^on[A-Z]/.test(rawName)) {
    const reactName = rawName.slice(2).replace(/Capture$/, "");
    const normalized = reactName.replace(/[A-Z]/g, (match) => match.toLowerCase());
    return {
      kind: "event",
      name: EVENT_ALIASES.get(normalized) ?? normalized,
      capture: rawName.endsWith("Capture") || normalized === "focus" || normalized === "blur",
    };
  }

  return { kind: "inferred", name: rawName };
}

function isAttributeName(name) {
  return (
    ATTRIBUTE_NAMES.has(name) ||
    name.startsWith("data-") ||
    name.startsWith("aria-")
  );
}

function hasReactiveProperty(tagName, name) {
  const registry = globalThis.customElements;
  const properties = registry?.get?.(tagName)?.elementProperties;
  return Boolean(properties && typeof properties.has === "function" && properties.has(name));
}

function inferDescriptor(tagName, rawName, value, component) {
  const descriptor = normalizeName(rawName);
  if (!SAFE_BINDING_NAME.test(descriptor.name)) {
    return null;
  }
  if (descriptor.kind !== "inferred") {
    return descriptor;
  }

  const { name } = descriptor;
  if (name === "ref") {
    return { kind: "ref", name };
  }
  if (name === "dangerouslySetInnerHTML") {
    return { kind: "inner-html", name };
  }
  if (name === "style" && value && typeof value === "object") {
    return { kind: "style", name };
  }
  if (isAttributeName(name)) {
    return { kind: "attribute", name };
  }
  if (component || hasReactiveProperty(tagName, name)) {
    return { kind: "property", name };
  }
  if (BOOLEAN_ATTRIBUTE_NAMES.has(name.toLowerCase()) || typeof value === "boolean") {
    return { kind: "boolean", name };
  }
  if (
    NATIVE_PROPERTY_NAMES.has(name) ||
    (value != null && (typeof value === "object" || typeof value === "function"))
  ) {
    return { kind: "property", name };
  }
  return { kind: "attribute", name };
}

function descriptorKey(descriptor) {
  return `${descriptor.kind}:${descriptor.name}`;
}

function mergeSources(tagName, sources, component) {
  const merged = new Map();
  for (const source of sources || []) {
    if (source == null || (typeof source !== "object" && typeof source !== "function")) {
      continue;
    }
    for (const rawName of Object.keys(source)) {
      if (SKIPPED_KEYS.has(rawName)) continue;
      const value = source[rawName];
      const descriptor = inferDescriptor(tagName, rawName, value, component);
      if (descriptor) {
        merged.set(descriptorKey(descriptor), { descriptor, value });
      }
    }
  }
  return [...merged.values()];
}

function bindingPrefix(descriptor) {
  if (descriptor.kind === "property") return `.${descriptor.name}`;
  if (descriptor.kind === "boolean") return `?${descriptor.name}`;
  if (descriptor.kind === "event") return `@${descriptor.name}`;
  return descriptor.name;
}

function bindingValue(descriptor, value) {
  if (descriptor.kind === "attribute") {
    return ifDefined(value == null || value === false ? undefined : value === true ? "" : value);
  }
  if (descriptor.kind === "style") {
    return styleMap(value || {});
  }
  if (descriptor.kind === "ref") {
    if (value && typeof value === "object" && "current" in value) {
      let callback = REACT_REF_CALLBACKS.get(value);
      if (!callback) {
        callback = (element) => {
          value.current = element;
        };
        REACT_REF_CALLBACKS.set(value, callback);
      }
      return ref(callback);
    }
    return ref(value);
  }
  if (descriptor.kind === "inner-html") {
    const markup = value && typeof value === "object" ? value.__html : undefined;
    return unsafeHTML(markup == null ? "" : String(markup));
  }
  if (descriptor.kind === "event" && descriptor.capture && value != null) {
    return { handleEvent: value, capture: true };
  }
  return value;
}

function getTemplateStrings(tagName, descriptors, isVoid, hasChildren) {
  const signature = `${tagName}|${isVoid ? 1 : 0}|${hasChildren ? 1 : 0}|${descriptors
    .map(({ descriptor }) => `${descriptor.kind}:${descriptor.name}`)
    .join("|")}`;
  let strings = TEMPLATE_STRINGS_CACHE.get(signature);
  if (strings) return strings;

  const next = [`<${tagName}`];
  for (const { descriptor } of descriptors) {
    next[next.length - 1] += descriptor.kind === "ref"
      ? " "
      : ` ${bindingPrefix(descriptor)}=`;
    next.push("");
  }
  next[next.length - 1] += ">";
  if (hasChildren) {
    next.push("");
  }
  if (!isVoid) {
    next[next.length - 1] += `</${tagName}>`;
  }

  Object.defineProperty(next, "raw", { value: Object.freeze([...next]) });
  strings = Object.freeze(next);
  TEMPLATE_STRINGS_CACHE.set(signature, strings);
  return strings;
}

/**
 * Builds a regular Lit TemplateResult for an element with JSX spread props.
 * Regular attribute/property parts are understood by both Lit DOM rendering and
 * @lit-labs/ssr, unlike an element-part directive.
 */
export function jsxSpreadElement(tagName, sources, options = {}, children = nothing) {
  const component = options.component === true || String(tagName).includes("-");
  const descriptors = mergeSources(String(tagName), sources, component);
  const innerHtml = descriptors.find(({ descriptor }) => descriptor.kind === "inner-html");
  const bindings = innerHtml
    ? descriptors.filter(({ descriptor }) => descriptor.kind !== "inner-html")
    : descriptors;
  const hasChildren = !options.void && (innerHtml != null || children !== nothing);
  const strings = getTemplateStrings(String(tagName), bindings, options.void === true, hasChildren);
  const values = bindings.map(({ descriptor, value }) => bindingValue(descriptor, value));

  if (hasChildren) {
    values.push(innerHtml ? bindingValue(innerHtml.descriptor, innerHtml.value) : children);
  }
  return html(strings, ...values);
}
