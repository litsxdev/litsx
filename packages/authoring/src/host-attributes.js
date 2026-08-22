const STANDARD_HOST_ATTRIBUTE_NAMES = new Set([
  "accesskey",
  "autocapitalize",
  "autofocus",
  "class",
  "contenteditable",
  "dir",
  "draggable",
  "enterkeyhint",
  "exportparts",
  "hidden",
  "id",
  "inert",
  "inputmode",
  "is",
  "itemid",
  "itemprop",
  "itemref",
  "itemscope",
  "itemtype",
  "lang",
  "nonce",
  "part",
  "popover",
  "role",
  "slot",
  "spellcheck",
  "style",
  "tabindex",
  "title",
  "translate",
  "virtualkeyboardpolicy",
  "writingsuggestions",
]);

const BOOLEAN_HOST_ATTRIBUTE_NAMES = new Set([
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

const BOOLEAN_VALUE_HOST_ATTRIBUTE_NAMES = new Set([
  "contenteditable",
  "draggable",
  "spellcheck",
]);

export function isStandardHostAttributeName(name) {
  return typeof name === "string" && (
    STANDARD_HOST_ATTRIBUTE_NAMES.has(name.toLowerCase()) ||
    name.startsWith("aria-") ||
    name.startsWith("data-")
  );
}

export function isBooleanHostAttributeName(name) {
  return typeof name === "string" &&
    BOOLEAN_HOST_ATTRIBUTE_NAMES.has(name.toLowerCase());
}

export function isBooleanValueHostAttributeName(name) {
  return typeof name === "string" &&
    BOOLEAN_VALUE_HOST_ATTRIBUTE_NAMES.has(name.toLowerCase());
}
