import assert from "node:assert/strict";
import { afterEach, describe, it } from "vitest";
import { nothing } from "lit";
import {
  collectSoftSuspenseThenables,
  collectSuspenseThenable,
  getCurrentSuspenseCapture,
  getHostSuspenseCapture,
  getSoftSuspenseState,
  isThenable,
  renderSoftSuspenseAttempt,
  setHostSuspenseCapture,
  withSuspenseCapture,
} from "../packages/core/src/runtime-suspense.js";
import { withCurrentSsrRuntimeState } from "../packages/core/src/runtime-ssr-state.js";

const originalQueueMicrotask = globalThis.queueMicrotask;
afterEach(() => { globalThis.queueMicrotask = originalQueueMicrotask; });

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((next, fail) => { resolve = next; reject = fail; });
  return { promise, resolve, reject };
}

describe("runtime suspense defensive branches", () => {
  it("manages host captures and soft state for object and function hosts", () => {
    assert.strictEqual(isThenable(null), false);
    assert.strictEqual(isThenable(1), false);
    assert.strictEqual(isThenable(Object.assign(() => {}, { then() {} })), true);
    setHostSuspenseCapture(null, {});
    setHostSuspenseCapture(1, {});
    const host = {};
    const capture = { capture() {} };
    setHostSuspenseCapture(host, capture);
    assert.strictEqual(getHostSuspenseCapture(host), capture);
    setHostSuspenseCapture(host, null);
    assert.strictEqual(getHostSuspenseCapture(host), null);
    const fn = () => {};
    setHostSuspenseCapture(fn, capture);
    assert.strictEqual(getHostSuspenseCapture(fn), capture);
    const state = getSoftSuspenseState(host);
    assert.strictEqual(getSoftSuspenseState(host), state);

    const undeletable = new Proxy({}, { deleteProperty() { throw new Error("locked"); } });
    setHostSuspenseCapture(undeletable, capture);
    assert.doesNotThrow(() => setHostSuspenseCapture(undeletable, null));
  });

  it("restores collectors for sync, async, and throwing renders", async () => {
    const collector = new Set();
    assert.throws(
      () => collectSoftSuspenseThenables(collector, () => { throw new Error("boom"); }),
      /boom/,
    );
    assert.strictEqual(collectSuspenseThenable(Promise.resolve()), null);
    assert.strictEqual(collectSuspenseThenable(1), null);

    const pending = deferred();
    const result = collectSoftSuspenseThenables(collector, () => pending.promise);
    const tracked = collectSuspenseThenable(pending.promise);
    assert.strictEqual(collector.has(tracked), true);
    pending.resolve("done");
    assert.strictEqual(await result, "done");
    assert.strictEqual(collectSuspenseThenable(Promise.resolve()), null);
  });

  it("uses isolated SSR capture and collector state", async () => {
    const state = { suspenseCapture: { old: true }, softSuspenseCollector: new Set() };
    await withCurrentSsrRuntimeState(state, async () => {
      const capture = { capture() {} };
      assert.strictEqual(withSuspenseCapture(capture, () => getCurrentSuspenseCapture()), capture);
      assert.deepStrictEqual(getCurrentSuspenseCapture(), { old: true });
      const promise = Promise.resolve("ssr");
      assert.strictEqual(await collectSoftSuspenseThenables(new Set(), () => promise), "ssr");
      assert.strictEqual(state.softSuspenseCollector instanceof Set, true);
    });
  });

  it("handles captured, duplicate, stale, resolved, and rejected attempts", async () => {
    const host = { updates: 0, requestUpdate() { this.updates += 1; } };
    assert.throws(() => renderSoftSuspenseAttempt(host, () => { throw new Error("plain"); }), /plain/);
    const captured = deferred();
    setHostSuspenseCapture(host, { capture(value) { assert.strictEqual(value, captured.promise); } });
    assert.strictEqual(renderSoftSuspenseAttempt(host, () => { throw captured.promise; }), nothing);
    setHostSuspenseCapture(host, null);

    const first = deferred();
    assert.strictEqual(renderSoftSuspenseAttempt(host, () => { throw first.promise; }), nothing);
    assert.strictEqual(renderSoftSuspenseAttempt(host, () => { throw first.promise; }), nothing);
    const second = deferred();
    assert.strictEqual(renderSoftSuspenseAttempt(host, () => { throw second.promise; }), nothing);
    first.resolve();
    await first.promise;
    await Promise.resolve();
    assert.strictEqual(host.updates, 0);
    second.resolve();
    await second.promise;
    await Promise.resolve();
    assert.strictEqual(host.updates, 1);

    const rejected = deferred();
    const queued = [];
    globalThis.queueMicrotask = (callback) => queued.push(callback);
    renderSoftSuspenseAttempt(host, () => { throw rejected.promise; });
    rejected.reject(new Error("async failure"));
    await rejected.promise.catch(() => {});
    await Promise.resolve();
    assert.strictEqual(host.updates, 2);
    assert.throws(() => queued[0](), /async failure/);
  });

  it("tracks current, stale, and rejected hydration suspensions", async () => {
    const host = { _$needsHydration: true, updates: 0, requestUpdate() { this.updates += 1; } };
    const first = deferred();
    const second = deferred();
    assert.throws(() => renderSoftSuspenseAttempt(host, () => { throw first.promise; }), Promise);
    assert.throws(() => renderSoftSuspenseAttempt(host, () => { throw second.promise; }), Promise);
    first.resolve();
    await first.promise;
    await Promise.resolve();
    second.resolve();
    await second.promise;
    await Promise.resolve();
    assert.strictEqual(host.updates, 2);

    const rejected = deferred();
    const queued = [];
    globalThis.queueMicrotask = (callback) => queued.push(callback);
    assert.throws(() => renderSoftSuspenseAttempt(host, () => { throw rejected.promise; }), Promise);
    rejected.reject(new Error("hydrate failure"));
    await rejected.promise.catch(() => {});
    await Promise.resolve();
    assert.throws(() => queued[0](), /hydrate failure/);
  });
});
