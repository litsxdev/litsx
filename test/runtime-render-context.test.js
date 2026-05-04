import assert from "assert";
import { beforeEach, describe, expect, it, vi } from "vitest";

const withLightDomCreationContext = vi.fn((scope, callback) => callback());

vi.mock("@litsx/light-dom-registry", () => ({
  connectLightDomRegistry: vi.fn(),
  withLightDomCreationContext,
}));

describe("runtime renderer context", () => {
  beforeEach(() => {
    withLightDomCreationContext.mockClear();
  });

  it("wraps direct bound renderer calls in the captured creation context", async () => {
    const { bindRendererContext } = await import("../packages/litsx/src/runtime-render-context.js");

    const host = { constructor: { elements: {} } };
    const renderer = vi.fn((label) => `value:${label}`);
    const bound = bindRendererContext(host, renderer);

    const result = bound("from-host");

    assert.strictEqual(result, "value:from-host");
    expect(withLightDomCreationContext).toHaveBeenCalledTimes(1);
    expect(withLightDomCreationContext).toHaveBeenCalledWith(host, expect.any(Function));
    expect(renderer).toHaveBeenCalledWith("from-host");
  });
});
