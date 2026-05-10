import assert from "assert";
import { describe, it } from "vitest";

import {
  connectLightDomRegistry,
  createLightDomRegistry,
  disconnectLightDomRegistry,
  ensureLightDomProxy,
  withLightDomCreationContext,
} from "../packages/light-dom-registry/src/index.js";

describe("@litsx/light-dom-registry in node environments", () => {
  it("returns null or no-op when browser globals are unavailable", () => {
    assert.equal(ensureLightDomProxy("demo-card"), null);
    assert.equal(createLightDomRegistry({}, {}), null);
    assert.equal(connectLightDomRegistry({}, {}), null);
    assert.equal(withLightDomCreationContext(null, () => "value"), "value");
    assert.equal(withLightDomCreationContext(null, null), undefined);
    assert.doesNotThrow(() => disconnectLightDomRegistry({ registry: null }));
  });
});
