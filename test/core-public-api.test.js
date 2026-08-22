import assert from "node:assert/strict";
import { describe, it } from "vitest";
import * as core from "../packages/core/src/index.js";
import {
  prepareEffects,
  runWithHookHost,
} from "../packages/core/src/runtime-controller.js";

describe("@litsx/core public hook runtime", () => {
  it("exports generated-code ABI without exposing implementation helpers", () => {
    assert.equal(typeof core.renderWithHooks, "function");
    assert.equal(typeof core.applyStructuralHooks, "function");
    assert.equal(typeof core.readStructuralHook, "function");

    assert.equal("prepareEffects" in core, false);
    assert.equal("runWithHookHost" in core, false);
    assert.equal("STRUCTURAL_HOOKS" in core, false);
    assert.equal("isStructuralHook" in core, false);

    assert.equal(typeof prepareEffects, "function");
    assert.equal(typeof runWithHookHost, "function");
  });
});
