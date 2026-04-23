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

describe("litsx effects controller transitions", () => {
  const originalRAF = globalThis.requestAnimationFrame;

  beforeAll(async () => {
    const mod = await import("../packages/litsx/src/index.js");
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
});
