import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { describe, it } from "vitest";
import { transformLitsxSync } from "../packages/compiler/src/index.js";
import {
  litsxUnoCss,
  UNO_CSS_PREFLIGHT_MODULE_ID,
} from "../packages/unocss/src/index.js";

function createFixture(name, padding = "1rem") {
  const fixturesRoot = path.join(process.cwd(), "test-results");
  fs.mkdirSync(fixturesRoot, { recursive: true });
  const root = fs.mkdtempSync(path.join(fixturesRoot, `${name}-`));
  const configPath = path.join(root, "uno.config.mjs");
  fs.writeFileSync(
    configPath,
    `export default {
  rules: [["p-card", { padding: ${JSON.stringify(padding)} }]],
  preflights: [{ layer: "preflights", getCSS: () => "*,::before,::after{box-sizing:border-box}" }],
};\n`,
  );
  return { root, configPath };
}

function compile(instance, sourcePath, className = "p-card") {
  return transformLitsxSync(
    `export function NeutralCard() { return <article class=${JSON.stringify(className)}>Card</article>; }`,
    { ...instance.compiler, filename: sourcePath, sourceMaps: true },
  );
}

describe("neutral litsxUnoCss integration", () => {
  it("loads project config, contributes native compiler plugins, materializes modules, and declares final outputs", async () => {
    const { root, configPath } = createFixture("unocss-neutral");
    try {
      const descriptor = litsxUnoCss();
      assert.equal(descriptor.name, "unocss");
      const instance = await descriptor.create({
        projectRoot: root,
        mode: "production",
        identity: Object.freeze({ id: "fixture" }),
      });
      const sourcePath = path.join(root, "card.tsx");
      const compiled = compile(instance, sourcePath);

      assert.equal(instance.compiler.reactCompat, false);
      assert.equal(instance.compiler.authoringPlugins.length, 1);
      assert.equal(instance.compiler.outputPlugins.length, 1);
      assert.match(compiled.code, new RegExp(UNO_CSS_PREFLIGHT_MODULE_ID));

      const materialized = await instance.processModule({
        result: compiled,
        sourcePath,
        source: "",
        target: "client",
        ssr: false,
        sourceMaps: true,
        generation: 0,
      });
      assert.match(materialized.code, /padding:1rem/);
      assert.ok(materialized.dependencies.includes(fs.realpathSync(configPath)));

      const virtualModule = await instance.resolveModule({
        specifier: UNO_CSS_PREFLIGHT_MODULE_ID,
        importer: sourcePath,
        target: "client",
        ssr: false,
        sourceMaps: true,
        generation: 0,
        mode: "production",
      });
      assert.match(virtualModule.code, /box-sizing:border-box/);
      assert.equal(await instance.resolveModule({ specifier: "virtual:other" }), null);

      const finalized = await instance.finalize();
      const preflight = finalized.outputs.find((output) => output.kind === "module");
      const global = finalized.outputs.find((output) => output.kind === "style");
      assert.match(preflight.content, /box-sizing:border-box/);
      assert.equal(preflight.specifier, UNO_CSS_PREFLIGHT_MODULE_ID);
      assert.equal(global.document, true);
      assert.match(global.content, /box-sizing:border-box/);
      assert.ok(finalized.dependencies.includes(fs.realpathSync(configPath)));

      instance.forget({ moduleId: sourcePath });
      instance.dispose();
      instance.dispose();
      await assert.rejects(
        instance.finalize(),
        /disposed/,
      );
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("reloads uno.config on invalidation and keeps instances isolated", async () => {
    const firstFixture = createFixture("unocss-neutral-a", "1rem");
    const secondFixture = createFixture("unocss-neutral-b", "3rem");
    const descriptor = litsxUnoCss();
    const [first, second] = await Promise.all([
      descriptor.create({ projectRoot: firstFixture.root, mode: "development", identity: { id: "a" } }),
      descriptor.create({ projectRoot: secondFixture.root, mode: "development", identity: { id: "b" } }),
    ]);
    try {
      const firstPath = path.join(firstFixture.root, "card.tsx");
      const secondPath = path.join(secondFixture.root, "card.tsx");
      const firstResult = await first.processModule({
        result: compile(first, firstPath), sourcePath: firstPath,
      });
      const secondResult = await second.processModule({
        result: compile(second, secondPath), sourcePath: secondPath,
      });
      assert.match(firstResult.code, /padding:1rem/);
      assert.match(secondResult.code, /padding:3rem/);

      fs.writeFileSync(
        firstFixture.configPath,
        'export default { rules: [["p-card", { padding: "2rem" }]], preflights: [] };\n',
      );
      await first.invalidate({ paths: [firstFixture.configPath] });
      const refreshed = await first.processModule({
        result: compile(first, firstPath), sourcePath: firstPath,
      });
      assert.match(refreshed.code, /padding:2rem/);
      assert.doesNotMatch(refreshed.code, /padding:3rem/);
    } finally {
      first.dispose();
      second.dispose();
      fs.rmSync(firstFixture.root, { recursive: true, force: true });
      fs.rmSync(secondFixture.root, { recursive: true, force: true });
    }
  });

  it("reloads static config dependencies and survives config deletion and recreation", async () => {
    const { root, configPath } = createFixture("unocss-neutral-config-lifecycle");
    const tokensPath = path.join(root, "tokens.mjs");
    fs.writeFileSync(tokensPath, 'export const padding = "1rem";\n');
    fs.writeFileSync(
      configPath,
      'import { padding } from "./tokens.mjs";\nexport default { configDeps: ["./tokens.mjs"], rules: [["p-card", { padding }]] };\n',
    );
    const descriptor = litsxUnoCss();
    const [first, second] = await Promise.all([
      descriptor.create({ projectRoot: root, mode: "development", identity: { id: "config-a" } }),
      descriptor.create({ projectRoot: root, mode: "development", identity: { id: "config-b" } }),
    ]);
    const sourcePath = path.join(root, "card.tsx");
    try {
      fs.writeFileSync(tokensPath, 'export const padding = "2rem";\n');
      await Promise.all([
        first.invalidate({ paths: [tokensPath] }),
        second.invalidate({ paths: [tokensPath] }),
      ]);
      for (const instance of [first, second]) {
        const refreshed = await instance.processModule({
          result: compile(instance, sourcePath), sourcePath,
        });
        assert.match(refreshed.code, /padding:2rem/);
        assert.doesNotMatch(refreshed.code, /padding:1rem/);
      }

      fs.rmSync(configPath);
      await first.invalidate({ paths: [configPath] });
      const withoutConfig = await first.processModule({
        result: compile(first, sourcePath), sourcePath,
      });
      assert.doesNotMatch(withoutConfig.code, /padding:[12]rem/);

      fs.writeFileSync(
        configPath,
        'export default { rules: [["p-card", { padding: "4rem" }]] };\n',
      );
      await first.invalidate({ paths: [configPath] });
      const recreated = await first.processModule({
        result: compile(first, sourcePath), sourcePath,
      });
      assert.match(recreated.code, /padding:4rem/);
    } finally {
      first.dispose();
      second.dispose();
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("omits the preflight virtual module when preflightModule is false", async () => {
    const { root } = createFixture("unocss-neutral-no-preflight");
    const instance = await litsxUnoCss({
      integration: { preflightModule: false },
    }).create({
      projectRoot: root,
      mode: "production",
      identity: { id: "no-preflight" },
    });
    try {
      const sourcePath = path.join(root, "card.tsx");
      const compiled = compile(instance, sourcePath);
      assert.doesNotMatch(compiled.code, new RegExp(UNO_CSS_PREFLIGHT_MODULE_ID));
      const finalized = await instance.finalize();
      assert.equal(
        finalized.outputs.some((output) => output.kind === "module"),
        false,
      );
    } finally {
      instance.dispose();
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("cleans partial config snapshots when a static dependency fails", async () => {
    const { root, configPath } = createFixture("unocss-neutral-config-failure");
    const firstDependency = path.join(root, "a.mjs");
    const failingDependency = path.join(root, "b.mjs");
    fs.writeFileSync(firstDependency, 'export const first = "1rem";\n');
    fs.writeFileSync(failingDependency, 'export const second = "2rem";\n');
    fs.writeFileSync(
      configPath,
      'import { first } from "./a.mjs";\nimport { second } from "./b.mjs";\nexport default { configDeps: ["./b.mjs"], rules: [["p-card", { padding: first, margin: second }]] };\n',
    );
    const instance = await litsxUnoCss().create({
      projectRoot: root,
      mode: "development",
      identity: { id: "config-failure" },
    });
    try {
      fs.writeFileSync(failingDependency, "export const second = ;\n");
      await assert.rejects(
        instance.invalidate({ paths: [failingDependency] }),
      );
      assert.deepEqual(
        fs.readdirSync(root).filter((entry) =>
          entry.startsWith(".litsx-unocss-reload-"),
        ),
        [],
      );
    } finally {
      instance.dispose();
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("reloads CommonJS config dependencies required statically", async () => {
    const fixturesRoot = path.join(process.cwd(), "test-results");
    fs.mkdirSync(fixturesRoot, { recursive: true });
    const root = fs.mkdtempSync(path.join(fixturesRoot, "unocss-neutral-cjs-"));
    const configPath = path.join(root, "uno.config.cjs");
    const tokensPath = path.join(root, "tokens.cjs");
    fs.writeFileSync(tokensPath, 'exports.padding = "1rem";\n');
    fs.writeFileSync(
      configPath,
      'const { padding } = require("./tokens.cjs");\nmodule.exports = { configDeps: ["./tokens.cjs"], rules: [["p-card", { padding }]] };\n',
    );
    const instance = await litsxUnoCss().create({
      projectRoot: root,
      mode: "development",
      identity: { id: "config-cjs" },
    });
    const sourcePath = path.join(root, "card.tsx");
    try {
      const initial = await instance.processModule({
        result: compile(instance, sourcePath), sourcePath,
      });
      assert.match(initial.code, /padding:1rem/);

      fs.writeFileSync(tokensPath, 'exports.padding = "2rem";\n');
      await instance.invalidate({ paths: [tokensPath] });
      const refreshed = await instance.processModule({
        result: compile(instance, sourcePath), sourcePath,
      });
      assert.match(refreshed.code, /padding:2rem/);
      assert.doesNotMatch(refreshed.code, /padding:1rem/);
    } finally {
      instance.dispose();
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("has no Evolit or Vite dependency in the neutral root implementation", () => {
    const source = fs.readFileSync(
      path.resolve("packages/unocss/src/index.js"),
      "utf8",
    );
    assert.doesNotMatch(source, /from ["'](?:evolit|vite|@litsx\/vite-plugin)/);
  });
});
