import assert from "assert";
import PropTypes from "../packages/prop-types/src/index.js";
import {
  arrayOf,
  exact,
  instanceOf,
  objectOf,
  oneOf,
  oneOfType,
  required,
  shape,
} from "../packages/prop-types/src/runtime.js";

function toPlain(descriptor) {
  return { ...descriptor };
}

describe("prop-types drop-in", () => {
  it("exposes primitive descriptors", () => {
    assert.deepStrictEqual(toPlain(PropTypes.string), { type: String });
    assert.deepStrictEqual(toPlain(PropTypes.number), { type: Number });
    assert.deepStrictEqual(toPlain(PropTypes.bool), { type: Boolean });
  });

  it("produces independent descriptors when chaining", () => {
    const withAttribute = PropTypes.string.attribute("data-label");

    assert.deepStrictEqual(toPlain(PropTypes.string), { type: String });
    assert.deepStrictEqual(toPlain(withAttribute), {
      type: String,
      attribute: "data-label",
    });
  });

  it("marks properties as required", () => {
    const required = PropTypes.string.isRequired;
    assert.deepStrictEqual(toPlain(required), {
      type: String,
      required: true,
    });

    const optional = required.optional();
    assert.deepStrictEqual(toPlain(optional), { type: String });
  });

  it("supports LitElement property options", () => {
    const hasChanged = () => true;
    const converter = {
      toAttribute: (value) => value,
      fromAttribute: (value) => value,
    };

    const descriptor = PropTypes.number
      .attribute("my-count")
      .reflect()
      .state(false)
      .noAccessor()
      .hasChanged(hasChanged)
      .converter(converter)
      .withOptions({ attribute: "custom-count" });

    assert.deepStrictEqual(toPlain(descriptor), {
      type: Number,
      attribute: "custom-count",
      reflect: true,
      state: false,
      noAccessor: true,
      hasChanged,
      converter,
    });
  });

  it("combines withConverter configuration", () => {
    const converter = {
      toAttribute: (value) => String(value),
      fromAttribute: (value) => Number(value),
    };

    const descriptor = PropTypes.string
      .attribute("counter")
      .withConverter(PropTypes.number, {
        converter,
        reflect: true,
      });

    assert.deepStrictEqual(toPlain(descriptor), {
      type: Number,
      attribute: "counter",
      converter,
      reflect: true,
    });
  });

  it("provides helper factories", () => {
    const arrayOfStrings = PropTypes.arrayOf(PropTypes.string);
    assert.deepStrictEqual(toPlain(arrayOfStrings), {
      type: Array,
      value: { type: String },
    });

    const shaped = PropTypes.shape({ label: PropTypes.string });
    assert.deepStrictEqual(toPlain(shaped), {
      type: Object,
      shape: { label: PropTypes.string },
    });

    const union = PropTypes.oneOf(["primary", "secondary"]);
    assert.strictEqual(union.type, String);
    assert.deepStrictEqual(union.values, ["primary", "secondary"]);
    assert.strictEqual(typeof union.hasChanged, "function");
    assert.throws(() => union.hasChanged("tertiary", "primary"), /Invalid value/);
    assert.strictEqual(union.hasChanged("primary", "secondary"), true);
    assert.strictEqual(union.hasChanged("primary", "primary"), false);
  });

  it("wraps custom hasChanged for oneOf", () => {
    let called = false;
    const descriptor = PropTypes.oneOf(["on", "off"]).hasChanged(function next(value, oldValue) {
      called = true;
      return value !== oldValue;
    });

    assert.throws(() => descriptor.hasChanged("idle", "on"), /Invalid value/);
    assert.strictEqual(called, false);

    const result = descriptor.hasChanged("on", "off");
    assert.strictEqual(result, true);
    assert.strictEqual(called, true);
  });

  it("supports oneOf without custom hasChanged", () => {
    const descriptor = PropTypes.oneOf(["online", "offline"]);
    assert.strictEqual(descriptor.type, String);
    assert.deepStrictEqual(descriptor.values, ["online", "offline"]);
    assert.strictEqual(typeof descriptor.hasChanged, "function");
    assert.strictEqual(descriptor.hasChanged("online", "offline"), true);
    assert.strictEqual(descriptor.hasChanged("online", "online"), false);
    assert.throws(() => descriptor.hasChanged("idle", "online"), /Invalid value/);
  });

  it("allows custom hasChanged without oneOf", () => {
    let called = false;
    const descriptor = PropTypes.string.hasChanged(function next(value, oldValue) {
      called = true;
      return value.trim() !== oldValue.trim();
    });

    assert.strictEqual(descriptor.type, String);
    assert.strictEqual(descriptor.hasChanged(" foo ", "foo"), false);
    assert.strictEqual(called, true);
  });

  it("preserves oneOf validation after cloning operations", () => {
    const descriptor = PropTypes.oneOf(["small", "large"]).attribute("size");

    assert.strictEqual(descriptor.type, String);
    assert.strictEqual(descriptor.attribute, "size");
    assert.throws(() => descriptor.hasChanged("huge", "small"), /Invalid value "huge"/);
    assert.strictEqual(descriptor.hasChanged("large", "small"), true);
  });

  it("rewraps validation when replacing hasChanged", () => {
    let firstCalled = false;
    let secondCalled = false;

    const descriptor = PropTypes.oneOf(["draft", "published"])
      .hasChanged(function first(value, oldValue) {
        firstCalled = true;
        return value !== oldValue;
      })
      .hasChanged(function second(value, oldValue) {
        secondCalled = true;
        return value.charCodeAt(0) !== oldValue.charCodeAt(0);
      });

    assert.throws(() => descriptor.hasChanged("archived", "draft"), /Invalid value/);
    assert.strictEqual(firstCalled, false);
    assert.strictEqual(secondCalled, false);

    const result = descriptor.hasChanged("published", "draft");
    assert.strictEqual(result, true);
    assert.strictEqual(firstCalled, false);
    assert.strictEqual(secondCalled, true);
  });

  it("supports top-level helpers", () => {
    const converter = { fromAttribute: () => {} };
    const descriptor = PropTypes.withConverter(PropTypes.bool, { converter });
    assert.deepStrictEqual(toPlain(descriptor), {
      type: Boolean,
      converter,
    });

    const custom = PropTypes.extend({ type: Number, attribute: false });
    assert.deepStrictEqual(toPlain(custom), { type: Number, attribute: false });
  });

  it("infers oneOf types for mixed values", () => {
    const numeric = PropTypes.oneOf([1, 2, 3]);
    const boolean = PropTypes.oneOf([true, false]);
    const mixed = PropTypes.oneOf(["a", 1, {}]);

    assert.strictEqual(numeric.type, Number);
    assert.strictEqual(boolean.type, Boolean);
    assert.strictEqual(mixed.type, Object);
  });

  it("supports shorthand configurations in helpers", () => {
    const arrayOfStrings = PropTypes.arrayOf("string");
    assert.deepStrictEqual(arrayOfStrings.value, { type: String });

    const oneOfType = PropTypes.oneOfType([PropTypes.string, "number"]);
    assert.strictEqual(oneOfType.types[0], PropTypes.string);
    assert.deepStrictEqual(oneOfType.types[1], { type: Number });
  });

  it("enforces converter and hasChanged inputs", () => {
    assert.throws(() => PropTypes.string.converter(null), /converter expects a value/);
    assert.throws(() => PropTypes.string.hasChanged("nope"), /hasChanged expects a function/);
    assert.throws(
      () => PropTypes.string.withConverter({}, {}),
      /withConverter expects a prop type/
    );
  });

  it("retains oneOf guards when cloning with options", () => {
    const base = PropTypes.oneOf(["draft", "published"]).hasChanged(() => true);
    const cloned = base.withOptions({ reflect: true });

    assert.strictEqual(cloned.reflect, true);
    assert.throws(() => cloned.hasChanged("archived", "draft"), /Invalid value/);
    assert.strictEqual(cloned.hasChanged("published", "draft"), true);
  });

  it("exposes runtime compat helpers for translated React propTypes", () => {
    const status = oneOf(["idle", "busy"]);
    assert.strictEqual(typeof status.hasChanged, "function");
    assert.strictEqual(typeof status.converter.fromAttribute, "function");
    assert.throws(() => status.hasChanged("error", "idle"), /Expected one of/);
    assert.strictEqual(status.hasChanged("busy", "idle"), true);

    const list = arrayOf(String);
    assert.strictEqual(list.hasChanged(["a"], ["b"]), true);
    assert.throws(() => list.hasChanged([1], []), /Expected String/);

    const meta = shape({
      title: required(String),
      count: Number,
    });
    assert.strictEqual(meta.attribute, false);
    assert.strictEqual(meta.hasChanged({ title: "ready", count: 1 }, null), true);
    assert.throws(() => meta.hasChanged({ count: 1 }, null), /required value/);

    const strict = exact({
      title: String,
    });
    assert.throws(() => strict.hasChanged({ title: "ok", extra: true }, null), /Unexpected key/);

    const mixed = oneOfType([String, Number]);
    assert.strictEqual(mixed.hasChanged("ready", null), true);
    assert.throws(() => mixed.hasChanged(true, null), /does not match any allowed type/);

    const dictionary = objectOf(Number);
    assert.throws(() => dictionary.hasChanged({ score: "bad" }, null), /Expected Number/);

    const byCtor = instanceOf(Date);
    assert.strictEqual(byCtor.attribute, false);
    assert.strictEqual(byCtor.hasChanged(new Date(), null), true);
    assert.throws(() => byCtor.hasChanged({}, null), /Expected instance of Date/);

    const topLevelRequired = required();
    assert.throws(() => topLevelRequired.hasChanged(undefined, null), /required value/);
  });

});
