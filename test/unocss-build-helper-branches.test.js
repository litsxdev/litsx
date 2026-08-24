import assert from "node:assert/strict";
import path from "node:path";
import { describe, it } from "vitest";
import {
  createResolvedPreflightConfig,
  defaultPreflightLayerSelector,
  dynamicPatternMatcher,
  includesPreflightLayer,
  normalizeDependency,
  resolveConfiguredSafelist,
  resolvePreflightLayerSelector,
  resolveValue,
  uniquePreflightLayers,
} from "../packages/unocss/src/build-engine.js";

describe("UnoCSS build helper branches", () => {
  it("normalizes existing and absent dependencies", () => {
    assert.equal(normalizeDependency(process.cwd()), process.cwd());
    assert.equal(normalizeDependency("./definitely-missing-file"), path.resolve("./definitely-missing-file"));
  });

  it("strips resolved config fields and preserves preflight inputs", () => {
    const config = createResolvedPreflightConfig(
      { configResolved: true, presets: ["preset"], theme: { color: "red" }, rules: [] },
      [{ layer: "base" }]
    );
    assert.equal(config.configResolved, undefined);
    assert.deepEqual(config.presets, []);
    assert.deepEqual(config.preflights, [{ layer: "base" }]);
    assert.equal(config.theme.color, "red");
  });

  it("deduplicates default and explicit preflight layers", () => {
    assert.deepEqual(uniquePreflightLayers({ config: { preflights: [{}, { layer: "theme" }, { layer: "theme" }] } }), ["preflights", "theme"]);
    assert.equal(defaultPreflightLayerSelector({ destination: "global", layer: "theme" }), true);
    assert.equal(defaultPreflightLayerSelector({ destination: "component", layer: "base" }), true);
    assert.equal(defaultPreflightLayerSelector({ destination: "component", layer: "theme" }), false);
  });

  it("resolves configured selectors and array/function inclusion", () => {
    const custom = () => false;
    assert.strictEqual(resolvePreflightLayerSelector({ preflightLayers: { global: custom } }, "global"), custom);
    assert.strictEqual(resolvePreflightLayerSelector({}, "component"), defaultPreflightLayerSelector);
    assert.equal(includesPreflightLayer(["base"], "base", "component", ["base"]), true);
    assert.equal(includesPreflightLayer(["base"], "theme", "component", ["base"]), false);
    assert.equal(includesPreflightLayer(({ destination }) => destination === "global", "base", "global", []), true);
  });

  it("resolves values, wildcard patterns, and safelist entries", async () => {
    assert.equal(await resolveValue(42), 42);
    assert.equal(await resolveValue(() => Promise.resolve(43)), 43);
    const matcher = dynamicPatternMatcher("hover:bg-[\u0000]");
    assert.equal(matcher.test("hover:bg-[red.500]"), true);
    assert.equal(matcher.test("focus:bg-[red.500]"), false);
    const generator = {
      config: {
        theme: { color: "red" },
        safelist: [" static ", "", ({ theme }) => [` dynamic-${theme.color} `, "  "]],
      },
    };
    assert.deepEqual(resolveConfiguredSafelist(generator), ["static", "dynamic-red"]);
  });
});
