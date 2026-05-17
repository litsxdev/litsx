import assert from "assert";
import { describe, it } from "vitest";
import "../packages/core/src/ssr-runtime.js";
import {
  LITSX_SSR_CONTEXT,
} from "../packages/core/src/elements/index.js";
import { prepareEffects } from "../packages/core/src/effect-hooks.js";
import { useState, useRef, useId, useExternalStore } from "../packages/core/src/state-hooks.js";
import { useMemoValue, useOnConnect } from "../packages/core/src/effect-hooks.js";

function createSsrHost(instanceId = "0") {
  return {
    requestUpdateCalls: 0,
    requestUpdate() {
      this.requestUpdateCalls += 1;
    },
    [LITSX_SSR_CONTEXT]: {
      idPrefix: "ssr",
      currentInstanceId: instanceId,
    },
  };
}

describe("SsrEffectsController", () => {
  it("keeps state, refs, memo values, and ids SSR-safe", () => {
    const host = createSsrHost("7");

    prepareEffects(host);
    const [count, setCount] = useState(host, 1);
    const ref = useRef(host, "ready");
    const memo = useMemoValue(host, () => count * 2, [count]);
    const firstId = useId(host);
    const secondId = useId(host);

    assert.strictEqual(count, 1);
    assert.strictEqual(setCount(2), 1);
    assert.strictEqual(host.requestUpdateCalls, 0);
    assert.deepStrictEqual(ref, { current: "ready" });
    assert.strictEqual(memo, 2);
    assert.strictEqual(firstId, "ssr-7-0");
    assert.strictEqual(secondId, "ssr-7-1");

    prepareEffects(host);
    const sameRef = useRef(host, "other");
    const sameFirstId = useId(host);
    assert.strictEqual(sameRef, ref);
    assert.strictEqual(sameFirstId, "ssr-7-0");
  });

  it("prefers server snapshots and keeps lifecycle hooks as no-ops", () => {
    const host = createSsrHost("3");
    let connectedCalls = 0;

    prepareEffects(host);
    useOnConnect(host, () => {
      connectedCalls += 1;
    }, []);

    const snapshot = useExternalStore(
      host,
      () => () => {
        throw new Error("unsubscribe should not run during SSR");
      },
      () => "client",
      () => "server",
    );

    assert.strictEqual(snapshot, "server");
    assert.strictEqual(connectedCalls, 0);
  });
});
