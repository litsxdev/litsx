import assert from "node:assert/strict";
import { describe, it } from "vitest";
import {
  getCurrentExecutionContextInternal,
  getCurrentSsrCustomElementInstanceStack,
  getCurrentSsrRuntimeState,
  withCurrentSsrRuntimeState,
} from "../packages/core/src/runtime-ssr-state.js";

const ACCESS = Symbol.for("litsx.ssr.runtimeStateAccess");
const STACK = Symbol.for("litsx.ssr.runtimeStateStack");

describe("SSR runtime state branch behavior", () => {
  it("rejects incomplete async-context adapters and uses the fallback stack", async () => {
    const oldAccess = globalThis[ACCESS];
    const oldStack = globalThis[STACK];
    try {
      globalThis[ACCESS] = { getStore() {} };
      globalThis[STACK] = [];
      assert.equal(getCurrentSsrRuntimeState(), null);
      const state = { customElementInstanceStack: ["element"], executionContext: { id: 1 } };
      const result = await withCurrentSsrRuntimeState(state, async () => {
        assert.equal(getCurrentSsrRuntimeState(), state);
        assert.deepEqual(getCurrentSsrCustomElementInstanceStack(), ["element"]);
        assert.deepEqual(getCurrentExecutionContextInternal(), { id: 1 });
        return "done";
      });
      assert.equal(result, "done");
      assert.equal(getCurrentSsrRuntimeState(), null);

      await assert.rejects(
        withCurrentSsrRuntimeState(undefined, async () => { throw new Error("failure"); }),
        /failure/,
      );
      assert.equal(globalThis[STACK].length, 0);
    } finally {
      globalThis[ACCESS] = oldAccess;
      globalThis[STACK] = oldStack;
    }
  });

  it("delegates to a complete async-context adapter and normalizes empty stores", async () => {
    const oldAccess = globalThis[ACCESS];
    try {
      const calls = [];
      globalThis[ACCESS] = {
        getStore: () => undefined,
        run: async (state, callback) => { calls.push(state); return callback(); },
      };
      assert.equal(getCurrentSsrRuntimeState(), null);
      assert.equal(await withCurrentSsrRuntimeState(undefined, () => "adapter"), "adapter");
      assert.deepEqual(calls, [null]);
      assert.equal(getCurrentSsrCustomElementInstanceStack(), null);
      assert.equal(getCurrentExecutionContextInternal(), null);
    } finally {
      globalThis[ACCESS] = oldAccess;
    }
  });
});
