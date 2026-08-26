import assert from "node:assert";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "vitest";
import { build, createServer } from "vite";
import { rollup } from "rollup";
import { presetWind3, presetWind4 } from "unocss";
import { html } from "lit";

import { transformLitsxSync } from "../packages/compiler/src/index.js";
import {
  createUnoCssIntegration,
  decodeUnoCssGuardPayload,
  UNO_CSS_GUARD_PATTERN,
  UNO_CSS_PREFLIGHT_MODULE_ID,
  withUnoCssCompiler,
} from "../packages/unocss/src/index.js";
import { litsxUnoCss } from "../packages/unocss/src/vite.js";
import { createUnoCssVitePlugins } from "../packages/unocss/src/vite.js";
import { withUnoCssViteCompiler } from "../packages/unocss/src/vite.js";
import { renderToString } from "../packages/ssr/src/index.js";
import { withLitsxStorybookViteConfig } from "../packages/storybook/src/index.js";

const MULTI_COMPONENT_SOURCE = `
import { css } from "@litsx/core";

export function ActionButton() {
  return <button class="px-4 bg-red-500 text-white">Save</button>;
}

ActionButton.styles = css\`:host { display: inline-block; }\`;

export function InfoCard() {
  return <article class="p-8 shadow-lg">Details</article>;
}
`;

function count(source, needle) {
  return source.split(needle).length - 1;
}

async function loadViteGlobalCss(server) {
  const resolved = await server.pluginContainer.resolveId("virtual:uno.css");
  assert(resolved, "expected Vite to resolve the global UnoCSS module");
  const loaded = await server.pluginContainer.load(resolved.id);
  return typeof loaded === "string" ? loaded : (loaded?.code ?? "");
}

function createWorkspaceTempDirectory(prefix) {
  const tempRoot = path.join(process.cwd(), "test-results");
  fs.mkdirSync(tempRoot, { recursive: true });
  return fs.mkdtempSync(path.join(tempRoot, prefix));
}

async function buildFixture(
  source,
  {
    ssr = false,
    preset = presetWind3(),
    unoCss = {},
    litsx: litsxOptions = {},
  } = {},
) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "litsx-unocss-"));
  const entry = path.join(directory, "entry.tsx");
  fs.writeFileSync(entry, source, "utf8");

  try {
    const result = await build({
      configFile: false,
      root: directory,
      logLevel: "silent",
      plugins: litsxUnoCss({
        litsx: litsxOptions,
        unocss: {
          presets: [preset],
          preflights: [],
          ...unoCss,
        },
      }),
      build: {
        write: false,
        minify: false,
        sourcemap: true,
        ...(ssr
          ? { ssr: entry }
          : {
              lib: {
                entry,
                formats: ["es"],
                fileName: "entry",
              },
            }),
        rollupOptions: {
          external(id) {
            return (
              id === "lit" || id.startsWith("lit/") || id.startsWith("@litsx/")
            );
          },
        },
      },
    });

    const outputs = Array.isArray(result)
      ? result.flatMap((entry) => entry.output)
      : result.output;
    const chunk = outputs.find(
      (entry) => entry.type === "chunk" && entry.isEntry,
    );
    assert(chunk, "expected Vite to emit an entry chunk");
    chunk.css = outputs
      .filter(
        (entry) => entry.type === "asset" && entry.fileName.endsWith(".css"),
      )
      .map((entry) => String(entry.source))
      .join("\n");
    return chunk;
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
}

