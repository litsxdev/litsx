import assert from "assert";
import { afterEach, describe, it } from "vitest";
import { assignRef, cleanupRef } from "../packages/core/src/runtime-refs.js";
import {
  Priority,
  PriorityScheduler,
} from "../packages/core/src/runtime-priority-scheduler.js";
import {
  createTransitionState,
  resetTransitionState,
} from "../packages/core/src/runtime-transition-state.js";
import {
  getController,
  prepareEffects,
  resolveRuntimeHost,
} from "../packages/core/src/runtime-controller.js";

class TestHost {
  constructor() {
    this.controllers = [];
    this.updates = 0;
    this.reportedErrors = [];
  }

  addController(controller) {
    this.controllers.push(controller);
  }

  requestUpdate() {
    this.updates += 1;
  }

  reportError(error) {
    this.reportedErrors.push(error.message);
  }
}

const originalQueueMicrotask = globalThis.queueMicrotask;

afterEach(() => {
  globalThis.queueMicrotask = originalQueueMicrotask;
});

describe("runtime utility internals", () => {
  it("assigns and cleans up function and object refs while ignoring unsupported targets", () => {
    const calls = [];
    const functionRef = (value) => {
      calls.push(value);
    };
    const objectRef = { current: "initial" };

    assignRef(null, "ignored");
    assignRef("not-a-ref", "ignored");
    assignRef(functionRef, "value");
    assignRef(objectRef, "value");
    cleanupRef(functionRef);
    cleanupRef(objectRef);

    assert.deepStrictEqual(calls, ["value", null]);
    assert.strictEqual(objectRef.current, null);
  });

  it("flushes scheduled work by priority and clears queues defensively", () => {
    const scheduled = [];
    globalThis.queueMicrotask = (callback) => {
      scheduled.push(callback);
    };

    const host = new TestHost();
    const scheduler = new PriorityScheduler(host);
    const order = [];

    scheduler.enqueue({
      priority: Priority.IDLE,
      flush() {
        order.push("idle");
      },
    });
    scheduler.enqueue({
      priority: Priority.IMMEDIATE,
      flush() {
        order.push("immediate");
      },
    });
    scheduler.enqueue({
      priority: Priority.TRANSITION,
      flush() {
        order.push("transition");
      },
    });

    assert.strictEqual(scheduled.length, 1);
    scheduled[0]();
    assert.deepStrictEqual(order, ["immediate", "transition", "idle"]);

    scheduler.flush();
    scheduler.clear();
    assert.strictEqual(scheduler.flushScheduled, false);
    assert.ok(
      Object.values(scheduler.queues).every((bucket) => bucket.length === 0)
    );
  });

  it("reports scheduler task errors through the host before rethrowing", () => {
    globalThis.queueMicrotask = (callback) => {
      callback();
    };

    const host = new TestHost();
    const scheduler = new PriorityScheduler(host);

    assert.throws(() => {
      scheduler.enqueue({
        priority: Priority.IMMEDIATE,
        flush() {
          throw new Error("boom");
        },
      });
    }, /boom/);

    assert.deepStrictEqual(host.reportedErrors, ["boom"]);
  });

  it("resolves controller hosts from explicit arguments and the prepared render context", () => {
    const host = new TestHost();

    assert.strictEqual(resolveRuntimeHost(host), host);
    assert.strictEqual(resolveRuntimeHost(null), null);
    assert.throws(() => getController(null), /ReactiveControllerHost/);
    assert.throws(() => prepareEffects(null), /prepareEffects\(\)/);

    prepareEffects(host);

    const directController = getController(host);
    const contextualController = getController(null);

    assert.strictEqual(resolveRuntimeHost(undefined), host);
    assert.strictEqual(directController, contextualController);
    assert.strictEqual(host.controllers.length, 1);
  });

  it("tracks sync and async transition lifecycles and resets pending state safely", async () => {
    const host = new TestHost();
    const controller = { host };
    const state = createTransitionState(controller);

    assert.throws(() => state.startTransition(null), /expects a function/);

    const syncResult = state.startTransition(() => "done");
    assert.strictEqual(syncResult, "done");
    assert.strictEqual(state.isPending, true);
    assert.strictEqual(state.pendingCount, 1);
    assert.strictEqual(host.updates, 1);

    await Promise.resolve();
    assert.strictEqual(state.isPending, false);
    assert.strictEqual(state.pendingCount, 0);
    assert.strictEqual(host.updates, 2);

    let resolveTransition;
    const asyncResult = state.startTransition(
      () =>
        new Promise((resolve) => {
          resolveTransition = resolve;
        })
    );
    assert.strictEqual(state.isPending, true);
    resolveTransition("later");
    assert.strictEqual(await asyncResult, "later");
    assert.strictEqual(state.isPending, false);

    resetTransitionState({ isPending: true, pendingCount: 2 });
    state.pendingTokens.add(999);
    state.isPending = true;
    state.pendingCount = 1;
    resetTransitionState(state);
    assert.strictEqual(state.isPending, false);
    assert.strictEqual(state.pendingCount, 0);
    assert.strictEqual(state.pendingTokens.size, 0);
  });
});
