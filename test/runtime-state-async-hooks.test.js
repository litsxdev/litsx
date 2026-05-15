import assert from "assert";
import { describe, it } from "vitest";
import { prepareEffects } from "../packages/core/src/runtime-controller.js";
import {
  useAsyncStateImpl,
  useOptimisticImpl,
} from "../packages/core/src/state-async-hooks.js";

class TestHost {
  constructor() {
    this.controllers = [];
    this.updates = 0;
  }

  addController(controller) {
    this.controllers.push(controller);
  }

  requestUpdate() {
    this.updates += 1;
  }
}

function createHookHarness() {
  const stateSlots = [];
  const refSlots = [];
  let stateIndex = 0;
  let refIndex = 0;

  return {
    stateSlots,
    refSlots,
    resetIndices() {
      stateIndex = 0;
      refIndex = 0;
    },
    useState(_host, initialState) {
      const slotIndex = stateIndex++;
      if (!stateSlots[slotIndex]) {
        stateSlots[slotIndex] = { value: initialState };
      }
      const slot = stateSlots[slotIndex];
      return [
        slot.value,
        (nextValue) => {
          slot.value =
            typeof nextValue === "function"
              ? nextValue(slot.value)
              : nextValue;
        },
      ];
    },
    useRef(_host, initialValue) {
      const slotIndex = refIndex++;
      if (!refSlots[slotIndex]) {
        refSlots[slotIndex] = { current: initialValue };
      }
      return refSlots[slotIndex];
    },
    useTransition(_host) {
      return [false, (callback) => callback()];
    },
  };
}

describe("runtime async hook internals", () => {
  it("rejects invalid async actions and only commits the latest completed run", async () => {
    const host = new TestHost();
    const invalidHarness = createHookHarness();

    invalidHarness.resetIndices();
    prepareEffects(host);
    assert.throws(
      () =>
        useAsyncStateImpl(
          host,
          0,
          null,
          invalidHarness.useState,
          invalidHarness.useTransition,
          invalidHarness.useRef
        ),
      /action function/
    );

    const harness = createHookHarness();
    const pendingRuns = [];

    harness.resetIndices();
    prepareEffects(host);
    const [initialState, run, controls] = useAsyncStateImpl(
      host,
      0,
      (_currentState, label) =>
        new Promise((resolve) => {
          pendingRuns.push({ label, resolve });
        }),
      harness.useState,
      harness.useTransition,
      harness.useRef
    );

    assert.strictEqual(initialState, 0);

    const firstRun = run("first");
    const secondRun = run("second");

    pendingRuns[0].resolve(1);
    assert.strictEqual(await firstRun, 1);
    assert.strictEqual(harness.stateSlots[0].value, 0);

    pendingRuns[1].resolve(2);
    assert.strictEqual(await secondRun, 2);
    assert.strictEqual(harness.stateSlots[0].value, 2);
    assert.strictEqual(harness.stateSlots[1].value, null);

    controls.reset();
    assert.strictEqual(harness.stateSlots[0].value, 0);
    assert.strictEqual(harness.stateSlots[1].value, null);
  });

  it("stores synchronous action failures and supports optimistic fallback reducers", async () => {
    const host = new TestHost();
    const asyncHarness = createHookHarness();

    asyncHarness.resetIndices();
    prepareEffects(host);
    const [, run] = useAsyncStateImpl(
      host,
      0,
      () => {
        throw new Error("boom");
      },
      asyncHarness.useState,
      asyncHarness.useTransition,
      asyncHarness.useRef
    );

    await assert.rejects(run(), /boom/);
    assert.match(asyncHarness.stateSlots[1].value.message, /boom/);

    const optimisticHarness = createHookHarness();

    optimisticHarness.resetIndices();
    prepareEffects(host);
    let [optimisticState, addOptimistic, resetOptimistic] = useOptimisticImpl(
      host,
      1,
      null,
      optimisticHarness.useRef,
      optimisticHarness.useState
    );

    assert.strictEqual(optimisticState, 1);
    addOptimistic(5);

    optimisticHarness.resetIndices();
    prepareEffects(host);
    [optimisticState, addOptimistic, resetOptimistic] = useOptimisticImpl(
      host,
      1,
      null,
      optimisticHarness.useRef,
      optimisticHarness.useState
    );

    assert.strictEqual(optimisticState, 5);
    resetOptimistic();

    optimisticHarness.resetIndices();
    prepareEffects(host);
    [optimisticState, , resetOptimistic] = useOptimisticImpl(
      host,
      1,
      null,
      optimisticHarness.useRef,
      optimisticHarness.useState
    );

    assert.strictEqual(optimisticState, 1);
    const forceRenderVersion = optimisticHarness.stateSlots[0].value;
    resetOptimistic();
    assert.strictEqual(optimisticHarness.stateSlots[0].value, forceRenderVersion);
  });
});
