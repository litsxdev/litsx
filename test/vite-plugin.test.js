import assert from "assert";
import { describe, it } from "vitest";

import { litsx } from "../packages/vite-plugin/src/index.js";

describe("@litsx/vite-plugin", () => {
  it("transforms jsx and returns code with a sourcemap", async () => {
    const plugin = litsx({ sourceMaps: true });
    const source = [
      "export const Counter = () => {",
      "  return <button @click={save}>Hi</button>;",
      "};",
    ].join("\n");

    const result = await plugin.transform(source, "/virtual/Counter.jsx");

    assert.ok(result);
    assert.match(result.code, /html`/);
    assert.ok(result.map);
  }, 30000);

  it("ignores non-matching files by default", async () => {
    const plugin = litsx();
    const result = await plugin.transform("export const value = 1;", "/virtual/value.js");

    assert.strictEqual(result, null);
  });

  it("supports custom include filters", async () => {
    const plugin = litsx({
      include: (id) => id.endsWith(".demo"),
    });
    const source = "export const Counter = () => <button @click={save}>Hi</button>;";

    const transformed = await plugin.transform(source, "/virtual/example.demo");
    const ignored = await plugin.transform(source, "/virtual/example.jsx");

    assert.ok(transformed);
    assert.match(transformed.code, /html`/);
    assert.strictEqual(ignored, null);
  }, 30000);

  it("supports the docs theme include filter used by VitePress", async () => {
    const plugin = litsx({
      include(id) {
        return (
          id.includes("/website/docs/.vitepress/theme/components/") &&
          (id.endsWith(".jsx") || id.endsWith(".tsx"))
        );
      },
      sourceMaps: true,
    });
    const source = "export const Counter = () => <button @click={save}>Hi</button>;";

    const transformed = await plugin.transform(
      source,
      "/repo/website/docs/.vitepress/theme/components/counter.jsx"
    );
    const ignored = await plugin.transform(
      source,
      "/repo/website/docs/guides/counter.jsx"
    );

    assert.ok(transformed);
    assert.match(transformed.code, /html`/);
    assert.ok(transformed.map);
    assert.strictEqual(ignored, null);
  }, 30000);
});
