import assert from "node:assert/strict";
import { describe, it } from "vitest";
import { useHost } from "../packages/core/src/index.js";
import { runWithHookHost } from "../packages/core/src/runtime-controller.js";
import {
  STRUCTURAL_HOOKS,
  applyStructuralHooks,
  defineHook,
  isStructuralHook,
  readStructuralHook,
} from "../packages/core/src/structural-hooks-runtime.js";

describe("structural hook mixins", () => {
  it("reads a host capability through a structural hook", () => {
    const useLocale = defineHook({
      use(fallback) {
        const host = useHost();
        return host.locale ?? fallback;
      },
    });

    assert.equal(
      runWithHookHost({ locale: "es" }, () =>
        readStructuralHook(useLocale, ["en"]),
      ),
      "es",
    );
    assert.equal(isStructuralHook(useLocale), true);
    assert.deepEqual(useLocale[STRUCTURAL_HOOKS], [useLocale]);
  });

  it("applies distinct mixins in first-use order", () => {
    const calls = [];
    const firstMixin = (Base) =>
      class extends Base {
        connectedCallback() {
          calls.push("first");
          return super.connectedCallback?.();
        }
      };
    const secondMixin = (Base) =>
      class extends Base {
        connectedCallback() {
          calls.push("second");
          return super.connectedCallback?.();
        }
      };
    const useFirst = defineHook({ mixin: firstMixin, use: () => useHost() });
    const useSecond = defineHook({ mixin: secondMixin, use: () => useHost() });
    class Base {
      connectedCallback() {
        calls.push("base");
      }
    }

    const Host = applyStructuralHooks(Base, [useFirst, useSecond]);
    new Host().connectedCallback();

    assert.deepEqual(calls, ["first", "second", "base"]);
  });

  it("deduplicates a shared mixin across hooks and repeated calls", () => {
    let applications = 0;
    const capabilityMixin = (Base) => {
      applications += 1;
      return class extends Base {};
    };
    const useFirst = defineHook({
      mixin: capabilityMixin,
      use: () => useHost(),
    });
    const useSecond = defineHook({
      mixin: capabilityMixin,
      use: () => useHost(),
    });

    applyStructuralHooks(class {}, [useFirst, useFirst, useSecond]);
    assert.equal(applications, 1);
  });

  it("supports installation-only mixin hooks without exposing the host", () => {
    const firstMixin = (Base) => class extends Base { first = true; };
    const secondMixin = (Base) => class extends Base { second = true; };
    const useFirst = defineHook({ mixin: firstMixin });
    const useSecond = defineHook({ mixin: secondMixin });

    const Host = applyStructuralHooks(class {}, [
      useFirst,
      useSecond,
      useFirst,
    ]);
    const host = new Host();

    assert.equal(host.first, true);
    assert.equal(host.second, true);
    assert.equal(
      runWithHookHost(host, () => readStructuralHook(useFirst, [])),
      undefined,
    );
    assert.equal(
      runWithHookHost(host, () => readStructuralHook(useSecond, [])),
      undefined,
    );
    assert.throws(
      () => readStructuralHook(useFirst, ["unexpected"]),
      /does not accept arguments/,
    );
  });

  it("rejects the removed middleware structural contract", () => {
    assert.throws(
      () =>
        defineHook({
          middlewares: {},
          use: () => useHost(),
        }),
      /unsupported structural fields: middlewares/,
    );
    assert.throws(
      () => defineHook({ setup() {}, use: () => useHost() }),
      /unsupported structural fields: setup/,
    );
  });

  it("validates hook definitions and mixin results", () => {
    assert.throws(() => defineHook({}), /requires a mixin, a use\(\.\.\.args\) reader, or both/);
    assert.throws(
      () => defineHook({ mixin: class {}, use: true }),
      /use must be a function/,
    );
    assert.throws(
      () => defineHook({ mixin: {}, use: () => useHost() }),
      /mixin must be a function/,
    );
    const useBroken = defineHook({
      mixin: () => null,
      use: () => useHost(),
    });
    assert.throws(
      () => applyStructuralHooks(class {}, [useBroken]),
      /must return a class/,
    );
  });
});
