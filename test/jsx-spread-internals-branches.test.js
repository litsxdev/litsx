import assert from "node:assert/strict";
import { describe, it } from "vitest";
import {
  adaptRefBindings,
  applyBinding,
  applyStyleBinding,
  assignRef,
  bindingPrefix,
  booleanAttributeValue,
  clearBinding,
  cssPropertyName,
  descriptorKey,
  eventOptions,
  getComponentProperties,
  getDeclaredComponentBinding,
  hasComponentProperty,
  inferDescriptor,
  normalizeName,
  resolveConstructor,
  routeComponentRestProps,
  serializedValue,
  shallowEqualRecords,
} from "../packages/core/src/jsx-spread.js";

const REST_PROPS = Symbol.for("litsx.restProps");

class FixtureElement {
  static finalized = 0;
  static elementProperties = new Map([
    ["active", { type: Boolean }],
    ["label", { attribute: "aria-label", type: String }],
    ["internal", { attribute: false }],
  ]);
  static [REST_PROPS] = { property: "rest" };
  static finalize() { this.finalized += 1; }
}

function fakeElement() {
  const attributes = new Map();
  const calls = [];
  const style = {
    removeProperty(name) { calls.push(["remove-style", name]); },
    setProperty(name, value, priority) { calls.push(["set-style", name, value, priority]); },
  };
  return {
    attributes,
    calls,
    style,
    innerHTML: "old",
    enabled: true,
    getAttribute(name) { return attributes.get(name) ?? null; },
    setAttribute(name, value) { attributes.set(name, value); calls.push(["set", name, value]); },
    removeAttribute(name) { attributes.delete(name); calls.push(["remove", name]); },
    toggleAttribute(name, value) { calls.push(["toggle", name, value]); },
    addEventListener(...args) { calls.push(["add-event", ...args]); },
    removeEventListener(...args) { calls.push(["remove-event", ...args]); },
  };
}

