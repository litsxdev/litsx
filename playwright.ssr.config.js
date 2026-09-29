import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testMatch: [
    "test/ssr-browser.playwright.js",
    "test/lit-interoperability.playwright.js",
    "test/svg-interoperability.playwright.js",
  ],
  use: {
    ...devices["Desktop Chrome"],
  },
});
