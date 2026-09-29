import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it, vi } from "vitest";

vi.mock("storybook/internal/csf-tools", () => ({
  loadCsf: () => ({ parse: () => null }),
}));

describe("Storybook loader defensive branches", () => {
  it("returns an empty index when Storybook produces no parsed CSF", async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "litsx-storybook-empty-"));
    const filename = path.join(directory, "empty.stories.tsx");
    try {
      fs.writeFileSync(filename, 'export default { title: "Empty" }; export const Default = { render: () => <div /> };');
      const { litsxStoriesIndexer } = await import("../packages/storybook/src/index.js");
      assert.deepEqual(await litsxStoriesIndexer.createIndex(filename), []);
    } finally {
      fs.rmSync(directory, { recursive: true, force: true });
    }
  });
});
