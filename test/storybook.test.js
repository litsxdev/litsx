import assert from "assert";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, it } from "vitest";

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
      "",
    ].join("\n");

    const transformed = await plugin.transform(
      source,
      "/project/src/stories/catalog.stories.tsx",
    );

    assert.strictEqual(plugin.enforce, "pre");
    assert.match(
      transformed.code,
      /customElements\.define\("vds-button", VdsButton\);/,
    );
    assert.match(
      transformed.code,
      /customElements\.define\("vds-drawer", DrawerElement\);/,
    );
    assert.match(
      transformed.code,
      /customElements\.define\("vds-modal", VdsModal\);/,
    );
    assert.match(
      transformed.code,
      /customElements\.define\("vds-drawer-story", VdsDrawerStory\);/,
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
    const standardTsx = await plugin.transform(
      source,
      "/project/src/stories/catalog.stories.tsx",
    );
    assert.match(standardTsx.code, /customElements\.define\("vds-button", VdsButton\);/);
    assert.strictEqual(
      await plugin.transform(source, "/project/src/catalog.tsx"),
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

    const transformed = await plugin.transform(
      source,
      "/project/catalog.stories.tsx",
    );

    assert.match(
      transformed.code,
      /customElements\.define\("product-card", ProductCard\)/,
    );
    assert.match(
      transformed.code,
      /customElements\.define\("product-price", ProductPrice\)/,
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
    const transformed = await plugin.transform(
      source,
      "/project/catalog.stories.tsx",
    );
    const registrationSource = transformed.code.slice(source.length);
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

    new Function("customElements", "ProductCard", registrationSource)(
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

    await plugin.transform(source, "/project/catalog.stories.tsx");

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

    await plugin.transform(source, "/project/catalog.stories.tsx");

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

  it("registers stories before an existing LitSX transform can erase authored metadata", () => {
    const existingLitsxPlugin = { name: "litsx", enforce: "pre" };
    const config = withLitsxStorybookViteConfig({
      plugins: [existingLitsxPlugin],
    });

    assert.strictEqual(config.plugins[0].name, "litsx-story-registration");
    assert.strictEqual(config.plugins[1], existingLitsxPlugin);
  });

  it("rejects story modules without a default meta export", async () => {
    const plugin = litsxStoryRegistrationPlugin({
      storybookCsfLoader: createPassingCsfLoader(),
    });
    const source = "export const Default = { render: () => <div /> };";

    await assert.rejects(
      () =>
        plugin.transform(source, "/project/src/stories/catalog.stories.tsx"),
      /default export is required/i,
    );
  });

  it("rejects named story exports that are not plain objects", async () => {
    const plugin = litsxStoryRegistrationPlugin({
      storybookCsfLoader: createPassingCsfLoader(),
    });
    const source = [
      'export default { title: "Catalog/Button" };',
      "export function Default() {",
      "  return <div />;",
      "}",
    ].join("\n");

    await assert.rejects(
      () =>
        plugin.transform(source, "/project/src/stories/catalog.stories.tsx"),
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
      plugin.transform(source, "/project/src/stories/catalog.stories.tsx"),
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
        plugin.transform(source, "/project/src/stories/catalog.stories.tsx"),
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
        plugin.transform(source, "/project/src/stories/catalog.stories.tsx"),
      (error) => {
        assert.strictEqual(error.code, "LITSX_STORYBOOK_INVALID_CSF");
        assert.match(error.message, /Invalid Storybook CSF generated/i);
        return true;
      },
    );
  });
});
