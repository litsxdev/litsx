import assert from "node:assert";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createGenerator, presetWind4 } from "unocss";
import { describe, it } from "vitest";
import { build } from "vite";

import { transformLitsx } from "../packages/compiler/src/index.js";
import {
  createTailwindContext,
  withTailwindCompiler,
} from "../packages/tailwind/src/index.js";
import {
  createTailwindVirtualPlugin,
  litsxTailwind,
} from "../packages/tailwind/src/vite.js";
import {
  createUnoCssBuildEngine,
  withUnoCssCompiler,
} from "../packages/unocss/src/index.js";

function componentKey(code) {
  return code.match(/tailwind\/component\/([a-z0-9]+)\.css/u)?.[1] ?? null;
}

function loadTailwindComponentCss(plugin, key) {
  return plugin.load.call(
    {
      addWatchFile() {},
      error(message) {
        throw new Error(message);
      },
    },
    `\0@litsx/tailwind/component/${key}.css`,
  );
}

function deferred() {
  let resolve;
  const promise = new Promise((next) => {
    resolve = next;
  });
  return { promise, resolve };
}

function createInterleavedGenerator(generator, completionOrder) {
  const bothGenerating = deferred();
  let generateCalls = 0;

  return new Proxy(generator, {
    get(target, property) {
      if (property === "generate") {
        return async (tokens, options) => {
          generateCalls += 1;
          if (generateCalls === 2) bothGenerating.resolve();
          await bothGenerating.promise;

          const token = [...tokens][0] ?? "empty";
          if (token === "bg-red-500") {
            await new Promise((resolve) => setImmediate(resolve));
          }

          const result = await target.generate(tokens, options);
          completionOrder.push(token);
          return result;
        };
      }

      const value = Reflect.get(target, property, target);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
}

async function buildTailwindEntries() {
  const directory = fs.mkdtempSync(
    path.join(os.tmpdir(), "litsx-tailwind-concurrency-"),
  );
  const red = path.join(directory, "red-card.tsx");
  const blue = path.join(directory, "blue-card.tsx");

  fs.writeFileSync(
    red,
    'export function RedCard() { return <article class="bg-red-500 p-3">Red</article>; }',
    "utf8",
  );
  fs.writeFileSync(
    blue,
    'export function BlueCard() { return <article class="bg-blue-500 m-7">Blue</article>; }',
    "utf8",
  );

  try {
    const result = await build({
      configFile: false,
      root: directory,
      logLevel: "silent",
      plugins: litsxTailwind({
        integration: {
          entry: fileURLToPath(import.meta.resolve("tailwindcss/index.css")),
          sources: [],
        },
      }),
      build: {
        write: false,
        minify: false,
        rollupOptions: {
          input: { red, blue },
          external(id) {
            return (
              id === "lit" || id.startsWith("lit/") || id.startsWith("@litsx/")
            );
          },
          output: { entryFileNames: "[name].js" },
        },
      },
    });

    const outputs = Array.isArray(result)
      ? result.flatMap((entry) => entry.output)
      : result.output;
    return new Map(
      outputs
        .filter((entry) => entry.type === "chunk" && entry.isEntry)
        .map((entry) => [entry.name, entry.code]),
    );
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
}

describe("utility CSS concurrency isolation", () => {
  it("keeps parallel Tailwind modules isolated in one shared context", async () => {
    const context = createTailwindContext();
    const inputs = [
      { filename: "/virtual/red.tsx", candidate: "bg-red-500" },
      { filename: "/virtual/blue.tsx", candidate: "bg-blue-500" },
      { filename: "/virtual/green.tsx", candidate: "bg-green-500" },
      { filename: "/virtual/amber.tsx", candidate: "bg-amber-500" },
    ];

    const results = await Promise.all(
      inputs.map(({ filename, candidate }) =>
        transformLitsx(
          `export function SharedCard() { return <div class="${candidate}" />; }`,
          withTailwindCompiler({ filename }, context),
        ),
      ),
    );
    const plugin = createTailwindVirtualPlugin(context);
    const keys = results.map((result) => componentKey(result.code));

    assert(keys.every(Boolean));
    assert.strictEqual(new Set(keys).size, inputs.length);
    for (const [index, key] of keys.entries()) {
      const expected = inputs[index].candidate;
      const unrelated = inputs
        .filter((_input, inputIndex) => inputIndex !== index)
        .map((input) => input.candidate);
      const payload = context.get(key);
      const virtualCss = loadTailwindComponentCss(plugin, key);

      assert.deepStrictEqual(payload.candidates, [expected]);
      assert.match(virtualCss, new RegExp(expected));
      for (const candidate of unrelated) {
        assert.doesNotMatch(virtualCss, new RegExp(candidate));
      }
    }
  });

  it("shares stable Tailwind metadata across parallel client and SSR transforms", async () => {
    const context = createTailwindContext();
    const source =
      'export function SharedCard() { return <div class="grid gap-4" />; }';
    const filename = "/virtual/shared-card.tsx";

    const [client, ssr] = await Promise.all([
      transformLitsx(source, withTailwindCompiler({ filename }, context)),
      transformLitsx(
        source,
        withTailwindCompiler({ filename, ssr: true }, context),
      ),
    ]);
    const clientKey = componentKey(client.code);
    const ssrKey = componentKey(ssr.code);

    assert(clientKey);
    assert.strictEqual(clientKey, ssrKey);
    assert.deepStrictEqual(context.get(clientKey).candidates, [
      "gap-4",
      "grid",
    ]);
  });

  it("keeps UnoCSS output local when shared generation completes out of order", async () => {
    const generator = await createGenerator({
      presets: [presetWind4()],
      preflights: [],
    });
    const completionOrder = [];
    const engine = createUnoCssBuildEngine({
      generator: createInterleavedGenerator(generator, completionOrder),
    });
    const inputs = [
      { filename: "/virtual/red.tsx", candidate: "bg-red-500" },
      { filename: "/virtual/blue.tsx", candidate: "bg-blue-500" },
    ];
    const compiled = await Promise.all(
      inputs.map(({ filename, candidate }) =>
        transformLitsx(
          `export function SharedCard() { return <div class="${candidate}" />; }`,
          withUnoCssCompiler({ filename }),
        ),
      ),
    );

    const materialized = await Promise.all(
      compiled.map((result, index) =>
        engine.materializeModule(result.code, inputs[index].filename),
      ),
    );

    assert.deepStrictEqual(completionOrder, ["bg-blue-500", "bg-red-500"]);
    assert.match(materialized[0].code, /\.bg-red-500\{/u);
    assert.doesNotMatch(materialized[0].code, /\.bg-blue-500\{/u);
    assert.match(materialized[1].code, /\.bg-blue-500\{/u);
    assert.doesNotMatch(materialized[1].code, /\.bg-red-500\{/u);
    assert(engine.tokens.has("bg-red-500"));
    assert(engine.tokens.has("bg-blue-500"));
  });

  it("materializes isolated Tailwind CSS in a real parallel-entry Vite build", async () => {
    const entries = await buildTailwindEntries();
    const red = entries.get("red");
    const blue = entries.get("blue");

    assert(red, "expected a red entry chunk");
    assert(blue, "expected a blue entry chunk");
    assert.match(red, /\.bg-red-500/u);
    assert.match(red, /\.p-3/u);
    assert.doesNotMatch(red, /\.bg-blue-500|\.m-7/u);
    assert.match(blue, /\.bg-blue-500/u);
    assert.match(blue, /\.m-7/u);
    assert.doesNotMatch(blue, /\.bg-red-500|\.p-3/u);
  });
});
