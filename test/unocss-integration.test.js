import assert from "node:assert";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "vitest";
import { build, createServer } from "vite";
import { presetWind3, presetWind4 } from "unocss";
import { html } from "lit";

import { transformLitsxSync } from "../packages/compiler/src/index.js";
import {
  UNO_CSS_PLACEHOLDER,
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

async function buildFixture(
  source,
  { ssr = false, preset = presetWind3() } = {},
) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "litsx-unocss-"));
  const entry = path.join(directory, "entry.tsx");
  fs.writeFileSync(entry, source, "utf8");

  try {
    const result = await build({
      configFile: false,
      logLevel: "silent",
      plugins: litsxUnoCss({
        unocss: {
          presets: [preset],
          preflights: [],
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
    return chunk;
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
      .filter((item) => item.type === "chunk")
      .map((item) => item.code)
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
  it("attaches one shared stylesheet to every component in a module", () => {
    const result = transformLitsxSync(
      MULTI_COMPONENT_SOURCE,
      withUnoCssCompiler({
        filename: "/virtual/components.tsx",
        sourceMaps: true,
      }),
    );

    assert.strictEqual(count(result.code, UNO_CSS_PLACEHOLDER), 1);
    assert.match(
      result.code,
      /const _litsxUnoCssStyles = css`@unocss-placeholder`;/,
    );
    assert.match(
      result.code,
      /return \[this\.__litsxStatic\([\s\S]*?\), _litsxUnoCssStyles\];/,
    );
    assert.match(
      result.code,
      /class InfoCard[\s\S]*?static styles = _litsxUnoCssStyles;/,
    );
    assert.deepStrictEqual(result.metadata.litsxStyleIntegrations, [
      {
        name: "unocss",
        strategy: "module-shared",
        components: ["ActionButton", "InfoCard"],
      },
    ]);
    assert(result.map);
    assert.deepStrictEqual(result.map.sources, ["/virtual/components.tsx"]);
  });

  it("uses the same output hook for SSR compilation", () => {
    const result = transformLitsxSync(
      MULTI_COMPONENT_SOURCE,
      withUnoCssCompiler({
        filename: "/virtual/components.tsx",
        ssr: true,
      }),
    );

    assert.strictEqual(count(result.code, UNO_CSS_PLACEHOLDER), 1);
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
    assert.match(
      result.code,
      /return \[_litsxUnoCssPreflight, this\.__litsxStatic\([\s\S]*?\), _litsxUnoCssStyles\];/,
    );
    assert.match(
      result.code,
      /class InfoCard[\s\S]*?static styles = \[_litsxUnoCssPreflight, _litsxUnoCssStyles\];/,
    );
    assert.deepStrictEqual(result.metadata.litsxStyleIntegrations, [
      {
        name: "unocss",
        strategy: "shared-preflight-module-utilities",
        components: ["ActionButton", "InfoCard"],
      },
    ]);
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

    assert.strictEqual(count(result.code, UNO_CSS_PLACEHOLDER), 1);
    assert.strictEqual(result.metadata.preexistingIntegration, true);
  });

  it("does not modify modules without generated LitSX components", () => {
    const source = `export const answer: number = 42;`;
    const result = transformLitsxSync(
      source,
      withUnoCssCompiler({ filename: "/virtual/constants.ts" }),
    );

    assert.doesNotMatch(result.code, /unocss-placeholder|litsxUnoCssStyles/);
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
    assert(names.indexOf("litsx") < names.indexOf("unocss:shadow-dom"));
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
    assert.match(result.code, /static styles = _litsxUnoCssStyles;/);
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

    assert.strictEqual(count(result.code, UNO_CSS_PLACEHOLDER), 1);
    assert.match(result.code, /class CompatButton/);
    assert.match(result.code, /static styles = _litsxUnoCssStyles;/);
    assert.match(result.code, /bg-green-500/);
    assert.match(result.code, /bg-gray-500/);
  });

  it("generates real utility CSS after LitSX and removes the placeholder", async () => {
    const chunk = await buildFixture(MULTI_COMPONENT_SOURCE);

    assert.doesNotMatch(chunk.code, /@unocss-placeholder/);
    assert.match(chunk.code, /\.bg-red-500\{/);
    assert.match(chunk.code, /\.p-8\{/);
    assert.match(chunk.code, /\.shadow-lg\{/);
    assert.match(chunk.code, /:host \{ display: inline-block; \}/);
    assert.strictEqual(count(chunk.code, ".bg-red-500{"), 1);
    assert(chunk.map);
    assert(chunk.map.sources.some((source) => source.endsWith("entry.tsx")));
  });

  it("emits one preflight module across independently compiled component modules", async () => {
    const chunk = await buildCrossModuleFixture();

    assert.doesNotMatch(chunk.code, /@unocss-placeholder/);
    assert.match(chunk.code, /\.bg-red-500\{/);
    assert.match(chunk.code, /\.shadow-lg\{/);
    assert.strictEqual(count(chunk.code, "/* layer: preflights */"), 1);
    assert.strictEqual(count(chunk.code, "unoPreflightStyles = css`"), 1);
  });

  it("generates Wind4 on-demand theme variables from the project token set", async () => {
    const chunk = await buildFixture(
      `
export function WindCard() {
  return <article class="p-4 rounded-lg bg-red-500">Wind 4</article>;
}
`,
      { preset: presetWind4() },
    );

    assert.match(chunk.code, /--spacing:/);
    assert.match(chunk.code, /--radius-lg:/);
    assert.match(chunk.code, /--colors-red-500:/);
    assert.match(chunk.code, /padding:calc\(var\(--spacing\) \* 4\)/);
  });

  it("uses the resolved external uno.config for utilities and preflight", async () => {
    const code = await buildExternalConfigFixture();

    assert.match(code, /\.bg-brand\{background:var\(--brand-color\);\}/);
    assert.strictEqual(count(code, ":host{--brand-color:rgb(12 34 56);}"), 1);
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

    assert.doesNotMatch(chunk.code, /@unocss-placeholder/);
    assert.match(chunk.code, /\.bg-red-500\{/);
    assert.match(chunk.code, /\.p-8\{/);
    assert.match(chunk.code, /:host \{ display: inline-block; \}/);
  });

  it("renders generated utility styles through the real SSR renderer", async () => {
    const directory = fs.mkdtempSync(
      path.join(os.tmpdir(), "litsx-unocss-ssr-"),
    );
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
            find: /^lit$/,
            replacement: path.resolve("node_modules/lit/index.js"),
          },
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

      assert.doesNotMatch(rendered.html, /@unocss-placeholder/);
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

  it("resolves Wind4 theme tokens across SSR component modules", async () => {
    const directory = fs.mkdtempSync(
      path.join(os.tmpdir(), "litsx-unocss-wind4-ssr-"),
    );
    fs.writeFileSync(
      path.join(directory, "action.tsx"),
      `
export function WindAction() {
  return <button class="p-4 bg-red-500">Action</button>;
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
            find: /^lit$/,
            replacement: path.resolve("node_modules/lit/index.js"),
          },
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

      assert.match(rendered.html, /--spacing:/);
      assert.match(rendered.html, /--radius-lg:/);
      assert.match(rendered.html, /--colors-red-500:/);
      assert.match(rendered.html, /--colors-blue-500:/);
    } finally {
      await server.close();
      fs.rmSync(directory, { recursive: true, force: true });
    }
  });

  it("invalidates the shared Wind4 preflight when development tokens change", async () => {
    const directory = fs.mkdtempSync(
      path.join(os.tmpdir(), "litsx-unocss-hmr-"),
    );
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
            find: /^lit$/,
            replacement: path.resolve("node_modules/lit/index.js"),
          },
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
      assert.match(before.WindCard.styles[0].cssText, /--colors-red-500:/);

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
        if (after.WindCard.styles[0].cssText.includes("--colors-blue-500:")) {
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 25));
      }
      assert.match(after.WindCard.styles[0].cssText, /--colors-blue-500:/);
      assert.match(after.WindCard.styles[0].cssText, /--spacing:/);
    } finally {
      await server.close();
      fs.rmSync(directory, { recursive: true, force: true });
    }
  });
});
