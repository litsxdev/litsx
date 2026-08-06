import assert from "assert";
import { describe, it } from "vitest";

import {
  createLitsxStorybookConfig,
  litsxStoriesIndexer,
  litsxStoryRegistrationPlugin,
  withLitsxStorybookViteConfig,
} from "../packages/storybook/src/index.js";

function createPassingCsfLoader() {
  return () => ({
    parse() {
      return { indexInputs: [] };
    },
  });
}

describe("@litsx/storybook", () => {
  it("generates a pretransform that auto-registers imported and local story elements", async () => {
    const plugin = litsxStoryRegistrationPlugin({
      storybookCsfLoader: createPassingCsfLoader(),
    });
    const source = [
      'import { VdsButton, VdsDrawer as DrawerElement, type VdsButtonProps } from "../components/vds-button.litsx";',
      'import { VdsModal } from "../components/vds-modal.litsx";',
      'import type { VdsIgnoredStory } from "../components/vds-ignored-story.litsx";',
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
      "      <VdsButton label=\"Buy\" />",
      "      <VdsDrawerStory />",
      "      <VdsModalStory />",
      "    </div>",
      "  ),",
      "};",
      "",
    ].join("\n");

    const transformed = await plugin.transform(source, "/project/src/stories/catalog.stories.litsx");

    assert.strictEqual(plugin.enforce, "pre");
    assert.match(transformed.code, /customElements\.define\("vds-button", VdsButton\);/);
    assert.match(transformed.code, /customElements\.define\("vds-drawer", DrawerElement\);/);
    assert.match(transformed.code, /customElements\.define\("vds-modal", VdsModal\);/);
    assert.match(transformed.code, /customElements\.define\("vds-drawer-story", VdsDrawerStory\);/);
    assert.match(transformed.code, /customElements\.define\("vds-modal-story", VdsModalStory\);/);
    assert.doesNotMatch(transformed.code, /customElements\.define\("vds-button-props", VdsButtonProps\);/);
    assert.doesNotMatch(transformed.code, /customElements\.define\("vds-ignored-story", VdsIgnoredStory\);/);
    assert.strictEqual(await plugin.transform(source, "/project/src/stories/catalog.stories.tsx"), null);
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
    assert.strictEqual(config.plugins[0], existingPlugin);
    assert.strictEqual(config.plugins[1].name, "litsx-story-registration");
    assert.strictEqual(config.plugins[2].name, "litsx");
  });

  it("rejects story modules without a default meta export", async () => {
    const plugin = litsxStoryRegistrationPlugin({
      storybookCsfLoader: createPassingCsfLoader(),
    });
    const source = 'export const Default = { render: () => <div /> };';

    await assert.rejects(
      () => plugin.transform(source, "/project/src/stories/catalog.stories.litsx"),
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
      () => plugin.transform(source, "/project/src/stories/catalog.stories.litsx"),
      /named story exports must be object literals/i,
    );
  });

  it("allows extra properties on meta and story objects when Storybook can still parse them", async () => {
    const plugin = litsxStoryRegistrationPlugin({
      storybookCsfLoader: createPassingCsfLoader(),
    });
    const source = [
      'export default { title: "Catalog/Button", unsupported: true };',
      'export const Default = { render: () => <div />, unsupported: true };',
    ].join("\n");

    await assert.doesNotReject(() =>
      plugin.transform(source, "/project/src/stories/catalog.stories.litsx")
    );
  });

  it("rejects computed property keys in meta and story objects with location info", async () => {
    const plugin = litsxStoryRegistrationPlugin({
      storybookCsfLoader: createPassingCsfLoader(),
    });
    const source = [
      'export default { ["title"]: "Catalog/Button" };',
      'export const Default = { render: () => <div /> };',
    ].join("\n");

    await assert.rejects(
      () => plugin.transform(source, "/project/src/stories/catalog.stories.litsx"),
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
      () => plugin.transform(source, "/project/src/stories/catalog.stories.litsx"),
      (error) => {
        assert.strictEqual(error.code, "LITSX_STORYBOOK_INVALID_CSF");
        assert.match(error.message, /Invalid Storybook CSF generated/i);
        return true;
      },
    );
  });
});
