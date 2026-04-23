import assert from "assert";
import { describe, it } from "vitest";
import { nothing } from "lit";
import {
  ErrorBoundary,
  ErrorBoundaryElement,
} from "../packages/litsx/src/index.js";

class TestErrorBoundaryElement extends ErrorBoundaryElement {
  scheduleUpdate() {
    return Promise.resolve();
  }

  performUpdate() {}
}

function templateSource(templateResult) {
  return Array.isArray(templateResult?.strings)
    ? templateResult.strings.join("")
    : "";
}

describe("litsx error boundary components", () => {
  it("re-exports the error boundary element from the runtime index", () => {
    assert.strictEqual(typeof ErrorBoundary, "function");
    assert.strictEqual(typeof ErrorBoundaryElement, "function");
    assert.strictEqual(ErrorBoundaryElement, ErrorBoundary);
  });

  it("captures synchronous render errors and renders fallback content", () => {
    const boundary = new TestErrorBoundaryElement();
    let shouldThrow = true;

    boundary.contentRenderer = () => {
      if (shouldThrow) {
        throw new Error("boom");
      }
      return "ok";
    };
    boundary.fallbackRenderer = (error) => `fallback:${error.message}`;

    const first = boundary.render();
    assert.strictEqual(boundary.failed, true);
    assert.strictEqual(boundary.error.message, "boom");
    assert.match(templateSource(first), /part="fallback"/);

    shouldThrow = false;
    const second = boundary.render();
    assert.strictEqual(boundary.failed, true);
    assert.match(templateSource(second), /fallback/);
  });

  it("does not intercept thenables", () => {
    const boundary = new TestErrorBoundaryElement();
    const promise = Promise.resolve();

    boundary.contentRenderer = () => {
      throw promise;
    };
    boundary.fallbackRenderer = () => "fallback";

    assert.throws(() => boundary.render(), (error) => error === promise);
    assert.strictEqual(boundary.failed, false);
    assert.strictEqual(boundary.error, null);
  });

  it("invokes onError exactly once when the failure is first captured", () => {
    const boundary = new TestErrorBoundaryElement();
    const calls = [];

    boundary.contentRenderer = () => {
      throw new Error("boom");
    };
    boundary.fallbackRenderer = () => nothing;
    boundary.onError = (error) => {
      calls.push(error.message);
    };

    boundary.render();
    boundary.render();

    assert.deepStrictEqual(calls, ["boom"]);
  });
});