async function buildGuardFixture(files, entryName = "entry.tsx") {
  const directory = fs.mkdtempSync(
    path.join(os.tmpdir(), "litsx-unocss-guards-"),
  );
  for (const [name, source] of Object.entries(files)) {
    const filename = path.join(directory, name);
    fs.mkdirSync(path.dirname(filename), { recursive: true });
    fs.writeFileSync(filename, source, "utf8");
  }
  try {
    const result = await build({
      configFile: false,
      root: directory,
      logLevel: "silent",
      plugins: litsxUnoCss({
        unocss: { presets: [presetWind4()], preflights: [] },
      }),
      build: {
        write: false,
        minify: false,
        lib: {
          entry: path.join(directory, entryName),
          formats: ["es"],
          fileName: "entry",
        },
        rollupOptions: {
          external(id) {
            return (
              id === "lit" || id.startsWith("lit/") || id.startsWith("@litsx/")
            );
          },
        },
      },
    });
    const outputs = Array.isArray(result)
      ? result.flatMap((item) => item.output)
      : result.output;
    return outputs
      .filter((item) => item.type === "chunk")
      .map((item) => item.code)
      .join("\n");
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
}

async function buildExternalConfigFixture() {
  const directory = fs.mkdtempSync(
    path.join(os.tmpdir(), "litsx-unocss-config-"),
  );
  const entry = path.join(directory, "entry.tsx");
  fs.writeFileSync(
    entry,
    `
import "virtual:uno.css";
export function BrandCard() {
  return <article class="bg-brand">Configured</article>;
}
`,
    "utf8",
  );
  fs.writeFileSync(
    path.join(directory, "uno.config.mjs"),
    `
export default {
  preflights: [{
    layer: "theme",
    getCSS: () => ":host{--brand-color:rgb(12 34 56);}",
  }],
  rules: [["bg-brand", { background: "var(--brand-color)" }]],
};
`,
    "utf8",
  );

  try {
    const result = await build({
      configFile: false,
      root: directory,
      logLevel: "silent",
      plugins: litsxUnoCss(),
      build: {
        write: false,
        minify: false,
        lib: { entry, formats: ["es"], fileName: "entry" },
        rollupOptions: {
          external(id) {
            return (
              id === "lit" || id.startsWith("lit/") || id.startsWith("@litsx/")
            );
          },
        },
      },
    });
    const outputs = Array.isArray(result)
      ? result.flatMap((item) => item.output)
      : result.output;
    return outputs
      .map((item) => (item.type === "chunk" ? item.code : String(item.source)))
      .join("\n");
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
}

async function buildMultiEntryFixture() {
  const directory = fs.mkdtempSync(
    path.join(os.tmpdir(), "litsx-unocss-entries-"),
  );
  const action = path.join(directory, "action.tsx");
  const card = path.join(directory, "card.tsx");
  fs.writeFileSync(
    action,
    `
export function ActionButton() {
  return <button class="px-4 bg-red-500">Save</button>;
}
`,
    "utf8",
  );
  fs.writeFileSync(
    card,
    `
export function InfoCard() {
  return <article class="p-8 shadow-lg">Details</article>;
}
`,
    "utf8",
  );

  try {
    const result = await build({
      configFile: false,
      root: directory,
      logLevel: "silent",
      plugins: litsxUnoCss({ unocss: { presets: [presetWind3()] } }),
      build: {
        write: false,
        minify: false,
        rollupOptions: {
          input: { action, card },
          external(id) {
            return (
              id === "lit" || id.startsWith("lit/") || id.startsWith("@litsx/")
            );
          },
        },
      },
    });
    const outputs = Array.isArray(result)
      ? result.flatMap((item) => item.output)
      : result.output;
    return outputs
      .filter((item) => item.type === "chunk")
      .map((item) => item.code)
      .join("\n");
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
}

async function buildCrossModuleFixture() {
  const directory = fs.mkdtempSync(
    path.join(os.tmpdir(), "litsx-unocss-shared-"),
  );
  const entry = path.join(directory, "entry.ts");
  fs.writeFileSync(
    path.join(directory, "action.tsx"),
    `
export function ActionButton() {
  return <button class="px-4 bg-red-500">Save</button>;
}
`,
    "utf8",
  );
  fs.writeFileSync(
    path.join(directory, "card.tsx"),
    `
export function InfoCard() {
  return <article class="p-8 shadow-lg">Details</article>;
}
`,
    "utf8",
  );
  fs.writeFileSync(
    entry,
    `
export { ActionButton } from "./action.tsx";
export { InfoCard } from "./card.tsx";
`,
    "utf8",
  );

  try {
    const result = await build({
      configFile: false,
      root: directory,
      logLevel: "silent",
      plugins: litsxUnoCss({
        unocss: { presets: [presetWind3()] },
      }),
      build: {
        write: false,
        minify: false,
        lib: {
          entry,
          formats: ["es"],
          fileName: "entry",
        },
        rollupOptions: {
          external(id) {
            return (
              id === "lit" || id.startsWith("lit/") || id.startsWith("@litsx/")
            );
          },
        },
      },
    });

    const outputs = Array.isArray(result)
      ? result.flatMap((item) => item.output)
      : result.output;
    const chunk = outputs.find((item) => item.type === "chunk" && item.isEntry);
    assert(chunk, "expected Vite to emit an entry chunk");
    return chunk;
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
}

describe("@litsx/unocss integration", () => {
  it("keeps Vite dependencies optional for root integrations", () => {
    const manifest = JSON.parse(
      fs.readFileSync(
        new URL("../packages/unocss/package.json", import.meta.url),
        "utf8",
      ),
    );

    assert.strictEqual(manifest.dependencies.vite, undefined);
    assert.strictEqual(manifest.dependencies["@litsx/vite-plugin"], undefined);
    assert.strictEqual(manifest.peerDependenciesMeta.vite.optional, true);
    assert.strictEqual(
      manifest.peerDependenciesMeta["@litsx/vite-plugin"].optional,
      true,
    );
  });

  it("materializes component markup utilities without a Vite plugin", async () => {
    const id = "/virtual/standalone-components.tsx";
    const compiled = transformLitsxSync(
      MULTI_COMPONENT_SOURCE,
      withUnoCssCompiler({ filename: id }),
    );
    const integration = await createUnoCssIntegration({
      presets: [presetWind3()],
      preflights: [],
    });

    const result = await integration.materializeModule(compiled.code, id);

    assert(result);
    assert.match(result.code, /\.bg-red-500\{/);
    assert.match(result.code, /\.p-8\{/);
    assert.deepStrictEqual(result.dependencies, []);
  });

  it("does not treat author-owned placeholder text as compiler output", async () => {
    const integration = await createUnoCssIntegration({
      presets: [presetWind4()],
      preflights: [],
    });
    const sources = [
      'export const value = "@unocss-placeholder";',
      "export const value = `@unocss-placeholder`;",
      "export const value = /@unocss-placeholder/;",
      "// @unocss-placeholder\nexport const value = 1;",
    ];

    for (const [index, source] of sources.entries()) {
      const result = await integration.materializeModule(
        source,
        `/virtual/author-literal-${index}.js`,
      );
      assert.strictEqual(result, null);
    }
  });

  it("preserves author-owned placeholder text while materializing real guards", async () => {
    const id = "/virtual/placeholder-and-component.tsx";
    const compiled = transformLitsxSync(
      `
export const unrelated = "@unocss-placeholder";
export const unrelatedTemplate = \`@unocss-placeholder\`;
export const unrelatedPattern = /@unocss-placeholder/;
// @unocss-placeholder remains author-owned text.
export function GuardedCard() { return <article class="p-4">Card</article>; }
`,
      withUnoCssCompiler({ filename: id }),
    );
    const integration = await createUnoCssIntegration({
      presets: [presetWind4()],
      preflights: [],
    });

    const result = await integration.materializeModule(compiled.code, id);

    assert(result);
    assert.match(result.code, /unrelated = "@unocss-placeholder"/);
    assert.match(result.code, /unrelatedTemplate = `@unocss-placeholder`/);
    assert.match(result.code, /unrelatedPattern = \/@unocss-placeholder\//);
    assert.match(
      result.code,
      /\/\/ @unocss-placeholder remains author-owned text\./,
    );
    assert.match(result.code, /\.p-4\{/);
  });

  it("integrates through a plain Rollup adapter built from the neutral engine", async () => {
    const directory = fs.mkdtempSync(
      path.join(os.tmpdir(), "litsx-unocss-rollup-"),
    );
    const entry = path.join(directory, "entry.tsx");
    const preflightId = "virtual:rollup-unocss-preflight";
    const resolvedPreflightId = `\0${preflightId}`;
    const finalPlaceholder = "__ROLLUP_UNOCSS_PREFLIGHT__";
    fs.writeFileSync(
      entry,
      `
export function RollupCard() {
  return <article class="rounded-lg bg-blue-600 p-5 text-white">Card</article>;
}
`,
      "utf8",
    );

    try {
      const integration = await createUnoCssIntegration({
        presets: [presetWind4()],
      });
      const bundle = await rollup({
        input: entry,
        external(id) {
          return (
            id === "lit" || id.startsWith("lit/") || id.startsWith("@litsx/")
          );
        },
        plugins: [
          {
            name: "test:litsx-unocss-neutral-adapter",
            resolveId(id) {
              return id === preflightId ? resolvedPreflightId : null;
            },
            load(id) {
              return id === resolvedPreflightId
                ? integration.createPreflightModuleSource(finalPlaceholder)
                : null;
            },
            async transform(code, id) {
              if (id !== entry) return null;
              const compiled = transformLitsxSync(
                code,
                withUnoCssCompiler(
                  { filename: id },
                  { preflightModule: preflightId },
                ),
              );
              return integration.materializeModule(compiled.code, id);
            },
            async renderChunk(code) {
              return {
                code: await integration.finalizePreflight(
                  code,
                  finalPlaceholder,
                ),
                map: null,
              };
            },
          },
        ],
      });
      const generated = await bundle.generate({ format: "es" });
      const code = generated.output
        .filter((item) => item.type === "chunk")
        .map((item) => item.code)
        .join("\n");

      assert.match(code, /\.rounded-lg\{/);
      assert.match(code, /\.bg-blue-600\{/);
      assert.doesNotMatch(code, /--colors-blue-600:/);
      assert.match(
        await integration.generatePreflightFor("global"),
        /--colors-blue-600:/,
      );
      assert.doesNotMatch(code, /ROLLUP_UNOCSS_PREFLIGHT/);
      await bundle.close();
    } finally {
      fs.rmSync(directory, { recursive: true, force: true });
    }
  });

  it("owns preflight generation without build-tool lifecycle hooks", async () => {
    const integration = await createUnoCssIntegration({
      presets: [presetWind4()],
    });
    await integration.scan(
      '<button class="bg-blue-600 text-white">Save</button>',
      "/virtual/button.html",
    );

    const preflight = await integration.generatePreflight();
    const moduleSource = integration.createPreflightModuleSource(preflight);

    assert.doesNotMatch(preflight, /--colors-blue-600/);
    assert.doesNotMatch(preflight, /--colors-white/);
    assert.match(
      await integration.generatePreflightFor("global"),
      /--colors-blue-600/,
    );
    assert.match(moduleSource, /export const unoPreflightStyles = css`/);
  });

  it("routes theme preflight globally by default without masking shadow inheritance", async () => {
    const integration = await createUnoCssIntegration({
      presets: [presetWind4()],
    });
    await integration.scan(
      '<button class="bg-blue-600 text-white">Save</button>',
      "/virtual/button.html",
    );

    const componentPreflight = await integration.generatePreflight();
    const globalCss = await integration.generateGlobalCss();

    assert.doesNotMatch(componentPreflight, /--colors-blue-600:/);
    assert.doesNotMatch(componentPreflight, /:root,\s*:host/);
    assert.match(globalCss, /--colors-blue-600:/);
    assert.match(globalCss, /:root,\s*:host/);
  });

  it("allows preflight layers to be routed generically per destination", async () => {
    const integration = await createUnoCssIntegration(
      {
        preflights: [
          { layer: "tokens", getCSS: () => ":root,:host{--brand:red}" },
          { layer: "reset", getCSS: () => "button{font:inherit}" },
        ],
      },
      {
        preflightLayers: {
          component: ({ layer }) => layer === "reset",
          global: ["tokens"],
        },
      },
    );

    assert.match(await integration.generatePreflight(), /font:inherit/);
    assert.doesNotMatch(await integration.generatePreflight(), /--brand/);
    assert.match(await integration.generateGlobalCss(), /--brand/);
    assert.doesNotMatch(await integration.generateGlobalCss(), /font:inherit/);
  });

  it("generates one global light DOM sheet from the shared token store", async () => {
    const integration = await createUnoCssIntegration({
      presets: [presetWind4()],
    });
    await integration.scan(
      '<main class="p-4 bg-blue-600 text-white">Light DOM</main>',
      "/virtual/page.html",
    );

    const css = await integration.generateGlobalCss();

    assert.match(css, /--colors-blue-600:/);
    assert.match(css, /--colors-white:/);
    assert.match(css, /\.p-4\{/);
    assert.match(css, /\.bg-blue-600\{/);
    assert.match(css, /\.text-white\{/);
  });

  it("refreshes imported class expressions without a Vite module graph", async () => {
    const directory = fs.mkdtempSync(
      path.join(os.tmpdir(), "litsx-unocss-engine-"),
    );
    const styles = path.join(directory, "styles.ts");
    const entry = path.join(directory, "entry.tsx");
    fs.writeFileSync(styles, 'export const BUTTON = "bg-red-600";', "utf8");
    const source = `
import { BUTTON } from "./styles";
export function TestButton() { return <button class={BUTTON}>Save</button>; }
`;
    fs.writeFileSync(entry, source, "utf8");

    try {
      const compiled = transformLitsxSync(
        source,
        withUnoCssCompiler({ filename: entry }),
      );
      const integration = await createUnoCssIntegration({
        presets: [presetWind4()],
        preflights: [],
      });
      const first = await integration.materializeModule(compiled.code, entry);

      assert.match(first.code, /background-color/);
      assert.deepStrictEqual(integration.invalidate(styles), [entry]);

      fs.writeFileSync(styles, 'export const BUTTON = "bg-green-600";', "utf8");
      const second = await integration.materializeModule(compiled.code, entry);
      assert.match(second.code, /--un-bg-opacity/);
      assert.notStrictEqual(second.code, first.code);
    } finally {
      fs.rmSync(directory, { recursive: true, force: true });
    }
  });

  it("attaches an isolated markup stylesheet to every component in a module", () => {
    const result = transformLitsxSync(
      MULTI_COMPONENT_SOURCE,
      withUnoCssCompiler({
        filename: "/virtual/components.tsx",
        sourceMaps: true,
      }),
    );

    assert.strictEqual(count(result.code, "__LITSX_UNOCSS_GUARD_"), 2);
    assert.match(
      result.code,
      /static styles = \[super\.styles \?\? \[\], css`[\s\S]*?`, _litsxUnoCssStyles\];/,
    );
    assert.match(
      result.code,
      /class InfoCard[\s\S]*?static styles = \[super\.styles \?\? \[\], _litsxUnoCssStyles2\];/,
    );
    assert.deepStrictEqual(result.metadata.litsxStyleIntegrations, [
      {
        name: "unocss",
        strategy: "component-isolated",
        components: ["ActionButton", "InfoCard"],
      },
    ]);
    assert(result.map);
    assert.deepStrictEqual(result.map.sources, ["/virtual/components.tsx"]);
  });

  it("isolates markup and explicit style guards between components", async () => {
    const source = `
const FIRST_SIZES = { sm: "w-8", lg: "w-12" };
const SECOND_SIZES = { sm: "h-8", lg: "h-12" };
const UNUSED = { danger: "bg-pink-500" };

export function FirstCard({ size = "sm" }) {
  return <article class={FIRST_SIZES[size]}><span class="text-red-500">First</span></article>;
}
FirstCard.styles = [FIRST_SIZES];

export function SecondCard({ size = "sm" }) {
  return <article class={SECOND_SIZES[size]}><span class="text-blue-500">Second</span></article>;
}
SecondCard.styles = [SECOND_SIZES];
`;
    const directory = fs.mkdtempSync(
      path.join(os.tmpdir(), "litsx-unocss-isolation-"),
    );
    const filename = path.join(directory, "isolated-components.tsx");
    fs.writeFileSync(filename, source, "utf8");
    let materialized;
    try {
      const compiled = transformLitsxSync(
        source,
        withUnoCssCompiler({ filename }),
      );
      const integration = await createUnoCssIntegration({
        presets: [presetWind4()],
        preflights: [],
      });
      materialized = await integration.materializeModule(
        compiled.code,
        filename,
      );
    } finally {
      fs.rmSync(directory, { recursive: true, force: true });
    }

    const firstStart = materialized.code.indexOf("const _litsxUnoCssStyles =");
    const secondStart = materialized.code.indexOf(
      "const _litsxUnoCssStyles2 =",
    );
    const firstRegion = materialized.code.slice(firstStart, secondStart);
    const secondRegion = materialized.code.slice(secondStart);

    assert(firstStart > -1 && secondStart > firstStart);
    assert.match(firstRegion, /\.w-8\{/);
    assert.match(firstRegion, /\.w-12\{/);
    assert.match(firstRegion, /\.text-red-500\{/);
    assert.doesNotMatch(firstRegion, /\.h-8\{|\.h-12\{|\.text-blue-500\{/);
    assert.match(secondRegion, /\.h-8\{/);
    assert.match(secondRegion, /\.h-12\{/);
    assert.match(secondRegion, /\.text-blue-500\{/);
    assert.doesNotMatch(secondRegion, /\.w-8\{|\.w-12\{|\.text-red-500\{/);
    assert.doesNotMatch(materialized.code, /\.bg-pink-500\{/);
  });

  it("uses the same output hook for SSR compilation", () => {
    const result = transformLitsxSync(
      MULTI_COMPONENT_SOURCE,
      withUnoCssCompiler({
        filename: "/virtual/components.tsx",
        ssr: true,
      }),
    );

    assert.strictEqual(count(result.code, "__LITSX_UNOCSS_GUARD_"), 2);
    assert.match(result.code, /class ActionButton/);
    assert.match(result.code, /class InfoCard/);
  });

  it("composes the shared Vite preflight before authored and utility styles", () => {
    const result = transformLitsxSync(
      MULTI_COMPONENT_SOURCE,
      withUnoCssViteCompiler({ filename: "/virtual/components.tsx" }),
    );

    assert.match(
      result.code,
      new RegExp(`from ["']${UNO_CSS_PREFLIGHT_MODULE_ID}["']`),
    );
    assert.match(result.code, /import ["']virtual:uno\.css["'];/);
    assert.match(
      result.code,
      /static styles = \[_litsxUnoCssPreflight, super\.styles \?\? \[\], css`[\s\S]*?`, _litsxUnoCssStyles\];/,
    );
    assert.match(
      result.code,
      /class InfoCard[\s\S]*?static styles = \[_litsxUnoCssPreflight, super\.styles \?\? \[\], _litsxUnoCssStyles2\];/,
    );
    assert.deepStrictEqual(result.metadata.litsxStyleIntegrations, [
      {
        name: "unocss",
        strategy: "shared-preflight-component-utilities",
        components: ["ActionButton", "InfoCard"],
      },
    ]);

    const frameworkOwnedGlobal = transformLitsxSync(
      MULTI_COMPONENT_SOURCE,
      withUnoCssViteCompiler(
        { filename: "/virtual/framework-owned.tsx" },
        { globalCssModule: false },
      ),
    );
    assert.doesNotMatch(
      frameworkOwnedGlobal.code,
      /import ["']virtual:uno\.css["'];/,
    );
  });

  it("composes with existing output plugins and is idempotent", () => {
    const metadataPlugin = () => ({
      visitor: {
        Program(_path, state) {
          state.file.metadata.preexistingIntegration = true;
        },
      },
    });
    const firstOptions = withUnoCssCompiler({
      filename: "/virtual/components.tsx",
      outputPlugins: [metadataPlugin],
    });
    const result = transformLitsxSync(
      MULTI_COMPONENT_SOURCE,
      withUnoCssCompiler(firstOptions),
    );

    assert.strictEqual(count(result.code, "__LITSX_UNOCSS_GUARD_"), 2);
    assert.strictEqual(result.metadata.preexistingIntegration, true);
  });

  it("does not modify modules without generated LitSX components", () => {
    const source = `export const answer: number = 42;`;
    const result = transformLitsxSync(
      source,
      withUnoCssCompiler({ filename: "/virtual/constants.ts" }),
    );

    assert.doesNotMatch(result.code, /litsxUnoCssStyles/);
    assert.strictEqual(result.metadata.litsxStyleIntegrations, undefined);
  });

  it("orders arbitrary Storybook post-processors after LitSX", () => {
    const unoPlugins = createUnoCssVitePlugins({
      presets: [presetWind3()],
      preflights: [],
    });
    const config = withLitsxStorybookViteConfig(
      { plugins: [{ name: "existing" }] },
      withUnoCssCompiler(),
      { afterLitsx: unoPlugins },
    );
    const names = config.plugins.map((plugin) => plugin.name);

    assert(names.indexOf("existing") < names.indexOf("litsx"));
    assert(
      names.indexOf("litsx") < names.indexOf("litsx:unocss-guard-materializer"),
    );
    assert.strictEqual(names.includes("unocss:shadow-dom"), false);
  });

  it("also contributes styles to light DOM components", () => {
    const source = `
export function LightCard() {
  return <article class="p-4 text-blue-600">Light</article>;
}
LightCard.lightDom = true;
`;
    const result = transformLitsxSync(
      source,
      withUnoCssCompiler({ filename: "/virtual/light-card.tsx" }),
    );

    assert.match(
      result.code,
      /class LightCard extends LightDomMixin\(LitElement\)/,
    );
    assert.match(result.code, /litsx\.lightDomStyleScope/);
    assert.match(
      result.code,
      /static styles = \[super\.styles \?\? \[\], _litsxUnoCssScopedStyles\];/,
    );
  });

  it("routes generated light DOM styles through scoped, global and none modes", async () => {
    const source = `
export function LightCard() {
  return <article class="p-4 text-blue-600">Light</article>;
}
LightCard.lightDom = true;
`;
    const compile = (strategy) =>
      transformLitsxSync(
        source,
        withUnoCssCompiler({
          filename: `/virtual/light-card-${strategy}.tsx`,
          lightDomStyles: strategy,
        }),
      );
    const scoped = compile("scoped");
    const global = compile("global");
    const none = compile("none");
    const integrationGlobal = transformLitsxSync(
      source,
      withUnoCssCompiler(
        { filename: "/virtual/light-card-integration-global.tsx" },
        { lightDomStyles: "global" },
      ),
    );
    const integration = await createUnoCssIntegration({
      presets: [presetWind4()],
      preflights: [],
    });
    const materialized = await integration.materializeModule(
      scoped.code,
      "/virtual/light-card-scoped.tsx",
    );

    assert.match(materialized.code, /@scope \(\[data-litsx-style-scope=/);
    assert.match(materialized.code, /\.p-4\{/);
    assert.match(materialized.code, /\.text-blue-600\{/);
    assert.doesNotMatch(global.code, /static styles|lightDomStyleScope/);
    assert.doesNotMatch(none.code, /static styles|lightDomStyleScope/);
    assert.doesNotMatch(
      integrationGlobal.code,
      /static styles|lightDomStyleScope/,
    );
  });

  it("routes component-owned light DOM guards through the selected mode", () => {
    const source = `
const sizes = { lg: "m-9" };
export function LightCard({ size = "lg" }) {
  return <article class={sizes[size]}>Light</article>;
}
LightCard.lightDom = true;
LightCard.styles = [sizes];
`;
    const compilePayloads = (strategy) => {
      const result = transformLitsxSync(
        source,
        withUnoCssCompiler({
          filename: `/virtual/guarded-light-${strategy}.tsx`,
          lightDomStyles: strategy,
        }),
      );
      return [
        ...result.code.matchAll(new RegExp(UNO_CSS_GUARD_PATTERN.source, "g")),
      ].map((match) => decodeUnoCssGuardPayload(match[1]));
    };
    const scoped = compilePayloads("scoped");
    const global = compilePayloads("global");
    const none = compilePayloads("none");

    assert(scoped.length >= 2);
    assert(
      scoped.every((payload) =>
        payload.scope?.includes("data-litsx-style-scope"),
      ),
    );
    assert(global.some((payload) => payload.emit === "global"));
    assert(none.some((payload) => payload.emit === "none"));
  });

  it("works through the optional react-compat pipeline", () => {
    const source = `
import React from "react";
export function CompatButton({ active }) {
  return (
    <button className={active ? "bg-green-500" : "bg-gray-500"}>
      Compat
    </button>
  );
}
`;
    const result = transformLitsxSync(
      source,
      withUnoCssCompiler({
        filename: "/virtual/compat-button.tsx",
        reactCompat: true,
      }),
    );
    const shadowResult = transformLitsxSync(
      source,
      withUnoCssCompiler({
        filename: "/virtual/compat-button-shadow.tsx",
        reactCompat: { domMode: "shadow" },
      }),
    );

    assert.match(result.code, /class CompatButton/);
    assert.doesNotMatch(result.code, /static styles|lightDomStyleScope/);
    assert.match(result.code, /bg-green-500/);
    assert.match(result.code, /bg-gray-500/);
    assert.strictEqual(count(shadowResult.code, "__LITSX_UNOCSS_GUARD_"), 1);
    assert.match(
      shadowResult.code,
      /static styles = \[super\.styles \?\? \[\], _litsxUnoCssStyles\];/,
    );
  });

  it("consumes local object, tuple, nested, template and finite-map guards before runtime", () => {
    const source = `
import { css } from "@litsx/core";
const BASE = "inline-flex items-center";
const SIZES = {
  sm: \`\${BASE} h-8 px-3\`,
  lg: \`\${BASE} h-12 px-6\`,
} as const;
const VARIANTS = ["bg-blue-600", ["data-[busy=true]:opacity-50"]] as const;
export function GuardedButton({ size }) {
  return <button class={SIZES[size]}>Save</button>;
}
GuardedButton.styles = [[SIZES, ...VARIANTS], css\`:host { display: block; }\`];
`;
    const result = transformLitsxSync(
      source,
      withUnoCssCompiler({ filename: "/virtual/guarded-button.tsx" }),
    );

    assert.match(result.code, /__LITSX_UNOCSS_GUARD_/);
    assert.match(result.code, /display: block/);
    assert.doesNotMatch(
      result.code,
      /__litsxResolveStaticValue\(\[\[SIZES, VARIANTS\]/,
    );
    const stylesStart = result.code.indexOf("static styles =");
    const stylesEnd = result.code.indexOf("static [Symbol", stylesStart);
    const runtimeStyles = result.code.slice(stylesStart, stylesEnd);
    assert(runtimeStyles);
    assert.doesNotMatch(runtimeStyles, /\b(?:SIZES|VARIANTS)\b/);
  });

  it("consumes guards inside replaceStyles without restoring inherited styles", () => {
    const source = `
import { css, replaceStyles } from "@litsx/core";
const SIZES = { sm: "h-8 px-3", lg: "h-12 px-6" } as const;
export function IsolatedButton({ size }) {
  return <button class={SIZES[size]}>Save</button>;
}
IsolatedButton.styles = replaceStyles([SIZES, css\`:host { all: initial; }\`]);
`;
    const result = transformLitsxSync(
      source,
      withUnoCssCompiler({ filename: "/virtual/isolated-button.tsx" }),
    );

    const classOutput = result.code.slice(
      result.code.indexOf("class IsolatedButton"),
    );
    assert.match(
      classOutput,
      /static styles = \[css`\/\*__LITSX_UNOCSS_GUARD_/,
    );
    assert.match(classOutput, /all: initial/);
    assert.match(classOutput, /_litsxUnoCssStyles/);
    assert.doesNotMatch(classOutput, /super\.styles|replaceStyles\(/);
  });

  it("resolves named aliases, reexports, barrels and transitive export dependencies", async () => {
    const code = await buildGuardFixture({
      "base.ts": `export const BASE = "inline-flex items-center";`,
      "button.ts": `
import { BASE } from "./base";
export const BUTTON = {
  sm: \`\${BASE} h-8 px-3 text-sm\`,
  lg: \`\${BASE} h-12 px-6 text-lg\`,
};
export const CARD = { base: "rounded-xl shadow-xl" };
`,
      "index.ts": `export { BUTTON as BUTTON_CLASSES, CARD } from "./button";`,
      "entry.tsx": `
import { css } from "@litsx/core";
import { BUTTON_CLASSES as SIZES } from "./index";
export function GuardedButton({ size = "sm" }) {
  return <button class={SIZES[size]}>Save</button>;
}
GuardedButton.styles = [SIZES, css\`:host{display:inline-block}\`];
`,
    });

    assert.match(code, /\.h-8\{/);
    assert.match(code, /\.px-6\{/);
    assert.match(code, /\.inline-flex\{/);
    assert.doesNotMatch(code, /\.shadow-xl\{/);
    assert.doesNotMatch(code, /__LITSX_UNOCSS_GUARD_/);
  });

  it("generates arbitrary variants owned by an imported guard", async () => {
    const code = await buildGuardFixture({
      "states.ts": `
export const STATES = {
  large: "data-[size=lg]:h-12",
  primary: "data-[appearance=primary]:bg-blue-600",
};
`,
      "entry.tsx": `
import { STATES } from "./states";
export function TestAction() {
  return <button class={STATES.primary} data-appearance="primary">Save</button>;
}
TestAction.styles = [STATES];
`,
    });

    assert(code.includes(".data-\\\\[size"));
    assert(code.includes(".data-\\\\[appearance"));
    assert.match(code, /background-color/);
  });

  it("diagnoses non-static guards and protects against dependency cycles", () => {
    assert.throws(
      () =>
        transformLitsxSync(
          `
const DYNAMIC = makeStyles();
export function TestBad() { return <div />; }
TestBad.styles = [DYNAMIC];
`,
          withUnoCssCompiler({ filename: "/virtual/bad.tsx" }),
        ),
      /could not statically resolve.*unsupported CallExpression/s,
    );

    const directory = fs.mkdtempSync(
      path.join(os.tmpdir(), "litsx-unocss-cycle-"),
    );
    const entry = path.join(directory, "entry.tsx");
    fs.writeFileSync(
      path.join(directory, "a.ts"),
      `import { B } from "./b"; export const A = B;`,
    );
    fs.writeFileSync(
      path.join(directory, "b.ts"),
      `import { A } from "./a"; export const B = A;`,
    );
    fs.writeFileSync(
      entry,
      `
import { A } from "./a";
export function TestCyclic() { return <div />; }
TestCyclic.styles = [A];
`,
    );
    try {
      assert.throws(
        () =>
          transformLitsxSync(
            fs.readFileSync(entry, "utf8"),
            withUnoCssCompiler({ filename: entry }),
          ),
        /cyclic (?:static|export) dependency/,
      );
    } finally {
      fs.rmSync(directory, { recursive: true, force: true });
    }
  });

  it("keeps export ownership across multiple guards, components and shared guards", () => {
    const source = `
const BUTTON = { base: "inline-flex", danger: "bg-red-600" };
const CARD = { base: "rounded-xl", raised: "shadow-xl" };
export function TestFirst() { return <button class={BUTTON.base}>TestFirst</button>; }
TestFirst.styles = [BUTTON, CARD.raised ? "ring-2" : "ring-1"];
export function TestSecond() { return <article class={CARD.base}>TestSecond</article>; }
TestSecond.styles = [CARD, BUTTON];
`;
    const result = transformLitsxSync(
      source,
      withUnoCssCompiler({ filename: "/virtual/ownership.tsx" }),
    );
    const payloads = [
      ...result.code.matchAll(new RegExp(UNO_CSS_GUARD_PATTERN.source, "g")),
    ]
      .map((match) => decodeUnoCssGuardPayload(match[1]))
      .filter((payload) => payload.candidates.length > 0)
      .map((payload) => payload.candidates);

    const containsExactly = (expected) =>
      payloads.some(
        (candidates) =>
          JSON.stringify([...candidates].sort()) ===
          JSON.stringify([...expected].sort()),
      );
    assert(containsExactly(["inline-flex", "bg-red-600"]));
    assert(containsExactly(["ring-1", "ring-2"]));
    assert(containsExactly(["rounded-xl", "shadow-xl"]));
  });

  it("rejects definite static guards when the UnoCSS authoring integration is absent", () => {
    assert.throws(
      () =>
        transformLitsxSync(
          `
const SIZES = { sm: "h-8" };
export function TestBad() { return <div />; }
TestBad.styles = [SIZES];
`,
          { filename: "/virtual/no-unocss.tsx" },
        ),
      /enable an authoring integration that consumes static style guards/,
    );

    const directory = fs.mkdtempSync(
      path.join(os.tmpdir(), "litsx-unocss-disabled-"),
    );
    const entry = path.join(directory, "entry.tsx");
    fs.writeFileSync(
      path.join(directory, "barrel.ts"),
      `export { SIZES as BUTTON_SIZES } from "./sizes";`,
    );
    fs.writeFileSync(
      path.join(directory, "sizes.ts"),
      `export const SIZES = { sm: "h-8", lg: "h-12" };`,
    );
    fs.writeFileSync(
      entry,
      `
import { BUTTON_SIZES } from "./barrel";
export function BadImport() { return <div />; }
BadImport.styles = [BUTTON_SIZES];
`,
    );
    try {
      assert.throws(
        () =>
          transformLitsxSync(fs.readFileSync(entry, "utf8"), {
            filename: entry,
          }),
        /enable an authoring integration that consumes static style guards/,
      );
    } finally {
      fs.rmSync(directory, { recursive: true, force: true });
    }
  });

  it("materializes real utility CSS after LitSX", async () => {
    const chunk = await buildFixture(MULTI_COMPONENT_SOURCE);

    assert.match(chunk.code, /\.bg-red-500\{/);
    assert.match(chunk.code, /\.p-8\{/);
    assert.match(chunk.code, /\.shadow-lg\{/);
    assert.match(chunk.code, /:host \{ display: inline-block; \}/);
    assert.strictEqual(count(chunk.code, ".bg-red-500{"), 1);
    assert(chunk.map);
    assert(chunk.map.sources.some((source) => source.endsWith("entry.tsx")));
  });

  it("keeps free light DOM utilities global in mixed component modules", async () => {
    const chunk = await buildFixture(
      `
export function InteractiveExample() {
  return <button class="rounded-lg bg-red-500 p-4">Component</button>;
}

export const PaletteStory = {
  render: () => (
    <section class="grid gap-3 rounded-lg border border-blue-500 bg-green-500 p-6">
      Story content
    </section>
  ),
};
`,
      { preset: presetWind4() },
    );

    assert.match(chunk.code, /\.bg-red-500\{/);
    assert.match(chunk.css, /\.gap-3\{/);
    assert.match(chunk.css, /\.rounded-lg\{/);
    assert.match(chunk.css, /\.border-blue-500\{/);
    assert.match(chunk.css, /\.bg-green-500\{/);
    assert.match(chunk.css, /\.p-6\{/);
    assert.doesNotMatch(chunk.css, /\.bg-red-500\{/);
  });

  it("emits one preflight module across independently compiled component modules", async () => {
    const chunk = await buildCrossModuleFixture();

    assert.match(chunk.code, /\.bg-red-500\{/);
    assert.match(chunk.code, /\.shadow-lg\{/);
    assert.strictEqual(count(chunk.code, "/* layer: preflights */"), 1);
    assert.strictEqual(count(chunk.code, "unoPreflightStyles = css`"), 1);
  });

  it("emits a global light DOM stylesheet beside shadow component styles", async () => {
    const directory = fs.mkdtempSync(
      path.join(os.tmpdir(), "litsx-unocss-light-dom-build-"),
    );
    const entry = path.join(directory, "entry.tsx");
    fs.writeFileSync(
      entry,
      `
import "virtual:uno.css";
import { ShadowCard } from "./shadow-card.tsx";
import { LightCard } from "./light-card.tsx";

document.body.innerHTML = '<main class="p-6 bg-blue-600 text-white">Global</main>';
customElements.define("shadow-card", ShadowCard);
customElements.define("light-card", LightCard);
`,
      "utf8",
    );
    fs.writeFileSync(
      path.join(directory, "shadow-card.tsx"),
      `
export function ShadowCard() {
  return <article class="p-4 rounded-lg bg-red-500">Shadow</article>;
}
`,
      "utf8",
    );
    fs.writeFileSync(
      path.join(directory, "light-card.tsx"),
      `
const UNUSED_CLASSES = { danger: "bg-pink-500" };
export function LightCard() {
  return <article class="m-7 bg-green-600">Light</article>;
}
LightCard.lightDom = true;
`,
      "utf8",
    );

    try {
      const result = await build({
        configFile: false,
        root: directory,
        logLevel: "silent",
        plugins: litsxUnoCss({
          litsx: { lightDomStyles: "global" },
          unocss: { presets: [presetWind4()] },
        }),
        build: {
          write: false,
          minify: false,
          lib: { entry, formats: ["es"], fileName: "entry" },
          rollupOptions: {
            external(id) {
              return (
                id === "lit" ||
                id.startsWith("lit/") ||
                id.startsWith("@litsx/")
              );
            },
          },
        },
      });
      const outputs = Array.isArray(result)
        ? result.flatMap((item) => item.output)
        : result.output;
      const css = outputs
        .filter(
          (item) => item.type === "asset" && item.fileName.endsWith(".css"),
        )
        .map((item) => String(item.source))
        .join("\n");
      const js = outputs
        .filter((item) => item.type === "chunk")
        .map((item) => item.code)
        .join("\n");

      assert.match(css, /--colors-blue-600:/);
      assert.match(css, /\.p-6\{/);
      assert.match(css, /\.bg-blue-600\{/);
      assert.match(css, /\.text-white\{/);
      assert.match(css, /\.m-7\{/);
      assert.match(css, /\.bg-green-600\{/);
      assert.doesNotMatch(css, /\.bg-red-500\{/);
      assert.doesNotMatch(css, /\.bg-pink-500\{/);
      assert.match(js, /\.bg-red-500\{/);
      assert.doesNotMatch(js, /@scope \(\[data-litsx-style-scope=/);
      assert.doesNotMatch(css, /LITSX_UNOCSS_LIGHT_DOM_BUILD_PLACEHOLDER/);
    } finally {
      fs.rmSync(directory, { recursive: true, force: true });
    }
  });

  it("keeps Wind4 on-demand theme variables out of component output", async () => {
    const chunk = await buildFixture(
      `
import "virtual:uno.css";
export function WindCard() {
  return <article class="p-4 rounded-lg bg-red-500">Wind 4</article>;
}
`,
      { preset: presetWind4() },
    );

    assert.doesNotMatch(chunk.code, /--colors-red-500:/);
    assert.match(chunk.code, /var\(--spacing\)/);
    assert.match(chunk.code, /var\(--radius-lg\)/);
    assert.match(chunk.code, /var\(--colors-red-500\)/);
    assert.match(chunk.code, /padding:calc\(var\(--spacing\) \* 4\)/);
  });

  it("extracts explicit style maps and JSX ternaries", async () => {
    const chunk = await buildFixture(
      `
const sizes = {
  sm: "h-8 px-3",
  md: "h-10 px-4",
  lg: "h-12 px-6",
};

export function DynamicButton({ size = "md", primary = false }) {
  const classes = sizes[size];
  return (
    <button class={primary ? \`bg-blue-600 \${classes}\` : \`bg-red-600 \${classes}\`}>
      Dynamic
    </button>
  );
}

DynamicButton.styles = [sizes];
`,
      { preset: presetWind4() },
    );

    assert.match(chunk.code, /\.h-8\{/);
    assert.match(chunk.code, /\.h-10\{/);
    assert.match(chunk.code, /\.h-12\{/);
    assert.match(chunk.code, /\.px-3\{/);
    assert.match(chunk.code, /\.px-4\{/);
    assert.match(chunk.code, /\.px-6\{/);
    assert.match(chunk.code, /\.bg-blue-600\{/);
    assert.match(chunk.code, /\.bg-red-600\{/);
  });

  it("extracts finite local class bindings without duplicating them in styles", async () => {
    const source = `
import { css } from "@litsx/core";

const COUNTER_CLASSES =
  "inline-flex min-w-[var(--counter-width)] items-center justify-center";
const COUNTER_HOST_CLASSES = "[--counter-width:1rem]";
const COUNTER_SIZES = {
  sm: "h-8 px-3",
  lg: "h-12 px-6",
};

export function TestCounter({ value = "0" }) {
  return <span class={COUNTER_CLASSES}>{value}</span>;
}

TestCounter.styles = css\`:host { display: inline-flex; }\`;

export function TestCounterGroup({ size = "sm" }) {
  const classes = COUNTER_SIZES[size];
  return (
    <TestCounter
      class={\`\${COUNTER_HOST_CLASSES} \${classes}\`}
      value="2"
    />
  );
}
`;
    const compiled = transformLitsxSync(
      source,
      withUnoCssCompiler({ filename: "/virtual/finite-bindings.tsx" }),
    );
    const payloads = [
      ...compiled.code.matchAll(new RegExp(UNO_CSS_GUARD_PATTERN.source, "g")),
    ].map((match) => decodeUnoCssGuardPayload(match[1]));
    const counter = payloads.find((payload) => payload.owner === "TestCounter");
    const group = payloads.find(
      (payload) => payload.owner === "TestCounterGroup",
    );

    assert(counter);
    assert(group);
    assert(counter.candidates.includes("inline-flex"));
    assert(counter.candidates.includes("min-w-[var(--counter-width)]"));
    assert(!counter.candidates.includes("h-8"));
    assert(group.candidates.includes("[--counter-width:1rem]"));
    assert(group.candidates.includes("h-8"));
    assert(group.candidates.includes("h-12"));
    assert(!group.candidates.includes("inline-flex"));

    const chunk = await buildFixture(source, { preset: presetWind4() });
    assert.match(chunk.code, /\.inline-flex\{/);
    assert.match(chunk.code, /\.min-w-/);
    assert.match(chunk.code, /--counter-width:1rem/);
    assert.match(chunk.code, /\.h-8\{/);
    assert.match(chunk.code, /\.h-12\{/);
    assert.match(chunk.code, /\.px-3\{/);
    assert.match(chunk.code, /\.px-6\{/);
    assert.strictEqual(count(chunk.code, ".inline-flex{"), 1);
  });

  it("does not duplicate local map utilities explicitly owned by Component.styles", async () => {
    const chunk = await buildFixture(
      `
const ICON_ONLY_CLASSES = {
  sm: "w-8 !px-0",
  md: "w-10 !px-0",
  lg: "w-12 !px-0",
};

export function IconButton({ size = "md" }) {
  return <button class={ICON_ONLY_CLASSES[size]}>Icon</button>;
}

IconButton.styles = [ICON_ONLY_CLASSES];
`,
      {
        preset: presetWind4(),
        unoCss: { safelist: ["bg-pink-500"] },
      },
    );

    assert.strictEqual(count(chunk.code, ".w-8{"), 1);
    assert.strictEqual(count(chunk.code, ".w-10{"), 1);
    assert.strictEqual(count(chunk.code, ".w-12{"), 1);
    assert.strictEqual(count(chunk.code, ".\\\\!px-0{"), 1);
    assert.doesNotMatch(chunk.code, /\.bg-pink-500\{/);
  });

  it("materializes only the imported delta of a partially local style guard", async () => {
    const code = await buildGuardFixture({
      "shared.ts": `export const SHARED = "inline-flex items-center";`,
      "entry.tsx": `
import { SHARED } from "./shared";

const SIZES = {
  sm: \`\${SHARED} h-8 px-3\`,
  lg: \`\${SHARED} h-12 px-6\`,
};

export function MixedButton({ size = "sm" }) {
  return <button class={SIZES[size]}>Save</button>;
}

MixedButton.styles = [SIZES];
`,
    });

    assert.strictEqual(count(code, ".inline-flex{"), 1);
    assert.strictEqual(count(code, ".items-center{"), 1);
    assert.strictEqual(count(code, ".h-8{"), 1);
    assert.strictEqual(count(code, ".h-12{"), 1);
    assert.strictEqual(count(code, ".px-3{"), 1);
    assert.strictEqual(count(code, ".px-6{"), 1);
  });

  it("generates Wind4 arbitrary data variants in module styles", async () => {
    const chunk = await buildFixture(
      `
export function VariantButton() {
  return (
    <button
      class="data-[size=lg]:h-12 data-[appearance=primary]:bg-blue-600"
      data-size="lg"
      data-appearance="primary"
    >
      Variant
    </button>
  );
}
`,
      { preset: presetWind4() },
    );

    assert.match(chunk.code, /data-\\\\\[size\\\\=lg\\\\\]/);
    assert.match(chunk.code, /height:calc\(var\(--spacing\) \* 12\)/);
    assert.match(chunk.code, /data-\\\\\[appearance\\\\=primary\\\\\]/);
    assert.match(
      chunk.code,
      /background-color:color-mix\([^;]*--colors-blue-600/,
    );
  });

  it("injects the safelist only into components with non-finite class bindings", async () => {
    const source = `
export function DynamicBox({ color }) {
  return <div class={\`bg-\${color}-600\`}>Dynamic</div>;
}

export function StaticBox() {
  return <div class="p-4 [&>*]:p-2">Static</div>;
}
`;
    const filename = "/virtual/component-safelist.tsx";
    const compiled = transformLitsxSync(
      source,
      withUnoCssCompiler({ filename }),
    );
    const payloads = [
      ...compiled.code.matchAll(new RegExp(UNO_CSS_GUARD_PATTERN.source, "g")),
    ].map((match) => decodeUnoCssGuardPayload(match[1]));
    const dynamicPayload = payloads.find(
      (payload) => payload.owner === "DynamicBox",
    );
    const staticPayload = payloads.find(
      (payload) => payload.owner === "StaticBox",
    );

    assert.deepStrictEqual(dynamicPayload.dynamicPatterns, ["bg-\u0000-600"]);
    assert.deepStrictEqual(staticPayload.dynamicPatterns, []);
    assert(staticPayload.candidates.includes("[&>*]:p-2"));

    const integration = await createUnoCssIntegration({
      presets: [presetWind4()],
      preflights: [],
      safelist: ["bg-red-600", "bg-blue-600", "text-white", "p-8"],
    });
    const materialized = await integration.materializeModule(
      compiled.code,
      filename,
    );
    const dynamicStart = materialized.code.indexOf(
      "const _litsxUnoCssStyles =",
    );
    const staticStart = materialized.code.indexOf(
      "const _litsxUnoCssStyles2 =",
    );
    const dynamicRegion = materialized.code.slice(dynamicStart, staticStart);
    const staticRegion = materialized.code.slice(staticStart);

    assert(dynamicStart > -1 && staticStart > dynamicStart);
    assert.match(dynamicRegion, /\.bg-red-600\{/);
    assert.match(dynamicRegion, /\.bg-blue-600\{/);
    assert.doesNotMatch(dynamicRegion, /\.text-white\{|\.p-8\{/);
    assert.match(staticRegion, /\.p-4\{/);
    assert.doesNotMatch(
      staticRegion,
      /\.bg-red-600\{|\.bg-blue-600\{|\.text-white\{|\.p-8\{/,
    );
  });

  it("uses the resolved external uno.config for utilities and preflight", async () => {
    const code = await buildExternalConfigFixture();

    assert.match(code, /\.bg-brand\{background:var\(--brand-color\);\}/);
    assert.match(code, /--brand-color\s*:/);
  });

  it("shares one preflight chunk across multiple build entrypoints", async () => {
    const code = await buildMultiEntryFixture();

    assert.match(code, /\.bg-red-500\{/);
    assert.match(code, /\.shadow-lg\{/);
    assert.strictEqual(count(code, "/* layer: preflights */"), 1);
    assert.doesNotMatch(code, /__LITSX_UNOCSS_PREFLIGHT_BUILD_PLACEHOLDER__/);
  });

  it("emits the same utility stylesheet through Vite's SSR pipeline", async () => {
    const chunk = await buildFixture(MULTI_COMPONENT_SOURCE, { ssr: true });

    assert.match(chunk.code, /\.bg-red-500\{/);
    assert.match(chunk.code, /\.p-8\{/);
    assert.match(chunk.code, /:host \{ display: inline-block; \}/);
  });

  it("renders generated utility styles through the real SSR renderer", async () => {
    const directory = createWorkspaceTempDirectory("litsx-unocss-ssr-");
    const entry = path.join(directory, "entry.tsx");
    fs.writeFileSync(entry, MULTI_COMPONENT_SOURCE, "utf8");
    const server = await createServer({
      configFile: false,
      root: directory,
      logLevel: "silent",
      appType: "custom",
      server: { middlewareMode: true },
      resolve: {
        alias: [
          {
            find: "@litsx/core/elements",
            replacement: path.resolve("packages/core/src/elements/index.js"),
          },
          {
            find: "@litsx/core",
            replacement: path.resolve("packages/core/src/index.js"),
          },
        ],
      },
      plugins: litsxUnoCss({
        unocss: {
          presets: [presetWind3()],
        },
      }),
    });

    try {
      const module = await server.ssrLoadModule("/entry.tsx");
      const rendered = await renderToString(
        html`<action-button></action-button><info-card></info-card>`,
        {
          elements: {
            "action-button": module.ActionButton,
            "info-card": module.InfoCard,
          },
        },
      );

      assert.match(
        rendered.html,
        /declarative-shadow-root|shadowrootmode="open"/,
      );
      assert.match(rendered.html, /\.bg-red-500\{/);
      assert.match(rendered.html, /\.p-8\{/);
      assert.match(rendered.html, /:host \{ display: inline-block; \}/);
      // A single CSSResult exists in the module graph, but valid declarative
      // Shadow DOM must serialize its CSS once inside each rendered root.
      assert.strictEqual(count(rendered.html, "/* layer: preflights */"), 2);
    } finally {
      await server.close();
      fs.rmSync(directory, { recursive: true, force: true });
    }
  });

  it("serializes the stable light DOM scope for hydration in SSR", async () => {
    const directory = createWorkspaceTempDirectory("litsx-unocss-light-ssr-");
    const entry = path.join(directory, "entry.tsx");
    fs.writeFileSync(
      entry,
      `
export function LightCard() {
  return <article class="p-4 bg-blue-600">Light</article>;
}
LightCard.lightDom = true;
`,
      "utf8",
    );
    const server = await createServer({
      configFile: false,
      root: directory,
      logLevel: "silent",
      appType: "custom",
      server: { middlewareMode: true },
      resolve: {
        alias: [
          {
            find: "@litsx/core/elements",
            replacement: path.resolve("packages/core/src/elements/index.js"),
          },
          {
            find: "@litsx/core",
            replacement: path.resolve("packages/core/src/index.js"),
          },
        ],
      },
      plugins: litsxUnoCss({ unocss: { presets: [presetWind4()] } }),
    });

    try {
      const module = await server.ssrLoadModule("/entry.tsx");
      const rendered = await renderToString(html`<light-card></light-card>`, {
        elements: { "light-card": module.LightCard },
      });

      assert.match(rendered.html, /data-litsx-style-scope="[a-z0-9]+"/);
      assert.doesNotMatch(
        rendered.html,
        /declarative-shadow-root|shadowrootmode/,
      );
    } finally {
      await server.close();
      fs.rmSync(directory, { recursive: true, force: true });
    }
  });

  it("resolves Wind4 theme tokens across SSR component modules", async () => {
    const directory = createWorkspaceTempDirectory("litsx-unocss-wind4-ssr-");
    fs.writeFileSync(
      path.join(directory, "action.tsx"),
      `
export function WindAction() {
  return <button class="p-4 bg-red-500">TestAction</button>;
}
`,
      "utf8",
    );
    fs.writeFileSync(
      path.join(directory, "card.tsx"),
      `
export function WindCard() {
  return <article class="rounded-lg bg-blue-500">Card</article>;
}
`,
      "utf8",
    );
    fs.writeFileSync(
      path.join(directory, "entry.ts"),
      `
export { WindAction } from "./action.tsx";
export { WindCard } from "./card.tsx";
`,
      "utf8",
    );

    const server = await createServer({
      configFile: false,
      root: directory,
      logLevel: "silent",
      appType: "custom",
      server: { middlewareMode: true },
      resolve: {
        alias: [
          {
            find: "@litsx/core/elements",
            replacement: path.resolve("packages/core/src/elements/index.js"),
          },
          {
            find: "@litsx/core",
            replacement: path.resolve("packages/core/src/index.js"),
          },
        ],
      },
      plugins: litsxUnoCss({ unocss: { presets: [presetWind4()] } }),
    });

    try {
      const module = await server.ssrLoadModule("/entry.ts");
      const rendered = await renderToString(
        html`<wind-action></wind-action><wind-card></wind-card>`,
        {
          elements: {
            "wind-action": module.WindAction,
            "wind-card": module.WindCard,
          },
        },
      );

      const globalCss = await loadViteGlobalCss(server);

      assert.doesNotMatch(rendered.html, /--colors-red-500:/);
      assert.doesNotMatch(rendered.html, /--colors-blue-500:/);
      assert.match(globalCss, /--spacing:/);
      assert.match(globalCss, /--radius-lg:/);
      assert.match(globalCss, /--colors-red-500:/);
      assert.match(globalCss, /--colors-blue-500:/);
    } finally {
      await server.close();
      fs.rmSync(directory, { recursive: true, force: true });
    }
  });

  it("updates the development preflight when a later module introduces Wind4 theme tokens", async () => {
    const directory = createWorkspaceTempDirectory(
      "litsx-unocss-wind4-serve-order-",
    );
    fs.writeFileSync(
      path.join(directory, "early.tsx"),
      `
export function EarlyCard() {
  return <article class="p-4">Early</article>;
}
`,
      "utf8",
    );
    const server = await createServer({
      configFile: false,
      root: directory,
      logLevel: "silent",
      appType: "custom",
      server: { middlewareMode: true },
      resolve: {
        alias: [
          {
            find: "@litsx/core/elements",
            replacement: path.resolve("packages/core/src/elements/index.js"),
          },
          {
            find: "@litsx/core",
            replacement: path.resolve("packages/core/src/index.js"),
          },
        ],
      },
      plugins: litsxUnoCss({ unocss: { presets: [presetWind4()] } }),
    });

    try {
      const early = await server.ssrLoadModule("/early.tsx");
      assert.doesNotMatch(early.EarlyCard.styles[0].cssText, /--colors-white:/);

      fs.writeFileSync(
        path.join(directory, "late.tsx"),
        `
export function LateCard() {
  return <article class="text-white">Late</article>;
}
`,
        "utf8",
      );
      const late = await server.ssrLoadModule("/late.tsx");
      const lateCss = late.LateCard.styles
        .flat(Infinity)
        .map((style) => style?.cssText ?? "")
        .join("\n");
      const globalCss = await loadViteGlobalCss(server);
      assert.doesNotMatch(lateCss, /--colors-white:/);
      assert.match(lateCss, /var\(--colors-white\)/);
      assert.match(globalCss, /--colors-white:/);
    } finally {
      await server.close();
      fs.rmSync(directory, { recursive: true, force: true });
    }
  });

  it("invalidates the shared Wind4 preflight when development tokens change", async () => {
    const directory = createWorkspaceTempDirectory("litsx-unocss-hmr-");
    const entry = path.join(directory, "entry.tsx");
    fs.writeFileSync(
      entry,
      `
export function WindCard() {
  return <article class="p-4 bg-red-500">Before</article>;
}
`,
      "utf8",
    );
    const server = await createServer({
      configFile: false,
      root: directory,
      logLevel: "silent",
      appType: "custom",
      server: { middlewareMode: true },
      resolve: {
        alias: [
          {
            find: "@litsx/core/elements",
            replacement: path.resolve("packages/core/src/elements/index.js"),
          },
          {
            find: "@litsx/core",
            replacement: path.resolve("packages/core/src/index.js"),
          },
        ],
      },
      plugins: litsxUnoCss({ unocss: { presets: [presetWind4()] } }),
    });

    try {
      const before = await server.ssrLoadModule("/entry.tsx");
      assert.doesNotMatch(
        before.WindCard.styles[0].cssText,
        /--colors-red-500:/,
      );
      assert.match(await loadViteGlobalCss(server), /--colors-red-500:/);

      fs.writeFileSync(
        entry,
        `
export function WindCard() {
  return <article class="p-8 bg-blue-500">After</article>;
}
      `,
        "utf8",
      );
      server.watcher.emit("change", entry);
      let after;
      // Vite serializes watcher invalidation behind other transforms. Give a
      // loaded full-suite run enough time without weakening the assertion.
      for (let attempt = 0; attempt < 200; attempt += 1) {
        after = await server.ssrLoadModule("/entry.tsx");
        const globalCss = await loadViteGlobalCss(server);
        if (globalCss.includes("--colors-blue-500:")) {
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 25));
      }
      assert.doesNotMatch(
        after.WindCard.styles[0].cssText,
        /--colors-blue-500:/,
      );
      const afterCss = after.WindCard.styles
        .flat(Infinity)
        .map((style) => style?.cssText ?? "")
        .join("\n");
      assert.match(afterCss, /var\(--colors-blue-500\)/);
      const globalCss = await loadViteGlobalCss(server);
      assert.match(globalCss, /--colors-blue-500:/);
      assert.match(globalCss, /--spacing:/);
    } finally {
      await server.close();
      fs.rmSync(directory, { recursive: true, force: true });
    }
  });

  it("re-resolves imported guards and removes obsolete utility rules during HMR", async () => {
    const directory = createWorkspaceTempDirectory("litsx-unocss-guard-hmr-");
    const helper = path.join(directory, "button.styles.ts");
    const entry = path.join(directory, "entry.tsx");
    fs.writeFileSync(
      helper,
      `export const BUTTON = { base: "bg-red-500 h-8" };`,
      "utf8",
    );
    fs.writeFileSync(
      entry,
      `
import { BUTTON } from "./button.styles";
export function WindButton() { return <button class={BUTTON.base}>Save</button>; }
`,
      "utf8",
    );
    const server = await createServer({
      configFile: false,
      root: directory,
      logLevel: "silent",
      appType: "custom",
      server: { middlewareMode: true },
      resolve: {
        alias: [
          {
            find: "@litsx/core/elements",
            replacement: path.resolve("packages/core/src/elements/index.js"),
          },
          {
            find: "@litsx/core",
            replacement: path.resolve("packages/core/src/index.js"),
          },
        ],
      },
      plugins: litsxUnoCss({ unocss: { presets: [presetWind4()] } }),
    });

    try {
      const before = await server.ssrLoadModule("/entry.tsx");
      const readUtilities = (component) =>
        component.styles
          .flat(Infinity)
          .map((style) => style?.cssText ?? "")
          .join("\n");
      assert.match(readUtilities(before.WindButton), /\.bg-red-500\{/);

      fs.writeFileSync(
        helper,
        `export const BUTTON = { base: "bg-blue-500 h-12" };`,
        "utf8",
      );
      server.watcher.emit("change", helper);
      let cssText = "";
      for (let attempt = 0; attempt < 200; attempt += 1) {
        const after = await server.ssrLoadModule("/entry.tsx");
        cssText = readUtilities(after.WindButton);
        if (cssText.includes(".bg-blue-500{")) break;
        await new Promise((resolve) => setTimeout(resolve, 25));
      }
      assert.match(cssText, /\.bg-blue-500\{/);
      assert.match(cssText, /\.h-12\{/);
      assert.doesNotMatch(cssText, /\.bg-red-500\{|\.h-8\{/);
    } finally {
      await server.close();
      fs.rmSync(directory, { recursive: true, force: true });
    }
  });
});
