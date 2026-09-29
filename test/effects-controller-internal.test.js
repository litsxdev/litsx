import assert from "assert";
import { describe, it } from "vitest";
import {
  EffectsController,
  cleanupExposedRefSlot,
  cleanupExposedSlot,
  cleanupImperativeSlot,
  getExposedMethodRegistry,
  getExposeRefTarget,
  installExposedMethods,
  installExposedRefMethods,
  removeExposedMethod,
  removeExposedRefMethod,
  resolveLatestExposeImplementation,
} from "../packages/core/src/effects-controller.js";

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
  it("covers imperative and exposed-method defensive branches", () => {
    cleanupImperativeSlot(undefined);
    cleanupImperativeSlot({ assigned: false });
    const assigned = { assigned: true, ref: { value: "old" }, target: {} };
    cleanupImperativeSlot(assigned);
    assert.deepStrictEqual(assigned, { assigned: false, ref: { value: undefined }, target: null });

    assert.strictEqual(getExposedMethodRegistry(null), null);
    assert.strictEqual(getExposedMethodRegistry("host"), null);
    const host = {};
    const registry = getExposedMethodRegistry(host);
    assert.strictEqual(getExposedMethodRegistry(host), registry);
    assert.strictEqual(resolveLatestExposeImplementation(new Map()), null);
    const first = () => "first";
    const second = () => "second";
    assert.strictEqual(resolveLatestExposeImplementation(new Map([[2, second], [1, first]])), second);

    const slot = { methodNames: [] };
    assert.throws(() => installExposedMethods(host, 0, slot, null), /return an object/);
    assert.throws(() => installExposedMethods(host, 0, slot, { bad: 1 }), /non-function/);
    installExposedMethods("host", 0, slot, {});
    const occupied = { existing() {} };
    assert.throws(
      () => installExposedMethods(occupied, 0, slot, { existing() {} }),
      /already defines/
    );

    installExposedMethods(host, 0, slot, { ping: first, removed: first });
    const staleWrapper = host.removed;
    assert.strictEqual(host.ping(), "first");
    installExposedMethods(host, 1, { methodNames: [] }, { ping: second });
    assert.strictEqual(host.ping(), "second");
    removeExposedMethod(host, 99, "missing");
    removeExposedMethod(host, 1, "ping");
    assert.strictEqual(host.ping(), "first");
    installExposedMethods(host, 0, slot, { ping: first });
    assert.strictEqual("removed" in host, false);
    assert.strictEqual(staleWrapper(), undefined);
    cleanupExposedSlot(host, 0, slot);
    cleanupExposedSlot(host, 0, undefined);
    assert.strictEqual("ping" in host, false);
  });

  it("covers exposed-ref ownership, replacement, and cleanup branches", () => {
    const controller = new EffectsController(new TestHost());
    const ref = { value: null };
    const otherRef = { value: null };
    const slot = { ref: null, methodNames: [] };
    const first = function () { return `first:${this.marker}`; };
    const second = function () { return `second:${this.marker}`; };

    assert.strictEqual(getExposeRefTarget(controller, ref), getExposeRefTarget(controller, ref));
    assert.throws(
      () => installExposedRefMethods(controller, 0, slot, ref, undefined),
      /return an object/
    );
    assert.throws(
      () => installExposedRefMethods(controller, 0, slot, ref, { bad: false }),
      /non-function/
    );

    installExposedRefMethods(controller, 0, slot, ref, { ping: first, removed: first });
    const staleRefWrapper = ref.value.removed;
    ref.value.marker = "target";
    assert.strictEqual(ref.value.ping(), "first:target");
    installExposedRefMethods(controller, 1, { ref: null, methodNames: [] }, ref, { ping: second });
    assert.strictEqual(ref.value.ping(), "second:target");
    removeExposedRefMethod(controller, 99, {}, "missing");
    removeExposedRefMethod(controller, 1, { ref }, "ping");
    assert.strictEqual(ref.value.ping(), "first:target");

    installExposedRefMethods(controller, 0, slot, ref, { ping: first });
    assert.strictEqual("removed" in ref.value, false);
    assert.strictEqual(staleRefWrapper(), undefined);
    const sparseSlot = { ref, methodNames: undefined };
    cleanupExposedRefSlot(controller, 9, sparseSlot);
    installExposedRefMethods(controller, 0, slot, otherRef, { ping: first });
    assert.strictEqual(ref.value, undefined);
    assert.strictEqual(typeof otherRef.value.ping, "function");
    cleanupExposedRefSlot(controller, 0, slot);
    assert.strictEqual(otherRef.value, undefined);
    const emptySlot = { ref: null, methodNames: ["stale"] };
    cleanupExposedRefSlot(controller, 0, emptySlot);
    assert.deepStrictEqual(emptySlot, { ref: null, methodNames: [] });
  });

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
    const ref = { value: undefined };

    controller.register = (callback, deps, layout) => {
      registered.push({ callback, deps, layout });
    };

    controller.registerImperative(ref, { focus: true }, ["dep"]);
    assert.strictEqual(controller.imperatives.length, 1);
    assert.strictEqual(controller.imperativeCursor, 1);
    assert.strictEqual(registered[0].deps, null);
    assert.strictEqual(registered[0].layout, true);

    registered[0].callback();
    assert.deepStrictEqual(ref.value, { focus: true });
    registered[0].callback();
    assert.deepStrictEqual(ref.value, { focus: true });

    controller.registerExpose(() => ({ reportValidity() { return true; } }), ["api"]);
    assert.deepStrictEqual(registered[1].deps, ["api"]);
    assert.strictEqual(registered[1].layout, true);

    registered[1].callback();
    assert.strictEqual(typeof host.reportValidity, "function");
    assert.strictEqual(host.reportValidity(), true);

    controller.registerExpose({ reset() { return "reset"; } }, null);
    registered[2].callback();
    assert.strictEqual(host.reset(), "reset");

    controller.registerExposeRef(ref, () => ({ focus() { return "ref"; } }), ["ref-api"]);
    assert.deepStrictEqual(registered[3].deps, ["ref-api"]);
    assert.strictEqual(registered[3].layout, true);

    registered[3].callback();
    assert.strictEqual(typeof ref.value.focus, "function");
    assert.strictEqual(ref.value.focus(), "ref");

    controller.registerExposeRef(ref, { blur() { return "blur"; } }, undefined);
    registered[4].callback();
    assert.strictEqual(ref.value.blur(), "blur");

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
