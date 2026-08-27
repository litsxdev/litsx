import assert from "assert";
import { describe, it } from "vitest";

import {
  connectLightDomRegistry,
  createLightDomRegistry,
  disconnectLightDomRegistry,
  ensureLightDomProxy,
  isLightDomRegistryRuntimeActive,
  upgradeScopedRegistryTree,
  withLightDomCreationContext,
} from "../packages/scoped-registry-shim/src/index.js";

describe("@litsx/scoped-registry-shim shim runtime in node environments", () => {
  it("returns null or no-op when browser globals are unavailable", () => {
    assert.equal(ensureLightDomProxy("demo-card"), null);
    assert.equal(isLightDomRegistryRuntimeActive(), false);
    assert.equal(createLightDomRegistry({}, {}), null);
    assert.equal(connectLightDomRegistry({}, {}), null);
    assert.equal(withLightDomCreationContext(null, () => "value"), "value");
    assert.equal(withLightDomCreationContext(null, null), undefined);
    assert.doesNotThrow(() => disconnectLightDomRegistry({ registry: null }));
    assert.doesNotThrow(() => upgradeScopedRegistryTree({}, {}));
    assert.doesNotThrow(() => upgradeScopedRegistryTree(null, null));
  });
});
