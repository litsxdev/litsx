import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "vitest";
import {
  createUnoCssBuildEngine,
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
import { createUnoCssGuardMarker } from "../packages/unocss/src/protocol.js";

function generatedResult(cssByLayer = { preflights: "base", theme: "theme" }) {
  const layers = Object.keys(cssByLayer);
  return {
    css: Object.values(cssByLayer).join("\n"),
    layers,
    getLayer: (layer) => cssByLayer[layer] ?? "",
    getLayers: (includes, excludes = []) => layers
      .filter((layer) => (!includes || includes.includes(layer)) && !excludes.includes(layer))
      .map((layer) => cssByLayer[layer])
      .filter(Boolean)
      .join("\n"),
    setLayer() {},
  };
}

function fakeGenerator() {
  return {
    config: {
      theme: { color: "red" },
      safelist: ["grid", "gap-6", "text-red", "text-blue"],
      preflights: [{ layer: "preflights" }, { layer: "theme" }],
    },
    async applyExtractors(code) {
      return new Set(String(code).split(/\s+/u).filter(Boolean));
    },
    async generate(tokens, options) {
      if (options?.preflights) return generatedResult();
      return {
        ...generatedResult({ utilities: [...tokens].sort().join(" ") }),
        css: [...tokens].sort().join(" "),
      };
    },
  };
}

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

  it("rejects unavailable generators and honors external stores, filters, readiness, and extraction", async () => {
    let readyCalls = 0;
    let flushCalls = 0;
    const tokens = new Set(["existing"]);
    const globalTokens = new Set();
    const invalid = createUnoCssBuildEngine({
      generator: null,
      ready: () => { readyCalls += 1; },
      flushTasks: () => { flushCalls += 1; },
    });
    await assert.rejects(() => invalid.collect("grid", "entry.ts"), /requires a resolved UnoCSS generator/);
    assert.equal(readyCalls, 2);
    assert.equal(flushCalls, 2);

    const engine = createUnoCssBuildEngine({
      generator: () => fakeGenerator(),
      tokens: () => tokens,
      globalTokens: () => globalTokens,
      filter: (_code, id) => !id.includes("ignored"),
      extract: async (code, _id, store) => store.add(`custom:${code}`),
    });
    assert.strictEqual(await engine.collect("ignored", "ignored.ts"), tokens);
    assert.deepEqual([...await engine.scan("ignored", "ignored.ts")], []);
    await engine.collect("grid", "entry.ts");
    assert.equal(tokens.has("custom:grid"), true);
    assert.equal(globalTokens.has("grid"), true);
    assert.deepEqual([...await engine.scan("gap-6", "entry.ts", { global: false })], ["gap-6"]);
    assert.equal(globalTokens.has("gap-6"), false);
  });

  it("materializes every guard destination, deduplicates owners, and clears dependency tracking", async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "litsx-unocss-engine-"));
    const dependency = path.join(directory, "tokens.ts");
    fs.writeFileSync(dependency, "export const tokens = true;");
    const engine = createUnoCssBuildEngine({ generator: fakeGenerator() });
    const id = path.join(directory, "entry.tsx");
    try {
      const code = [
        createUnoCssGuardMarker({ candidates: null, dependencies: null, emit: "none" }),
        createUnoCssGuardMarker({ candidates: ["grid"], dependencies: [dependency], emit: "global" }),
        createUnoCssGuardMarker({ candidates: ["grid", "gap-6"], dynamicPatterns: ["text-\u0000"], owner: "Card", scope: ".card" }),
        createUnoCssGuardMarker({ candidates: ["grid", "gap-6"], owner: "Card", scope: ".card" }),
      ].join("\n");
      const result = await engine.materializeModule(code, id);
      assert.ok(result);
      assert.deepEqual(result.dependencies, [dependency]);
      assert.match(result.code, /@scope \(\.card\)/);
      assert.equal(result.code.includes("LITSX_UNOCSS_GUARD"), false);
      assert.deepEqual(engine.getImporters(dependency), [id]);
      assert.deepEqual(engine.invalidate(dependency), [id]);
      assert.equal(engine.globalTokens.has("grid"), true);

      assert.equal(await engine.materializeModule("export const value = 1", id), null);
      assert.deepEqual(engine.getImporters(dependency), []);
      engine.forgetModule("missing.ts");
    } finally {
      fs.rmSync(directory, { recursive: true, force: true });
    }
  });

  it("reports stale static guard sources with actionable causes", async () => {
    const engine = createUnoCssBuildEngine({ generator: fakeGenerator() });
    const missing = path.join(os.tmpdir(), "litsx-missing-static-guard.ts");
    const descriptor = createUnoCssGuardMarker({
      descriptor: { file: missing, localName: "classes" },
    });
    await assert.rejects(
      () => engine.materializeModule(descriptor, "entry.tsx"),
      (error) => /could not refresh guard classes/.test(error.message) && error.cause instanceof Error,
    );

    const source = createUnoCssGuardMarker({
      staticSources: [{ file: missing, node: { type: "CallExpression" } }],
    });
    await assert.rejects(
      () => engine.materializeModule(source, "entry.tsx"),
      (error) => /could not refresh class expression CallExpression/.test(error.message) && error.cause instanceof Error,
    );
  });

  it("routes preflight layers and supports detached, shared, absent, and replaced generators", async () => {
    const generator = fakeGenerator();
    const engine = createUnoCssBuildEngine({
      generator,
      preflightLayers: { component: ["preflights"] },
    });
    const routed = await engine.routeGeneratedResult(generatedResult(), "component");
    assert.deepEqual(routed.layers, ["preflights"]);
    assert.equal(routed.css, "base");
    assert.equal(routed.getLayer("theme"), "");
    assert.equal(routed.getLayer("preflights"), "base");
    assert.equal(routed.getLayers(["preflights", "theme"], ["unused"]), "base");
    routed.setLayer("unused", "value");

    const config = { preflights: null, rules: [] };
    engine.captureResolvedConfig(config, { detachPreflights: false });
    assert.deepEqual(config.preflights, null);
    assert.equal(await engine.generatePreflightFor("component"), "base");
    assert.match(await engine.generateGlobalCss(), /base/);
    assert.match(await engine.finalizePreflight("before __LITSX_UNOCSS_PREFLIGHT_BUILD_PLACEHOLDER__ after"), /before base after/);
    assert.match(await engine.finalizeGlobalCss("before __LITSX_UNOCSS_GLOBAL_CSS_PLACEHOLDER__ after"), /before base/);

    engine.setPreflightGenerator(null);
    assert.equal(await engine.generatePreflight(), "");
    engine.setGenerator(generator);
    engine.setPreflightGenerator(generator);
    engine.captureResolvedConfig({ preflights: [] });
  });
});
