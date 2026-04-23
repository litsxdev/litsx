// @vitest-environment happy-dom

import assert from "assert";
import { describe, it } from "vitest";
import { LitsxStaticHoistsMixin } from "../packages/litsx/src/runtime-infrastructure/index.js";

describe("LitsxStaticHoistsMixin", () => {
  it("dedupes repeated application of the same mixin", () => {
    class Base {}

    const Once = LitsxStaticHoistsMixin(Base);
    const Twice = LitsxStaticHoistsMixin(Once);

    assert.strictEqual(Twice, Once);
  });

  it("memoizes static hoist values per class without parent factories", () => {
    const cacheKey = Symbol("test.static.value");

    class Base {}

    class Child extends LitsxStaticHoistsMixin(Base) {
      static get value() {
        return this.__litsxStatic(cacheKey, () =>
          this.__litsxResolveStaticValue({
            ownValue: "child",
          })
        );
      }
    }

    const first = Child.value;
    const second = Child.value;

    assert.deepStrictEqual(first, { ownValue: "child" });
    assert.strictEqual(second, first);
  });

  it("merges plain-object property entries shallowly", () => {
    class Base {}
    class Child extends LitsxStaticHoistsMixin(Base) {}

    const merged = Child.__litsxMergeProperties(
      {
        active: { type: Boolean },
        title: { type: String },
      },
      {
        active: { reflect: true },
      }
    );

    assert.deepStrictEqual(merged, {
      active: { type: Boolean, reflect: true },
      title: { type: String },
    });
  });
});
