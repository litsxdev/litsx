import assert from "assert";
import { afterEach, beforeEach, expect, vi } from "vitest";
import {
  clearDeferredValues,
  resolveDeferredValue,
  scheduleDeferredFlush,
} from "../packages/core/src/runtime-deferred-values.js";

describe("runtime deferred values", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("initializes deferred slots and reuses them when the source value is unchanged", () => {
    const controller = {
      deferredCursor: 0,
      deferredValues: [],
      priorityQueue: { enqueue: vi.fn() },
    };

    const first = resolveDeferredValue(controller, "alpha");
    controller.deferredCursor = 0;
    const second = resolveDeferredValue(controller, "alpha", { timeout: 5 });

    assert.strictEqual(first.current, "alpha");
    assert.strictEqual(first, second);
    assert.strictEqual(second.version, 0);
    assert.deepStrictEqual(second.options, { timeout: 5 });
  });

  it("schedules deferred flushes, clears prior timers, and ignores stale timer tokens", () => {
    const enqueue = vi.fn();
    const requestUpdate = vi.fn();
    const controller = {
      deferredCursor: 0,
      deferredValues: [],
      priorityQueue: { enqueue },
      host: { requestUpdate },
    };

    const slot = resolveDeferredValue(controller, "alpha");
    slot.options = { timeout: -5 };
    scheduleDeferredFlush(controller, slot);
    const firstTimer = slot.timer;

    slot.source = "beta";
    slot.version = 1;
    scheduleDeferredFlush(controller, slot);
    assert.notStrictEqual(slot.timer, firstTimer);

    slot.version = 2;
    vi.runOnlyPendingTimers();

    expect(enqueue).not.toHaveBeenCalled();

    slot.version = 3;
    slot.source = "gamma";
    scheduleDeferredFlush(controller, slot);
    vi.runOnlyPendingTimers();

    expect(enqueue).toHaveBeenCalledTimes(1);
    assert.strictEqual(slot.current, "gamma");
    assert.strictEqual(slot.pending, false);
    enqueue.mock.calls[0][0].flush();
    expect(requestUpdate).toHaveBeenCalledTimes(1);
  });

  it("clears sparse deferred slots and tolerates missing arrays", () => {
    clearDeferredValues({});

    const slotWithTimer = {
      pending: true,
      timer: setTimeout(() => {}, 10),
    };
    const controller = {
      deferredValues: [slotWithTimer, null, { pending: true, timer: null }],
    };

    clearDeferredValues(controller);

    assert.strictEqual(slotWithTimer.timer, null);
    assert.strictEqual(slotWithTimer.pending, false);
    assert.strictEqual(controller.deferredValues[2].pending, false);
  });
});
