import assert from "node:assert/strict";
import { describe, it } from "vitest";
import {
  cloneValiditySnapshot,
  createSharedFaceState,
  ensureInternals,
  getOrCreateFaceState,
  readValidationMessage,
  readWillValidate,
  refreshSharedValidity,
  requestHostUpdate,
  sameValiditySnapshot,
  syncInternalsValue,
  updateSharedValiditySnapshot,
} from "../packages/core/src/form-hooks.js";

describe("form hook helper branches", () => {
  it("caches, normalizes, and rejects element internals defensively", () => {
    assert.strictEqual(ensureInternals(null), null);
    assert.strictEqual(ensureInternals({}), null);
    const missing = { attachInternals: () => undefined };
    assert.strictEqual(ensureInternals(missing), null);
    assert.strictEqual(ensureInternals(missing), null);
    const throwing = { attachInternals() { throw new Error("unsupported"); } };
    assert.strictEqual(ensureInternals(throwing), null);

    const primitive = getOrCreateFaceState("host");
    assert.strictEqual(primitive.supported, false);
    const host = { attachInternals: () => ({ validity: { valid: false, customError: true }, validationMessage: 1 }) };
    const shared = getOrCreateFaceState(host);
    assert.strictEqual(getOrCreateFaceState(host), shared);
    assert.strictEqual(shared.validity.valid, false);
    assert.strictEqual(shared.validity.customError, true);
    assert.strictEqual(shared.validationMessage, "");
    assert.strictEqual(shared.willValidate, false);
  });

  it("compares validity and reads missing internals fields", () => {
    const defaults = cloneValiditySnapshot(null);
    assert.strictEqual(defaults.valid, true);
    assert.strictEqual(cloneValiditySnapshot({ valid: undefined }).valid, true);
    assert.strictEqual(sameValiditySnapshot(defaults, { ...defaults }), true);
    assert.strictEqual(sameValiditySnapshot(null, null), true);
    assert.strictEqual(sameValiditySnapshot(defaults, { ...defaults, tooLong: true }), false);
    assert.strictEqual(readValidationMessage(null), "");
    assert.strictEqual(readValidationMessage({ validationMessage: "bad" }), "bad");
    assert.strictEqual(readWillValidate(null), false);
    assert.strictEqual(readWillValidate({ willValidate: true }), true);
  });

  it("syncs form values through fallback signatures and refreshes changed snapshots", () => {
    assert.doesNotThrow(() => syncInternalsValue(null, "x"));
    const calls = [];
    syncInternalsValue({ setFormValue(...args) { calls.push(args); } }, undefined);
    let attempts = 0;
    syncInternalsValue({
      setFormValue(...args) {
        attempts += 1;
        if (args.length === 2) throw new Error("legacy");
        calls.push(args);
      },
    }, "value", "state");
    assert.deepStrictEqual(calls, [[null, undefined], ["value"]]);

    let updates = 0;
    const host = { requestUpdate() { updates += 1; } };
    requestHostUpdate(null);
    const shared = createSharedFaceState(null);
    assert.strictEqual(updateSharedValiditySnapshot(shared), false);
    shared.internals = { validity: { valid: false }, validationMessage: "invalid", willValidate: true };
    assert.strictEqual(refreshSharedValidity(host, shared), true);
    assert.strictEqual(refreshSharedValidity(host, shared), false);
    assert.strictEqual(updates, 1);
  });
});
