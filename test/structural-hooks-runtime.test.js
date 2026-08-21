import assert from "node:assert/strict";
import { describe, it } from "vitest";
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
      use(host, fallback) {
        return host.locale ?? fallback;
      },
    });

    assert.equal(readStructuralHook({ locale: "es" }, useLocale, ["en"]), "es");
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
    const useFirst = defineHook({ mixin: firstMixin, use: (host) => host });
    const useSecond = defineHook({ mixin: secondMixin, use: (host) => host });
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
      use: (host) => host,
    });
    const useSecond = defineHook({
      mixin: capabilityMixin,
      use: (host) => host,
    });

    applyStructuralHooks(class {}, [useFirst, useFirst, useSecond]);
    assert.equal(applications, 1);
  });

  it("rejects the removed middleware structural contract", () => {
    assert.throws(
      () =>
        defineHook({
          middlewares: {},
          use: (host) => host,
        }),
      /unsupported structural fields: middlewares/,
    );
    assert.throws(
      () => defineHook({ setup() {}, use: (host) => host }),
      /unsupported structural fields: setup/,
    );
  });

  it("validates hook definitions and mixin results", () => {
    assert.throws(() => defineHook({}), /use\(host, \.\.\.args\)/);
    assert.throws(
      () => defineHook({ mixin: {}, use: (host) => host }),
      /mixin must be a function/,
    );
    const useBroken = defineHook({
      mixin: () => null,
      use: (host) => host,
    });
    assert.throws(
      () => applyStructuralHooks(class {}, [useBroken]),
      /must return a class/,
    );
  });
});
