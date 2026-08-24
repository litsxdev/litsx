import assert from "node:assert/strict";
import path from "node:path";
import { describe, it } from "vitest";
import { createTailwindContext } from "../packages/tailwind/src/context.js";
import {
  createTailwindPropertyCleanupPlugin,
  createTailwindVirtualPlugin,
  litsxTailwind,
  withTailwindViteCompiler,
} from "../packages/tailwind/src/vite.js";
import {
  TAILWIND_COMPONENT_MODULE_PREFIX,
  TAILWIND_INFRASTRUCTURE_MODULE_ID,
  TAILWIND_PREFLIGHT_MODULE_ID,
} from "../packages/tailwind/src/protocol.js";

describe("@litsx/tailwind Vite and context branches", () => {
  it("normalizes context defaults, paths, safelists, updates, and cleanup", () => {
    const defaults = createTailwindContext();
    assert.equal(defaults.entry, "tailwindcss");
    assert.deepEqual(defaults.sources, [
      path.resolve(process.cwd(), "./src/**/*.{html,js,jsx,ts,tsx}"),
    ]);
    assert.deepEqual(defaults.safelist, []);
    assert.equal(defaults.get("missing"), null);

    const context = createTailwindContext({
      entry: './styles/theme"dark.css',
      sources: ["./components/**/*.tsx", "virtual-source"],
      safelist: ["p-4", "p-4", "m-2"],
    });
    context.configure({ root: "/project" });
    assert.equal(context.root, "/project");
    assert.equal(context.entry, '/project/styles/theme"dark.css');
    assert.deepEqual(context.sources, [
      "/project/components/**/*.tsx",
      "virtual-source",
    ]);
    assert.deepEqual(context.safelist, ["p-4", "m-2"]);

    const changes = [];
    const unsubscribe = context.onChange((key) => changes.push(key));
    const key = context.register("/src/card.tsx", null, {
      candidates: ["p-4"],
    });
    assert.deepEqual(context.get(key).candidates, ["p-4"]);
    assert.equal(
      context.register("/src/card.tsx", null, { candidates: ["p-4"] }),
      key,
    );
    assert.deepEqual(changes, []);
    context.register("/src/card.tsx", null, { candidates: ["m-2"] });
    assert.deepEqual(changes, [key]);
    unsubscribe();
    context.register("/src/card.tsx", null, { candidates: ["p-8"] });
    assert.deepEqual(changes, [key]);
  });

  it("serves virtual CSS, watches dependencies, and reports missing metadata", () => {
    const defaultPlugin = createTailwindVirtualPlugin(createTailwindContext());
    assert.equal(
      defaultPlugin.load(defaultPlugin.resolveId(TAILWIND_PREFLIGHT_MODULE_ID)),
      '@import "tailwindcss" source(none);',
    );

    const context = createTailwindContext({
      entry: './styles/theme"dark.css',
      sources: ["./src\\**/*.tsx", "package-source"],
    });
    const plugin = createTailwindVirtualPlugin(context);
    plugin.configResolved({ root: "/project" });

    assert.equal(plugin.resolveId("unrelated"), null);
    const preflightId = plugin.resolveId(TAILWIND_PREFLIGHT_MODULE_ID);
    const inlinePreflightId = plugin.resolveId(
      `${TAILWIND_PREFLIGHT_MODULE_ID}?inline`,
    );
    const infrastructureId = plugin.resolveId(
      TAILWIND_INFRASTRUCTURE_MODULE_ID,
    );
    assert.match(preflightId, /^\0@litsx\/tailwind\/preflight\.css$/u);
    assert.match(
      inlinePreflightId,
      /^\0@litsx\/tailwind\/preflight\.css\?inline$/u,
    );
    assert.match(
      plugin.load(inlinePreflightId),
      /@import .*theme\\"dark\.css/u,
    );
    assert.match(plugin.load(preflightId), /@import .*theme\\"dark\.css/u);
    assert.match(
      plugin.load(infrastructureId),
      /@source .*src\\\\\*\*\/\*\.tsx/u,
    );
    assert.match(plugin.load(infrastructureId), /@source "package-source"/u);

    const key = context.register("/src/card.tsx", "Card", {
      candidates: ['content-["quoted"]', "p-4"],
      dependencies: ["/src/tokens.js"],
      mode: "scoped",
      scope: '[data-scope="card"]',
    });
    const componentId = plugin.resolveId(
      `${TAILWIND_COMPONENT_MODULE_PREFIX}${key}.css`,
    );
    const watched = [];
    const component = plugin.load.call(
      {
        addWatchFile(file) {
          watched.push(file);
        },
      },
      `${componentId}?inline`,
    );
    assert.deepEqual(watched, ["/src/tokens.js"]);
    assert.match(component, /@scope \(\[data-scope="card"\]\)/u);
    assert.match(component, /content-\[\\"quoted\\"\]/u);
    assert.equal(plugin.load("\0@litsx/tailwind/component/not-css"), null);

    const shadowKey = context.register("/src/shadow.tsx", "Shadow", {
      candidates: ["p-2"],
      mode: "shadow",
    });
    const shadowId = plugin.resolveId(
      `${TAILWIND_COMPONENT_MODULE_PREFIX}${shadowKey}.css`,
    );
    assert.match(
      plugin.load.call({ addWatchFile() {} }, shadowId),
      /@tailwind utilities source\(none\);/u,
    );

    const missingId = plugin.resolveId(
      `${TAILWIND_COMPONENT_MODULE_PREFIX}missing.css`,
    );
    assert.throws(
      () =>
        plugin.load.call(
          {
            error(message) {
              throw new Error(message);
            },
          },
          missingId,
        ),
      /Missing Tailwind component metadata/u,
    );
  });

  it("invalidates matching component modules and emits both HMR update types", () => {
    const context = createTailwindContext();
    const plugin = createTailwindVirtualPlugin(context);
    const key = context.register("/src/card.tsx", "Card", {
      candidates: ["p-4"],
      mode: "shadow",
    });
    context.register("/src/card.tsx", "Card", {
      candidates: ["px-4"],
      mode: "shadow",
    });
    const prefix = `\0@litsx/tailwind/component/${key}.css`;
    const inlineModule = { id: `${prefix}?inline`, url: "/inline.js" };
    const cssModule = { id: prefix, url: "/style.css" };
    const invalidated = [];
    const messages = [];
    plugin.configureServer({
      moduleGraph: {
        idToModuleMap: new Map([
          ["inline", inlineModule],
          ["css", cssModule],
          ["empty", { id: null, url: "/empty" }],
          ["other", { id: "\0other", url: "/other" }],
        ]),
        invalidateModule(module) {
          invalidated.push(module);
        },
      },
      ws: {
        send(message) {
          messages.push(message);
        },
      },
    });
    context.register("/src/card.tsx", "Card", {
      candidates: ["m-2"],
      mode: "shadow",
    });
    assert.deepEqual(invalidated, [inlineModule, cssModule]);
    assert.deepEqual(
      messages[0].updates.map((update) => update.type),
      ["js-update", "css-update"],
    );

    context.register("/src/other.tsx", "Other", { candidates: ["p-1"] });
    context.register("/src/other.tsx", "Other", { candidates: ["p-2"] });
    assert.equal(messages.length, 1);
  });

  it("removes component property infrastructure and composes public adapters", async () => {
    const cleanup = createTailwindPropertyCleanupPlugin();
    assert.equal(await cleanup.transform(".x {}", "plain.css"), null);
    assert.equal(
      await cleanup.transform(".x {}", "\0@litsx/tailwind/component/key.css"),
      null,
    );
    const transformed = await cleanup.transform(
      "@property --x { syntax: '<number>'; } @layer properties { .x {} } @layer utilities { .y {} }",
      "\0@litsx/tailwind/component/key.css",
    );
    assert.doesNotMatch(transformed.code, /@property|@layer properties/u);
    assert.match(transformed.code, /@layer utilities/u);
    assert.equal(transformed.map, null);

    const compiler = withTailwindViteCompiler(
      { authoringPlugins: [], outputPlugins: [] },
      { safelist: ["p-4"] },
    );
    assert.equal(compiler.authoringPlugins.length, 1);
    assert.equal(compiler.outputPlugins.length, 1);

    const plugins = litsxTailwind({
      litsx: {},
      tailwind: { optimize: false },
      integration: { entry: "tailwindcss" },
    }).flat(Infinity);
    assert(plugins.some((plugin) => plugin.name === "litsx"));
    assert(plugins.some((plugin) => plugin.name === "@tailwindcss/vite:scan"));
    assert(
      plugins.some((plugin) => plugin.name === "litsx:tailwind-virtual-css"),
    );
    assert(
      litsxTailwind()
        .flat(Infinity)
        .some((plugin) => plugin.name === "litsx"),
    );
  });
});
