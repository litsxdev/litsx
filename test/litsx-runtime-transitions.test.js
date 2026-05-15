import assert from "assert";
import { beforeAll, afterAll, describe, it, vi } from "vitest";

let prepareEffects;
let startTransition;
let useTransition;
let useDeferredValue;

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

function update(host) {
  for (const controller of host.controllers) {
    controller.hostUpdated();
  }
}

describe("litsx runtime transitions", () => {
  const originalRAF = globalThis.requestAnimationFrame;

  beforeAll(async () => {
    const mod = await import("../packages/core/src/index.js");
    ({
      prepareEffects,
      startTransition,
      useTransition,
      useDeferredValue,
    } = mod);

    globalThis.requestAnimationFrame = (cb) => {
      cb(0);
      return 0;
    };
  });

  afterAll(() => {
    globalThis.requestAnimationFrame = originalRAF;
  });

  it("tracks pending transitions until completion", async () => {
    const host = new TestHost();

    prepareEffects(host);
    let [isPending, startTransition] = useTransition(host);
    assert.strictEqual(isPending, false);

    let resolveTransition;
    const transitionPromise = new Promise((resolve) => {
      resolveTransition = resolve;
    });

    const returned = startTransition(() => transitionPromise);
    assert.strictEqual(returned, transitionPromise);
    assert.strictEqual(host.updates, 1);

    prepareEffects(host);
    [isPending] = useTransition(host);
    assert.strictEqual(isPending, true);

    resolveTransition();
    await transitionPromise;
    assert.ok(host.updates >= 2);

    prepareEffects(host);
    [isPending] = useTransition(host);
    assert.strictEqual(isPending, false);
  });

  it("exposes standalone startTransition with the same pending semantics", async () => {
    const host = new TestHost();

    prepareEffects(host);
    let [isPending] = useTransition(host);
    assert.strictEqual(isPending, false);

    let resolveTransition;
    const transitionPromise = new Promise((resolve) => {
      resolveTransition = resolve;
    });

    const returned = startTransition(host, () => transitionPromise);
    assert.strictEqual(returned, transitionPromise);
    assert.strictEqual(host.updates, 1);

    prepareEffects(host);
    [isPending] = useTransition(host);
    assert.strictEqual(isPending, true);

    resolveTransition();
    await transitionPromise;
    assert.ok(host.updates >= 2);

    prepareEffects(host);
    [isPending] = useTransition(host);
    assert.strictEqual(isPending, false);
  });

  it("defers value updates until timeout elapses", () => {
    vi.useFakeTimers();
    const host = new TestHost();

    prepareEffects(host);
    let deferred = useDeferredValue(host, "A");
    assert.strictEqual(deferred, "A");

    prepareEffects(host);
    deferred = useDeferredValue(host, "B", { timeout: 10 });
    assert.strictEqual(deferred, "A");

    vi.advanceTimersByTime(10);
    update(host);

    prepareEffects(host);
    deferred = useDeferredValue(host, "B", { timeout: 10 });
    assert.strictEqual(deferred, "B");

    vi.useRealTimers();
  });

  it("finalizes sync startTransition callbacks on a microtask and propagates thrown errors", async () => {
    const host = new TestHost();

    prepareEffects(host);
    let [isPending, start] = useTransition(host);
    assert.strictEqual(isPending, false);

    const returned = start(() => "done");
    assert.strictEqual(returned, "done");
    assert.strictEqual(host.updates, 1);

    prepareEffects(host);
    [isPending] = useTransition(host);
    assert.strictEqual(isPending, true);

    await Promise.resolve();

    prepareEffects(host);
    [isPending, start] = useTransition(host);
    assert.strictEqual(isPending, false);

    assert.throws(() => start(() => {
      throw new Error("boom");
    }), /boom/);
  });

  it("reports deferred flush errors through the host before rethrowing", () => {
    vi.useFakeTimers();
    const reported = [];
    const host = new TestHost();
    host.reportError = (error) => {
      reported.push(error.message);
    };
    host.requestUpdate = () => {
      throw new Error("flush failed");
    };

    prepareEffects(host);
    useDeferredValue(host, "A");

    prepareEffects(host);
    useDeferredValue(host, "B", { timeout: 5 });

    vi.advanceTimersByTime(5);

    assert.throws(() => update(host), /flush failed/);
    assert.deepStrictEqual(reported, ["flush failed"]);

    vi.useRealTimers();
  });
});
