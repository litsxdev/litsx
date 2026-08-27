import assert from "assert";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, it } from "vitest";
import { transformLitsxSync } from "../packages/compiler/src/index.js";

import {
  createLitsxStorybookConfig,
  litsxStoriesIndexer,
  litsxStoryRegistrationPlugin,
  withLitsxStorybookViteConfig,
} from "../packages/storybook/src/index.js";

const tempDirs = [];

afterEach(() => {
  while (tempDirs.length > 0) {
    fs.rmSync(tempDirs.pop(), { recursive: true, force: true });
  }
});

function createStoryFile(source) {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "litsx-storybook-"));
  const fileName = path.join(tempDir, "catalog.stories.tsx");
  tempDirs.push(tempDir);
  fs.writeFileSync(fileName, source, "utf8");
  return fileName;
}

function createPassingCsfLoader() {
  return () => ({
    parse() {
      return { indexInputs: [] };
    },
  });
}

describe("@litsx/storybook", () => {
  it("indexes an authored LitSX story and preserves Storybook's makeTitle callback", async () => {
    const fileName = createStoryFile(
      [
        'import { CatalogCard } from "../catalog-card.tsx";',
        'export default { title: "Catalog/Card", component: "catalog-card" };',
        "export const Default = { render: () => <CatalogCard /> };",
      ].join("\n"),
    );
    const receivedTitles = [];

    const indexInputs = await litsxStoriesIndexer.createIndex(fileName, {
      makeTitle(title) {
        receivedTitles.push(title);
        return `Store/${title}`;
      },
    });

    assert.deepStrictEqual(receivedTitles, ["Catalog/Card"]);
    assert.ok(indexInputs.length > 0);
    assert.ok(
      indexInputs.every((entry) => entry.title === "Store/Catalog/Card"),
    );
  });

  it("indexes CSF safely when Storybook does not provide makeTitle", async () => {
    const fileName = createStoryFile(
      [
        'import { CatalogCard } from "../catalog-card.tsx";',
        'export default { title: "Catalog/Card", component: "catalog-card" };',
        "export const Default = { render: () => <CatalogCard /> };",
      ].join("\n"),
    );

    const indexInputs = await litsxStoriesIndexer.createIndex(fileName);

    assert.ok(indexInputs.length > 0);
    assert.ok(indexInputs.every((entry) => entry.title === "Catalog/Card"));
  });

  it("accepts an injected CSF loader with no parsed index", async () => {
    const fileName = createStoryFile(
      'export default { title: "Catalog/Empty" }; export const Default = { render: () => <div /> };',
    );
    const plugin = litsxStoryRegistrationPlugin({
      storybookCsfLoader: () => ({ parse: () => null }),
    });
    const transformed = await plugin.transform.handler(fs.readFileSync(fileName, "utf8"), fileName);
    assert.equal(transformed, null);
  });

  it("generates a pretransform that auto-registers imported and local story elements", async () => {
    const plugin = litsxStoryRegistrationPlugin({
      storybookCsfLoader: createPassingCsfLoader(),
    });
    const source = [
      'import { VdsButton, VdsDrawer as DrawerElement, type VdsButtonProps } from "../components/vds-button.tsx";',
      'import { VdsModal } from "../components/vds-modal.tsx";',
      'import type { VdsIgnoredStory } from "../components/vds-ignored-story.tsx";',
      "",
      'export default { title: "Catalog/Button" };',
      "",
      "const VdsDrawerStory = () => <DrawerElement />;",
      "function VdsModalStory() {",
      "  return <VdsModal />;",
      "}",
      'const LocalPanel = () => <VdsButton label="Nested" />;',
      "const NestedHost = () => <LocalPanel />;",
      "",
      "export const Default = {",
      "  render: () => (",
      "    <div>",
      '      <VdsButton label="Buy" />',
      "      <VdsDrawerStory />",
      "      <VdsModalStory />",
      "    </div>",
      "  ),",
      "};",
      "export const Playground = Default;",
      "",
    ].join("\n");
    const storyFile = createStoryFile(source);
    const compiledSource = transformLitsxSync(source, { filename: storyFile }).code;

    const transformed = await plugin.transform.handler(
      compiledSource,
      storyFile,
    );

    assert.strictEqual(plugin.enforce, "post");
    assert.match(
      transformed.code,
      /customElements\.define\("vds-button", __litsxStoryElement2\);/,
    );
    assert.match(
      transformed.code,
      /customElements\.define\("vds-drawer", __litsxStoryElement0\);/,
    );
    assert.match(
      transformed.code,
      /customElements\.define\("vds-modal", __litsxStoryElement1\);/,
    );
    assert.doesNotMatch(
      transformed.code,
      /customElements\.define\("local-panel"/,
    );
    assert.match(
      transformed.code,
      /customElements\.define\("vds-drawer-story", VdsDrawerStory\);/,
    );
    assert.match(
      transformed.code,
      /class VdsDrawerStory extends (?:ShadowDomMixin\()?LitElement/,
    );
    assert.match(
      transformed.code,
      /customElements\.define\("vds-modal-story", VdsModalStory\);/,
    );
    assert.match(
      transformed.code,
      /if \(!customElements\.get\("vds-button"\)\)/,
    );
    assert.doesNotMatch(
      transformed.code,
      /customElements\.define\("vds-button-props", VdsButtonProps\);/,
    );
    assert.doesNotMatch(
      transformed.code,
      /customElements\.define\("vds-ignored-story", VdsIgnoredStory\);/,
    );
    const standardTsx = await plugin.transform.handler(
      compiledSource,
      storyFile,
    );
    assert.match(
      standardTsx.code,
      /customElements\.define\("vds-button", __litsxStoryElement2\);/,
    );
    assert.strictEqual(
      await plugin.transform.handler(source, "/project/src/catalog.tsx"),
      null,
    );
  });

  it("registers more than one imported authored component", async () => {
    const plugin = litsxStoryRegistrationPlugin({
      storybookCsfLoader: createPassingCsfLoader(),
    });
    const source = [
      'import { ProductCard } from "../product-card.tsx";',
      'import { ProductPrice } from "../product-price.tsx";',
      'export default { title: "Catalog/Product" };',
      "export const Default = { render: () => <div><ProductCard /><ProductPrice /></div> };",
    ].join("\n");

    const transformed = await plugin.transform.handler(
      source,
      "/project/catalog.stories.tsx",
    );

    assert.match(
      transformed.code,
      /customElements\.define\("product-card", __litsxStoryElement0\)/,
    );
    assert.match(
      transformed.code,
      /customElements\.define\("product-price", __litsxStoryElement1\)/,
    );
  });

  it("resolves extensionless local imports to authored TSX modules", async () => {
    const source = [
      'import { ProductCard } from "./product-card";',
      'export default { title: "Catalog/Product" };',
      "export const Default = { render: () => <ProductCard /> };",
    ].join("\n");
    const fileName = createStoryFile(source);
    fs.writeFileSync(
      path.join(path.dirname(fileName), "product-card.tsx"),
      "export const ProductCard = () => <article />;",
      "utf8",
    );
    const plugin = litsxStoryRegistrationPlugin({
      storybookCsfLoader: createPassingCsfLoader(),
    });

    const transformed = await plugin.transform.handler(source, fileName);

    assert.match(
      transformed.code,
      /customElements\.define\("product-card", __litsxStoryElement0\)/,
    );
  });

  it("does not resolve removed authored file extensions", async () => {
    const source = [
      'import { ProductCard } from "./product-card";',
      'export default { title: "Catalog/Product" };',
      "export const Default = { render: () => <ProductCard /> };",
    ].join("\n");
    const fileName = createStoryFile(source);
    fs.writeFileSync(
      path.join(path.dirname(fileName), "product-card.litsx"),
      "export const ProductCard = () => <article />;",
      "utf8",
    );
    const plugin = litsxStoryRegistrationPlugin({
      storybookCsfLoader: createPassingCsfLoader(),
    });

    assert.strictEqual(
      await plugin.transform.handler(source, fileName),
      null,
    );
  });

  it("does not register an authored component twice when it already exists", async () => {
    const plugin = litsxStoryRegistrationPlugin({
      storybookCsfLoader: createPassingCsfLoader(),
    });
    const source = [
      'import { ProductCard } from "../product-card.tsx";',
      'export default { title: "Catalog/Product" };',
      "export const Default = { render: () => <ProductCard /> };",
    ].join("\n");
    const transformed = await plugin.transform.handler(
      source,
      "/project/catalog.stories.tsx",
    );
    const registrationSource = transformed.code
      .slice(source.length)
      .split("\n")
      .filter((line) => line.startsWith("if ("))
      .join("\n");
    const ProductCard = class ProductCard {};
    const definitions = new Map([["product-card", ProductCard]]);
    let defineCount = 0;
    const customElements = {
      get: (tagName) => definitions.get(tagName),
      define(tagName, constructor) {
        defineCount += 1;
        definitions.set(tagName, constructor);
      },
    };

    new Function("customElements", "__litsxStoryElement0", registrationSource)(
      customElements,
      ProductCard,
    );

    assert.strictEqual(defineCount, 0);
    assert.strictEqual(definitions.get("product-card"), ProductCard);
  });

  it("provides a safe makeTitle fallback to CSF validation in the Vite plugin", async () => {
    let receivedOptions;
    const plugin = litsxStoryRegistrationPlugin({
      storybookCsfLoader(code, options) {
        receivedOptions = options;
        return {
          parse() {
            return { indexInputs: [], code };
          },
        };
      },
    });
    const source = [
      'import { ProductCard } from "../product-card.tsx";',
      'export default { title: "Catalog/Product" };',
      "export const Default = { render: () => <ProductCard /> };",
    ].join("\n");

    await plugin.transform.handler(source, "/project/catalog.stories.tsx");

    assert.strictEqual(typeof receivedOptions.makeTitle, "function");
    assert.strictEqual(
      receivedOptions.makeTitle("Catalog/Product"),
      "Catalog/Product",
    );
  });

  it("validates ordinary component props after compiling standard JSX syntax", async () => {
    let receivedCode = "";
    const plugin = litsxStoryRegistrationPlugin({
      storybookCsfLoader(code) {
        receivedCode = code;
        return {
          parse() {
            return { indexInputs: [] };
          },
        };
      },
    });
    const source = [
      'import { ProductCard } from "../product-card.tsx";',
      'export default { title: "Catalog/Product" };',
      'export const Default = { render: ({ title = "Default" } = {}) => <ProductCard title={title} /> };',
    ].join("\n");

    await plugin.transform.handler(source, "/project/catalog.stories.tsx");

    assert.match(receivedCode, /html`<product-card/);
    assert.doesNotMatch(receivedCode, /<ProductCard|title=\{/);
  });

  it("creates a Storybook config wrapper over web-components-vite", async () => {
    const config = createLitsxStorybookConfig();
    const indexed = await config.experimental_indexers([{ existing: true }]);
    const viteConfig = await config.viteFinal({
      optimizeDeps: { rollupOptions: { x: true } },
    });

    assert.strictEqual(config.framework, "@storybook/web-components-vite");
    assert.ok(Array.isArray(config.stories));
    assert.ok(indexed.includes(litsxStoriesIndexer));
    assert.ok(Array.isArray(viteConfig.plugins));
    assert.ok(!("rollupOptions" in viteConfig.optimizeDeps));
  });

  it("applies the Vite helper without clobbering existing plugins", () => {
    const existingPlugin = { name: "existing" };
    const config = withLitsxStorybookViteConfig({
      optimizeDeps: { rollupOptions: { x: true }, include: ["alpha"] },
      plugins: [existingPlugin],
    });

    assert.deepStrictEqual(config.optimizeDeps.include, ["alpha"]);
    assert.strictEqual(config.plugins[0].name, "litsx-story-registration");
    assert.strictEqual(config.plugins[1], existingPlugin);
    assert.strictEqual(config.plugins[2].name, "litsx");
  });

  it("supports generic Vite plugin phases around LitSX", async () => {
    const beforePlugin = { name: "before-litsx" };
    const existingPlugin = { name: "existing" };
    const afterPlugin = { name: "after-litsx" };
    const directConfig = withLitsxStorybookViteConfig(
      { plugins: [existingPlugin] },
      {},
      {
        beforeLitsx: [beforePlugin],
        afterLitsx: [afterPlugin],
      },
    );

    assert.deepStrictEqual(
      directConfig.plugins.map((plugin) => plugin.name),
      [
        "litsx-story-registration",
        "before-litsx",
        "existing",
        "litsx",
        "after-litsx",
      ],
    );

    const wrappedConfig = createLitsxStorybookConfig({
      vitePlugins: { afterLitsx: [afterPlugin] },
    });
    const resolved = await wrappedConfig.viteFinal({ plugins: [] });
    assert.strictEqual(resolved.plugins.at(-1), afterPlugin);
  });

  it("registers stories after existing transforms using authored source metadata", () => {
    const existingLitsxPlugin = { name: "litsx", enforce: "pre" };
    const config = withLitsxStorybookViteConfig({
      plugins: [existingLitsxPlugin],
    });

    assert.strictEqual(config.plugins[0].name, "litsx-story-registration");
    assert.strictEqual(config.plugins[0].enforce, "post");
    assert.strictEqual(config.plugins[1], existingLitsxPlugin);
  });

  it("rejects story modules without a default meta export", async () => {
    const plugin = litsxStoryRegistrationPlugin({
      storybookCsfLoader: createPassingCsfLoader(),
    });
    const source = "export const Default = { render: () => <div /> };";

    await assert.rejects(
      () =>
        plugin.transform.handler(
          source,
          "/project/src/stories/catalog.stories.tsx",
        ),
      /default export is required/i,
    );
  });

  it("rejects named story exports that are not plain objects", async () => {
    const plugin = litsxStoryRegistrationPlugin({
      storybookCsfLoader: createPassingCsfLoader(),
    });
    const source = [
      'export default { title: "Catalog/Button" };',
      "export function BasicStory() {",
      "  return <div />;",
      "}",
    ].join("\n");

    await assert.rejects(
      () =>
        plugin.transform.handler(
          source,
          "/project/src/stories/catalog.stories.tsx",
        ),
      /named story exports must be object literals/i,
    );
  });

  it("allows extra properties on meta and story objects when Storybook can still parse them", async () => {
    const plugin = litsxStoryRegistrationPlugin({
      storybookCsfLoader: createPassingCsfLoader(),
    });
    const source = [
      'export default { title: "Catalog/Button", unsupported: true };',
      "export const Default = { render: () => <div />, unsupported: true };",
    ].join("\n");

    await assert.doesNotReject(() =>
      plugin.transform.handler(
        source,
        "/project/src/stories/catalog.stories.tsx",
      ),
    );
  });

  it("rejects computed property keys in meta and story objects with location info", async () => {
    const plugin = litsxStoryRegistrationPlugin({
      storybookCsfLoader: createPassingCsfLoader(),
    });
    const source = [
      'export default { ["title"]: "Catalog/Button" };',
      "export const Default = { render: () => <div /> };",
    ].join("\n");

    await assert.rejects(
      () =>
        plugin.transform.handler(
          source,
          "/project/src/stories/catalog.stories.tsx",
        ),
      (error) => {
        assert.match(error.message, /does not support computed property keys/i);
        assert.strictEqual(error.code, "LITSX_STORYBOOK_INVALID_STORY_MODULE");
        assert.strictEqual(error.line, 1);
        assert.strictEqual(typeof error.column, "number");
        return true;
      },
    );
  });

  it("surfaces invalid Storybook CSF separately from LitSX contract errors", async () => {
    const plugin = litsxStoryRegistrationPlugin({
      storybookCsfLoader() {
        return {
          parse() {
            const error = new Error("CSF parse failed");
            error.line = 3;
            error.column = 8;
            throw error;
          },
        };
      },
    });
    const source = [
      'export default { title: "Catalog/Button" };',
      "export const Default = {",
      "  play: () => {},",
      "};",
    ].join("\n");

    await assert.rejects(
      () =>
        plugin.transform.handler(
          source,
          "/project/src/stories/catalog.stories.tsx",
        ),
      (error) => {
        assert.strictEqual(error.code, "LITSX_STORYBOOK_INVALID_CSF");
        assert.match(error.message, /Invalid Storybook CSF generated/i);
        return true;
      },
    );
  });

  it("rejects every unsupported meta and named-export shape", async () => {
    const plugin = litsxStoryRegistrationPlugin({
      storybookCsfLoader: createPassingCsfLoader(),
    });
    const cases = [
      ["export default function () {}", /default export must be a plain object/],
      ["const meta = other; export default meta;", /default export must be a plain object/],
      ["const first = second; const second = first; export default first;", /default export must be a plain object/],
      ['export default { get title() { return "x"; } };', /only supports plain object properties/],
      ['export default { 1: "x" };', /identifier or string-literal property keys/],
      ['export default { title: "x" }; export { Story } from "./story";', /re-exports are not supported/],
      ['export default { title: "x" }; export const { Story } = stories;', /identifier bindings/],
      ['export default { title: "x" }; export const StoryCard = () => null;', /must be a plain object literal/],
      ['export default { title: "x" }; function StoryCard() {} export { StoryCard };', /must resolve to a plain object literal/],
      ['export default { title: "x" }; export class StoryCard {}', /must be object literals/],
    ];

    for (const [source, expected] of cases) {
      await assert.rejects(
        () => plugin.transform.handler(source, "/virtual/catalog.stories.tsx"),
        expected,
      );
    }
  });

  it("accepts local object aliases and string-literal story keys", async () => {
    const plugin = litsxStoryRegistrationPlugin({
      storybookCsfLoader: createPassingCsfLoader(),
    });
    const source = [
      'const meta = { "title": "Catalog/Aliases" };',
      "const story = { render: () => <div /> };",
      "export default meta;",
      "export { story as Default };",
    ].join("\n");

    await assert.doesNotReject(() =>
      plugin.transform.handler(source, "\0catalog.stories.tsx"),
    );
  });

  it("normalizes CSF loader failures with nested, flat, and absent locations", async () => {
    const source = 'export default { title: "Catalog/Failure" };';
    const variants = [
      Object.assign(new Error("nested"), { loc: { line: 4, column: 2 } }),
      Object.assign(new Error("flat"), { line: 5, column: 3 }),
      {},
    ];

    for (const failure of variants) {
      const plugin = litsxStoryRegistrationPlugin({
        storybookCsfLoader() {
          return { parse() { throw failure; } };
        },
      });
      await assert.rejects(
        () => plugin.transform.handler(source, "/virtual/failure.stories.tsx"),
        (error) => {
          assert.equal(error.code, "LITSX_STORYBOOK_INVALID_CSF");
          assert.equal(error.cause, failure);
          if (failure.loc || failure.line) {
            assert.equal(typeof error.line, "number");
            assert.equal(typeof error.column, "number");
          } else {
            assert.match(error.message, /Unknown Storybook parsing error/);
            assert.equal(error.loc, undefined);
          }
          return true;
        },
      );
    }
  });

  it("composes custom Storybook hooks and tolerates absent plugin arrays", async () => {
    const existingIndexer = { test: /legacy/, createIndex() {} };
    const existingPlugin = { name: "base" };
    const config = createLitsxStorybookConfig({
      stories: ["custom/**/*.stories.tsx"],
      addons: ["custom-addon"],
      storybook: {
        async experimental_indexers(indexers) {
          return [...indexers, existingIndexer];
        },
        async viteFinal(viteConfig) {
          return { ...viteConfig, plugins: [existingPlugin] };
        },
      },
      compiler: { sourceMaps: false, jsxTemplate: "ignored" },
      vitePlugins: { beforeLitsx: {}, afterLitsx: null },
    });

    assert.deepEqual(config.stories, ["custom/**/*.stories.tsx"]);
    assert.deepEqual(config.addons, ["custom-addon"]);
    assert.deepEqual(
      await config.experimental_indexers([]),
      [existingIndexer, litsxStoriesIndexer],
    );
    const viteConfig = await config.viteFinal({ optimizeDeps: undefined });
    assert.equal(viteConfig.plugins[1], existingPlugin);

    const empty = withLitsxStorybookViteConfig({}, {}, {
      beforeLitsx: null,
      afterLitsx: "invalid",
    });
    assert.deepEqual(empty.optimizeDeps, {});
    assert.deepEqual(empty.plugins.map(({ name }) => name), [
      "litsx-story-registration",
      "litsx",
    ]);
  });
});
