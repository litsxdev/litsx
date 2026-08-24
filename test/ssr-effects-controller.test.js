import assert from "assert";
import { describe, it } from "vitest";
import {
  LITSX_SSR_CONTEXT,
} from "../packages/core/src/elements/index.js";
import {
  useState as runtimeUseState,
  useRef as runtimeUseRef,
  useId as runtimeUseId,
  useExternalStore as runtimeUseExternalStore,
  useExpose as runtimeUseExpose,
} from "../packages/core/src/state-hooks.js";
import {
  useMemoValue as runtimeUseMemoValue,
  useOnConnect as runtimeUseOnConnect,
} from "../packages/core/src/effect-hooks.js";
import { getController } from "../packages/core/src/runtime-controller.js";
import {
  prepareEffects,
  runWithHookHost,
} from "../packages/core/src/runtime-controller.js";
import { SsrEffectsController } from "../packages/core/src/ssr-effects-controller.js";

const withSsrHost = (hook) => (host, ...args) =>
  runWithHookHost(host, () => hook(...args));
const useState = withSsrHost(runtimeUseState);
const useRef = withSsrHost(runtimeUseRef);
const useId = withSsrHost(runtimeUseId);
const useExternalStore = withSsrHost(runtimeUseExternalStore);
const useExpose = withSsrHost(runtimeUseExpose);
const useMemoValue = withSsrHost(runtimeUseMemoValue);
const useOnConnect = withSsrHost(runtimeUseOnConnect);

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
  it("uses fallback ids and optional callbacks without an SSR context", () => {
    const controller = new SsrEffectsController({}, null);
    assert.strictEqual(controller.resolveId(), "litsx-0-0");
    assert.strictEqual(controller.resolveExternalStore(null, () => "client"), "client");
    assert.strictEqual(controller.resolveTransition()[1](), undefined);
    assert.strictEqual(controller.startTransition(), undefined);
    const [state, setState] = controller.resolveReducer((value) => value, 3);
    assert.strictEqual(state, 3);
    assert.strictEqual(setState(9), 3);
  });

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
    assert.deepStrictEqual(ref, { value: "ready" });
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

  it("keeps both useExpose signatures inert and ordered across SSR passes", () => {
    const host = createSsrHost("9");
    const forwardedRef = { current: "consumer-value" };
    let factoryCalls = 0;

    const renderPass = () => {
      prepareEffects(host);
      useExpose(host, () => {
        factoryCalls += 1;
        return { focus() {} };
      }, []);
      useExpose(host, forwardedRef, () => {
        factoryCalls += 1;
        return { focus() {} };
      }, []);
    };

    renderPass();
    const controller = getController(host);
    assert.strictEqual(controller.exposeCursor, 1);
    assert.strictEqual(controller.exposeRefCursor, 1);
    assert.strictEqual(factoryCalls, 0);
    assert.strictEqual(forwardedRef.current, "consumer-value");
    assert.strictEqual(Object.prototype.hasOwnProperty.call(host, "focus"), false);

    renderPass();
    assert.strictEqual(controller.exposeCursor, 1);
    assert.strictEqual(controller.exposeRefCursor, 1);
    assert.strictEqual(factoryCalls, 0);
    assert.strictEqual(forwardedRef.current, "consumer-value");
  });
});
