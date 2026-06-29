import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/scoped-registry-browser.check.js"],
  },
});