describe("jsx spread internal branch behavior", () => {
  it("normalizes explicit, inferred, native, and React-compatible names", () => {
    assert.deepEqual(normalizeName("className", true), { kind: "attribute", name: "class" });
    assert.deepEqual(normalizeName("htmlFor", true), { kind: "attribute", name: "for" });
    assert.deepEqual(normalizeName("htmlFor", false), { kind: "inferred", name: "htmlFor", propertyName: "htmlFor" });
    assert.deepEqual(normalizeName(".value", true), { kind: "property", name: "value" });
    assert.deepEqual(normalizeName("?hidden", true), { kind: "boolean", name: "hidden" });
    assert.deepEqual(normalizeName("@ready", true), { kind: "event", name: "ready" });
    assert.deepEqual(normalizeName("onclick", true), { kind: "property", name: "onclick" });
    assert.deepEqual(normalizeName("on:ready-event", false), { kind: "event", name: "ready-event" });
    assert.throws(() => normalizeName("on:BadEvent", false), /lowercase kebab-case/);
    assert.equal(normalizeName("onClick", true, true).kind, "event");
    assert.equal(normalizeName("onClick", false, true).kind, "custom-event-candidate");
    assert.equal(normalizeName("ref", true).kind, "inferred");
    assert.equal(normalizeName("dataValue", true).name, "datavalue");
  });

  it("resolves component metadata and declared bindings", () => {
    const instance = Object.create(FixtureElement.prototype);
    assert.equal(resolveConstructor("x-fixture", FixtureElement), FixtureElement);
    assert.equal(resolveConstructor("x-fixture", null, instance), FixtureElement);
    assert.equal(getComponentProperties("x-fixture", FixtureElement), FixtureElement.elementProperties);
    assert.equal(getComponentProperties("x-none", class {}), null);
    assert.equal(getDeclaredComponentBinding("x-fixture", "active", FixtureElement).kind, "property");
    assert.deepEqual(getDeclaredComponentBinding("x-fixture", "ARIA-LABEL", FixtureElement), {
      kind: "attribute", name: "aria-label", options: FixtureElement.elementProperties.get("label"), propertyName: "label",
    });
    assert.equal(getDeclaredComponentBinding("x-fixture", "internal", FixtureElement).kind, "property");
    assert.equal(getDeclaredComponentBinding("x-fixture", "missing", FixtureElement), null);
    instance.runtimeOnly = 1;
    assert.equal(hasComponentProperty("x-fixture", "runtimeOnly", FixtureElement, instance), true);
    assert.equal(hasComponentProperty("x-fixture", "active", FixtureElement), true);
    assert.equal(hasComponentProperty("x-fixture", "missing", FixtureElement), false);
  });

  it("routes host and rest properties across malformed and valid sources", () => {
    const original = [{ value: 1 }];
    assert.equal(routeComponentRestProps("x-none", original, class {}), original);
    const routed = routeComponentRestProps("x-fixture", [null, 1, {
      children: "skip", rest: "skip", "@ready": 1, ref: 2, "on:custom-event": 3,
      onclick: 4, active: true, id: "host", customValue: 5, ".extra": 6,
    }], FixtureElement);
    assert.equal(routed.length, 2);
    assert.deepEqual(routed[0], { "@ready": 1, ref: 2, "on:custom-event": 3, onclick: 4, active: true, id: "host" });
    assert.deepEqual(routed[1].rest, { customValue: 5, extra: 6 });

    const forwarded = routeComponentRestProps("x-fixture", [{ id: "rest-id" }], FixtureElement, null, true);
    assert.deepEqual(forwarded, [{ rest: { id: "rest-id" } }]);
    const empty = routeComponentRestProps("x-fixture", [{ key: 1 }], FixtureElement);
    assert.deepEqual(empty, [{ rest: {} }]);
  });

  it("compares records and infers all descriptor families", () => {
    assert.equal(shallowEqualRecords(null, null), true);
    assert.equal(shallowEqualRecords(null, {}), false);
    assert.equal(shallowEqualRecords({}, []), true);
    assert.equal(shallowEqualRecords({ a: 1 }, { a: 1, b: 2 }), false);
    assert.equal(shallowEqualRecords({ a: 1 }, { b: 1 }), false);
    assert.equal(shallowEqualRecords({ a: NaN }, { a: NaN }), true);

    const infer = (tag, name, value, component = null, namespace) => inferDescriptor(tag, name, value, component, null, namespace);
    assert.equal(infer("div", "bad name", 1), null);
    assert.equal(infer("x-box", "ref", {}).kind, "ref");
    assert.equal(infer("x-box", "dangerouslySetInnerHTML", {}).kind, "inner-html");
    assert.equal(infer("x-box", "style", {}).kind, "style");
    assert.equal(infer("x-box", "style", null).kind, "attribute");
    assert.equal(infer("x-box", "active", true, FixtureElement).kind, "property");
    assert.equal(infer("x-box", "aria-label", "x", FixtureElement).kind, "attribute");
    assert.equal(infer("input", "disabled", true).kind, "boolean");
    assert.equal(infer("input", "contentEditable", true).booleanValue, true);
    assert.equal(infer("div", "title", "x").kind, "attribute");
    assert.equal(infer("circle", "unknownFlag", true, null, "svg").booleanValue, true);
    assert.equal(infer("x-box", "runtime", 1, class { runtime = 0; }).kind, "attribute");
    assert.equal(infer("x-box", "unknown", false).kind, "boolean");
    assert.equal(infer("input", "value", "x").kind, "property");
    assert.equal(infer("x-box", "payload", {}).kind, "property");
    assert.equal(infer("x-box", "plain", "x").kind, "attribute");

    class WithOnClick { onClick() {} }
    assert.equal(inferDescriptor("x-box", "onClick", () => {}, WithOnClick, null, null, true).kind, "property");
    assert.equal(inferDescriptor("x-box", "onClick", () => {}, class {}, null, null, true).kind, "event");
  });

  it("adapts descriptors, refs, serialization, events, and CSS names", () => {
    assert.equal(descriptorKey({ kind: "style", name: "style" }), "style:style");
    assert.equal(descriptorKey({ kind: "attribute", name: "style" }), "style:style");
    assert.equal(descriptorKey({ kind: "event", name: "ready" }), "event:ready");
    assert.equal(bindingPrefix({ kind: "property", name: "value" }), ".value");
    assert.equal(bindingPrefix({ kind: "boolean", name: "hidden" }), "?hidden");
    assert.equal(bindingPrefix({ kind: "event", name: "ready" }), "@ready");
    assert.equal(bindingPrefix({ kind: "attribute", name: "title" }), "title");

    let called;
    assignRef((value) => { called = value; }, "node");
    assert.equal(called, "node");
    const objectRef = {};
    assignRef(objectRef, "node");
    assert.equal(objectRef.value, "node");
    assignRef(null, "ignored");

    const bindings = [
      { descriptor: { kind: "ref", name: "ref" }, value: 1 },
      { descriptor: { kind: "property", name: "ref" }, value: 2 },
      { descriptor: { kind: "attribute", name: "ref" }, value: 3 },
    ];
    assert.equal(adaptRefBindings(bindings, null), bindings);
    adaptRefBindings(bindings, (value) => value * 10);
    assert.deepEqual(bindings.map(({ value }) => value), [10, 20, 3]);

    assert.equal(serializedValue(null), null);
    assert.equal(serializedValue(false), null);
    assert.equal(serializedValue(true), "");
    assert.equal(serializedValue(12), "12");
    assert.equal(booleanAttributeValue(false), false);
    assert.equal(booleanAttributeValue(null), false);
    assert.equal(booleanAttributeValue(0), true);
    assert.deepEqual(eventOptions({ capture: true }, null), { capture: true, once: false, passive: false });
    assert.deepEqual(eventOptions({}, { capture: true, once: true, passive: true }), { capture: true, once: true, passive: true });
    assert.deepEqual(eventOptions({}, () => {}), { capture: false, once: false, passive: false });
    assert.equal(cssPropertyName("font-size"), "font-size");
    assert.equal(cssPropertyName("WebkitTransform"), "-webkit-transform");
    assert.equal(cssPropertyName("backgroundColor"), "background-color");
  });

  it("clears and applies each DOM binding kind", () => {
    clearBinding(null, { kind: "attribute", name: "x" }, {});
    const element = fakeElement();
    const listener = { capture: true };
    clearBinding(element, { kind: "event", name: "ready" }, { value: listener });
    let refValue = "initial";
    clearBinding(element, { kind: "ref", name: "ref" }, { value: (value) => { refValue = value; } });
    assert.equal(refValue, undefined);
    clearBinding(element, { kind: "style", name: "style" }, { styleNames: new Set(["color", "fontSize"]) });
    clearBinding(element, { kind: "style", name: "style" }, { value: { opacity: 1 } });
    clearBinding(element, { kind: "property", name: "enabled" }, { value: true });
    assert.equal(element.enabled, false);
    clearBinding(element, { kind: "property", name: "missing" }, { value: true });
    assert.equal(element.missing, undefined);
    clearBinding(element, { kind: "attribute", name: "title" }, {});
    clearBinding(element, { kind: "inner-html", name: "dangerouslySetInnerHTML" }, {});

    applyBinding(element, { kind: "attribute", name: "title" }, "ignored", null, true);
    applyBinding(element, { kind: "attribute", name: "title" }, null, null, false);
    applyBinding(element, { kind: "attribute", name: "count", booleanValue: true }, 2, null, false);
    applyBinding(element, { kind: "attribute", name: "count", booleanValue: true }, 2, null, false);
    applyBinding(element, { kind: "boolean", name: "hidden" }, true, null, true);
    applyBinding(element, { kind: "boolean", name: "hidden" }, true, null, false);
    applyBinding(element, { kind: "property", name: "value" }, 1, null, false);
    applyBinding(element, { kind: "property", name: "value" }, 1, null, false);

    const oldListener = () => {};
    const nextListener = () => {};
    applyBinding(element, { kind: "event", name: "ready" }, oldListener, { value: oldListener }, false);
    applyBinding(element, { kind: "event", name: "ready" }, nextListener, { value: oldListener }, false);
    applyBinding(element, { kind: "event", name: "ready" }, null, { value: nextListener }, false);
    const oldRef = {};
    const nextRef = {};
    applyBinding(element, { kind: "ref", name: "ref" }, oldRef, { value: oldRef }, false);
    applyBinding(element, { kind: "ref", name: "ref" }, nextRef, { value: oldRef }, false);
    assert.equal(oldRef.value, undefined);
    assert.equal(nextRef.value, element);

    const names = applyStyleBinding(element, {
      color: "red", fontSize: null, "--size": "2px", display: "block !important",
    }, { styleNames: new Set(["fontSize", "opacity"]) });
    assert.deepEqual([...names], ["color", "--size", "display"]);
    applyStyleBinding(element, null, { value: { color: "red" } });
    assert.equal(applyBinding(element, { kind: "style", name: "style" }, { color: "blue" }, null, false) instanceof Set, true);
    applyBinding(element, { kind: "inner-html", name: "dangerouslySetInnerHTML" }, null, null, false);
    applyBinding(element, { kind: "inner-html", name: "dangerouslySetInnerHTML" }, { __html: "<b>x</b>" }, null, false);
    applyBinding(element, { kind: "inner-html", name: "dangerouslySetInnerHTML" }, { __html: "<b>x</b>" }, null, false);
  });
});
