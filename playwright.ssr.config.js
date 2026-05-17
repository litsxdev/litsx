import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testMatch: "test/ssr-browser.playwright.js",
  use: {
    ...devices["Desktop Chrome"],
  },
});
