import assert from "assert";
import { describe, it } from "vitest";
import {
  createReactRef,
  toLitRef,
  useReactRef,
} from "../packages/core/src/react-compat.js";
import {
  prepareEffects,
  runWithHookHost,
} from "../packages/core/src/internal.js";

class TestHost {
  constructor() {
    this.controllers = [];
  }
  addController(controller) {
    this.controllers.push(controller);
  }
  requestUpdate() {}
}

describe("React-compatible Lit refs", () => {
  it("exposes current while Lit writes value", () => {
    const ref = createReactRef();
    const node = { tagName: "INPUT" };

    assert.strictEqual(ref.current, null);
    assert.strictEqual(ref.value, undefined);
    ref.value = node;
    assert.strictEqual(ref.current, node);
    ref.value = undefined;
    assert.strictEqual(ref.current, null);
  });

  it("keeps the React ref facade stable across hook renders", () => {
    const host = new TestHost();
    prepareEffects(host);
    const first = runWithHookHost(host, () => useReactRef(null));
    first.current = "changed";

    prepareEffects(host);
    const second = runWithHookHost(host, () => useReactRef("ignored"));

    assert.strictEqual(first, second);
    assert.strictEqual(second.current, "changed");
    assert.strictEqual(second.value, "changed");
  });

  it("adapts callbacks and external object refs with stable identities", () => {
    const calls = [];
    const callback = (value) => calls.push(value);
    const adaptedCallback = toLitRef(callback);
    const objectRef = { current: null };
    const adaptedObject = toLitRef(objectRef);
    const node = { tagName: "BUTTON" };

    assert.strictEqual(toLitRef(callback), adaptedCallback);
    assert.strictEqual(toLitRef(adaptedCallback), adaptedCallback);
    assert.strictEqual(toLitRef(objectRef), adaptedObject);
    adaptedCallback(node);
    adaptedCallback(undefined);
    adaptedObject.value = node;
    assert.strictEqual(objectRef.current, node);
    adaptedObject.value = undefined;

    assert.deepStrictEqual(calls, [node, null]);
    assert.strictEqual(objectRef.current, null);
  });

  it("runs React 19 callback-ref cleanups instead of sending null", () => {
    const calls = [];
    const callback = (node) => {
      calls.push(node);
      return () => calls.push("cleanup");
    };
    const adapted = toLitRef(callback);

    adapted({ tagName: "INPUT" });
    adapted(undefined);

    assert.deepStrictEqual(calls.map((value) => value?.tagName ?? value), ["INPUT", "cleanup"]);
  });

  it("passes native Lit refs through unchanged and tolerates empty React refs", () => {
    const litRef = { value: undefined };
    assert.strictEqual(toLitRef(litRef), litRef);
    assert.strictEqual(typeof toLitRef(null), "function");
    assert.doesNotThrow(() => toLitRef(null)(undefined));
  });
});
