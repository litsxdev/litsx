// Centralized from TypeScript's GlobalEventHandlersEventMap. Keeping this in
// the authoring package makes compiler, runtime, SSR, and tooling agree.
const DOM_EVENT_NAMES = new Set([
  "abort",
  "animationcancel", "animationend", "animationiteration", "animationstart",
  "auxclick", "beforeinput", "beforematch", "beforetoggle", "canplay",
  "canplaythrough", "cancel", "change", "click", "close", "command",
  "compositionend", "compositionstart", "compositionupdate",
  "contextlost", "contextmenu", "contextrestored", "dragend", "dragenter",
  "copy", "cuechange", "cut", "drag", "dragleave", "dragover", "dragstart",
  "drop", "durationchange", "emptied", "ended", "error", "focus", "focusin",
  "focusout", "formdata",
  "gotpointercapture", "keydown", "keypress", "keyup", "loadeddata",
  "input", "invalid", "load", "loadedmetadata", "loadstart", "lostpointercapture", "mousedown",
  "mouseenter", "mouseleave", "mousemove", "mouseout", "mouseover", "mouseup",
  "paste", "pause", "play", "playing",
  "pointercancel", "pointerdown", "pointerenter", "pointerleave", "pointermove",
  "pointerout", "pointerover", "pointerrawupdate", "pointerup", "progress", "ratechange", "reset", "resize", "scroll",
  "scrollend", "securitypolicyviolation", "selectionchange", "selectstart",
  "seeked", "seeking", "select", "slotchange", "stalled", "submit", "suspend",
  "timeupdate", "toggle", "touchcancel", "touchend", "touchmove",
  "touchstart", "transitioncancel", "transitionend", "transitionrun",
  "transitionstart", "volumechange", "waiting", "webkitanimationend",
  "webkitanimationiteration", "webkitanimationstart", "webkittransitionend",
  "wheel",
]);

const DOM_EVENT_ALIASES = new Map([
  ["doubleclick", { name: "dblclick" }],
  ["focus", { name: "focusin", capture: true }],
  ["blur", { name: "focusout", capture: true }],
]);

export function isStandardJsxEventPropName(name) {
  return typeof name === "string" && /^on[A-Z]/.test(name);
}

export function isStandardDomEventPropName(rawName) {
  if (!isStandardJsxEventPropName(rawName)) return false;
  const eventName = rawName.slice(2).replace(/Capture$/, "");
  const domName = eventName.replace(/[A-Z]/g, (match) => match.toLowerCase());
  return DOM_EVENT_NAMES.has(domName) || DOM_EVENT_ALIASES.has(domName);
}

export function toKebabEventName(name) {
  return String(name)
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1-$2")
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .toLowerCase();
}

export function resolveStandardJsxEventName(rawName, { customElement = false } = {}) {
  if (!isStandardJsxEventPropName(rawName)) return null;

  let eventName = rawName.slice(2);
  let capture = false;
  if (eventName.endsWith("Capture")) {
    capture = true;
    eventName = eventName.slice(0, -7);
  }

  const domName = eventName.replace(/[A-Z]/g, (match) => match.toLowerCase());
  let normalized = customElement &&
    !DOM_EVENT_NAMES.has(domName) &&
    !DOM_EVENT_ALIASES.has(domName)
    ? toKebabEventName(eventName)
    : domName;
  const alias = DOM_EVENT_ALIASES.get(normalized);
  if (alias) {
    normalized = alias.name;
    capture ||= alias.capture === true;
  }

  return { name: normalized, capture };
}

export function toStandardJsxEventPropName(eventName) {
  if (
    typeof eventName !== "string" ||
    !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(eventName) ||
    eventName.endsWith("-capture")
  ) {
    return null;
  }
  return `on${eventName
    .split("-")
    .map((part) => part[0].toUpperCase() + part.slice(1))
    .join("")}`;
}
