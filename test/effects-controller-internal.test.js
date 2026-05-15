import assert from "assert";
import { describe, it } from "vitest";
import { EffectsController } from "../packages/core/src/effects-controller.js";

class TestHost {
  constructor() {
    this.controllers = [];
    this.isConnected = true;
    this.updates = 0;
    this.reported = [];
  }

  addController(controller) {
    this.controllers.push(controller);
  }

  requestUpdate() {
    this.updates += 1;
  }

  reportError(error) {
    this.reported.push(error.message);
  }
}

describe("effects controller internals", () => {
  it("guards empty layout/passive queues and flushes suspense slots once", () => {
    const originalRAF = globalThis.requestAnimationFrame;
    const callbacks = [];
    globalThis.requestAnimationFrame = (callback) => {
      callbacks.push(callback);
      return 0;
    };

    try {
      const host = new TestHost();
      const controller = new EffectsController(host);
      const flushed = [];

      controller.runLayoutNow();
      controller.schedulePassive();

      controller.pendingSuspenseSlots.add({ flush(nextController) { flushed.push(nextController); } });
      controller.pendingSuspenseSlots.add({});
      controller.flushSuspenseQueues();
      controller.flushSuspenseQueues();

      assert.deepStrictEqual(flushed, [controller]);
      assert.strictEqual(controller.pendingSuspenseSlots.size, 0);

      controller.passiveQueue = [() => flushed.push("passive")];
      controller.schedulePassive();
      controller.schedulePassive();
      assert.strictEqual(callbacks.length, 1);

      controller.runQueue = (queue) => {
        flushed.push(queue.length);
      };
      callbacks[0]();

      assert.deepStrictEqual(flushed, [controller, 1]);
      assert.strictEqual(controller.passiveQueue, null);
      assert.strictEqual(controller.passiveScheduled, false);
    } finally {
      globalThis.requestAnimationFrame = originalRAF;
    }
  });

  it("registers imperative handles, pending transitions, and external store cleanup branches", () => {
    const host = new TestHost();
    const controller = new EffectsController(host);
    const registered = [];
    const ref = { current: null };

    controller.register = (callback, deps, layout) => {
      registered.push({ callback, deps, layout });
    };

    controller.registerImperative(ref, { focus: true }, ["dep"]);
    assert.strictEqual(controller.imperatives.length, 1);
    assert.strictEqual(controller.imperativeCursor, 1);
    assert.deepStrictEqual(registered[0].deps, ["dep"]);
    assert.strictEqual(registered[0].layout, true);

    const cleanup = registered[0].callback();
    assert.deepStrictEqual(ref.current, { focus: true });
    cleanup();
    assert.strictEqual(ref.current, null);

    controller.transitionState = { pendingCount: 0, isPending: true };
    controller.resolvePendingTransitions();
    assert.strictEqual(controller.transitionState.isPending, false);
    assert.strictEqual(controller.transitionState.pendingCount, 0);

    controller.transitionState = null;
    controller.resolvePendingTransitions();

    controller.externalStores = [
      { unsubscribe() {} },
      { unsubscribe() { host.reportError(new Error("unused")); } },
    ];
    controller.externalStoreCursor = 1;
    controller.prevExternalStoreCount = 2;
    controller.cleanupUnusedExternalStores();
    assert.strictEqual(controller.externalStores.length, 1);
    assert.strictEqual(controller.prevExternalStoreCount, 1);

    controller.cleanupUnusedExternalStores();
    assert.strictEqual(controller.prevExternalStoreCount, 1);
  });

  it("updates and reuses external store slots with and without server snapshots", () => {
    const host = new TestHost();
    host.isConnected = true;
    const controller = new EffectsController(host);
    const registered = [];
    let snapshot = "alpha";

    controller.register = (callback, deps, layout) => {
      registered.push({ callback, deps, layout });
    };

    const subscribe = () => () => {};
    const firstValue = controller.resolveExternalStore(
      subscribe,
      () => snapshot,
      "not-a-function"
    );
    assert.strictEqual(firstValue, "alpha");
    assert.strictEqual(controller.externalStores[0].getServerSnapshot, null);
    assert.deepStrictEqual(registered[0].deps, [subscribe, controller.externalStores[0].getSnapshot]);

    controller.prepare();
    host.isConnected = false;
    controller.hostIsConnected = false;
    snapshot = "beta";
    const nextSubscribe = () => () => {};
    const secondValue = controller.resolveExternalStore(
      nextSubscribe,
      () => snapshot,
      () => "server"
    );
    assert.strictEqual(secondValue, "server");
    assert.strictEqual(controller.externalStores[0].subscribe, nextSubscribe);
    assert.strictEqual(typeof controller.externalStores[0].getServerSnapshot, "function");
    assert.strictEqual(registered[1].deps.length, 3);
    assert.strictEqual(controller.externalStoreCursor, 1);
  });

  it("runs host lifecycle orchestration across connected and disconnected states", () => {
    const host = new TestHost();
    const controller = new EffectsController(host);
    const calls = [];

    controller.buildQueues = () => calls.push("build");
    controller.finalizeConnectedEffects = () => calls.push("finalize");
    controller.runLayoutNow = () => calls.push("layout");
    controller.schedulePassive = () => calls.push("passive");
    controller.runConnectedEffects = () => calls.push("connected");
    controller.cleanupUnusedExternalStores = () => calls.push("cleanupStores");
    controller.resolvePendingTransitions = () => calls.push("transitions");
    controller.flushSuspenseQueues = () => calls.push("suspense");
    controller.priorityQueue.flush = () => calls.push("priority");

    controller.hostIsConnected = false;
    controller.hostUpdated();
    assert.deepStrictEqual(calls, [
      "build",
      "finalize",
      "layout",
      "passive",
      "cleanupStores",
      "transitions",
      "suspense",
      "priority",
    ]);

    calls.length = 0;
    controller.hostConnected();
    assert.strictEqual(controller.hostIsConnected, true);
    assert.deepStrictEqual(calls, ["connected"]);

    calls.length = 0;
    controller.hostUpdate();
    assert.deepStrictEqual(calls, []);
  });
});
