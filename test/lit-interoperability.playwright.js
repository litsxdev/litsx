import path from "node:path";
import { expect, test } from "@playwright/test";
import { createSsrDevServer } from "../packages/ssr/src/index.js";

const repoRoot = path.resolve(import.meta.dirname, "..");
const fixtureRoot = path.join(repoRoot, "test/fixtures/lit-interoperability");

test.describe("Lit component interoperability", () => {
  let server;
  let baseUrl;

  test.beforeAll(async () => {
    server = await createSsrDevServer({
      root: fixtureRoot,
      vite: {
        cacheDir: path.join(repoRoot, "test-results/lit-interoperability-vite"),
        optimizeDeps: { noDiscovery: true },
      },
      clientEntry: "./src/main.js",
      bootstrap: {
        content: `
try {
const shadowHost = document.querySelector("hybrid-host");
const lightHost = document.querySelector("hybrid-light-host");
const shadowCounter = shadowHost?.shadowRoot?.querySelector("plain-lit-counter");
const mixedBadge = shadowHost?.shadowRoot?.querySelector("mixed-lit-badge");
const lightCounter = lightHost?.querySelector("light-lit-counter");
window.__litInteropBeforeHydration = {
  shadowHost,
  lightHost,
  shadowCounter,
  shadowButton: shadowCounter?.shadowRoot?.querySelector("[data-counter]"),
  mixedBadge,
  mixedValue: mixedBadge?.shadowRoot?.querySelector(".value"),
  lightCounter,
  lightButton: lightCounter?.shadowRoot?.querySelector("[data-counter]"),
};
const { hydratePage } = await import("@litsx/ssr/hydration");
await hydratePage({ register: () => import("/src/main.js") });
await Promise.all([
  shadowHost?.updateComplete,
  lightHost?.updateComplete,
  shadowCounter?.updateComplete,
  mixedBadge?.updateComplete,
  lightCounter?.updateComplete,
]);
window.__litInteropHydrated = true;
} catch (error) {
  window.__litInteropError = error?.stack ?? String(error);
  throw error;
}
`,
      },
      logLevel: "silent",
      host: "127.0.0.1",
      strictPort: false,
      elements(loader) {
        return {
          "hybrid-host": async () =>
            (await loader("./src/hybrid-host.tsx")).HybridHost,
          "hybrid-light-host": async () =>
            (await loader("./src/hybrid-host.tsx")).HybridLightHost,
        };
      },
      render({ html }) {
        return html`
          <hybrid-host initialCount="2"></hybrid-host>
          <hybrid-light-host></hybrid-light-host>
        `;
      },
    });
    await server.listen();
    baseUrl = server.resolvedUrls.local[0];
  });

  test.afterAll(async () => {
    await server?.close();
  });

  async function waitForHydration(page) {
    await page.waitForFunction(
      () => window.__litInteropHydrated === true || window.__litInteropError,
    );
    expect(
      await page.evaluate(() => window.__litInteropError ?? null),
    ).toBeNull();
  }

  test("hydrates pure Lit children without replacing SSR nodes", async ({
    page,
  }) => {
    const pageErrors = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));
    await page.goto(baseUrl);
    await waitForHydration(page);

    const result = await page.evaluate(() => {
      const before = window.__litInteropBeforeHydration;
      const shadowHost = document.querySelector("hybrid-host");
      const lightHost = document.querySelector("hybrid-light-host");
      const shadowCounter =
        shadowHost.shadowRoot.querySelector("plain-lit-counter");
      const mixedBadge = shadowHost.shadowRoot.querySelector("mixed-lit-badge");
      const lightCounter = lightHost.querySelector("light-lit-counter");

      return {
        constructors: {
          shadowHost: shadowHost.constructor.name,
          shadowCounter: shadowCounter.constructor.name,
          mixedBadge: mixedBadge.constructor.name,
          lightHost: lightHost.constructor.name,
          lightCounter: lightCounter.constructor.name,
        },
        identity: {
          shadowHost: shadowHost === before.shadowHost,
          lightHost: lightHost === before.lightHost,
          shadowCounter: shadowCounter === before.shadowCounter,
          shadowButton:
            shadowCounter.shadowRoot.querySelector("[data-counter]") ===
            before.shadowButton,
          mixedBadge: mixedBadge === before.mixedBadge,
          mixedValue:
            mixedBadge.shadowRoot.querySelector(".value") === before.mixedValue,
          lightCounter: lightCounter === before.lightCounter,
          lightButton:
            lightCounter.shadowRoot.querySelector("[data-counter]") ===
            before.lightButton,
        },
      };
    });

    expect(result.constructors).toEqual({
      shadowHost: "HybridHost",
      shadowCounter: "PlainLitCounter",
      mixedBadge: "MixedLitBadge",
      lightHost: "HybridLightHost",
      lightCounter: "LightLitCounter",
    });
    expect(result.identity).toEqual({
      shadowHost: true,
      lightHost: true,
      shadowCounter: true,
      shadowButton: true,
      mixedBadge: true,
      mixedValue: true,
      lightCounter: true,
      lightButton: true,
    });
    expect(pageErrors).toEqual([]);
  });

  test("preserves properties, slots and standard mixin metadata", async ({
    page,
  }) => {
    await page.goto(baseUrl);
    await waitForHydration(page);

    const result = await page.evaluate(() => {
      const shadowHost = document.querySelector("hybrid-host");
      const shadowCounter =
        shadowHost.shadowRoot.querySelector("plain-lit-counter");
      const mixedBadge = shadowHost.shadowRoot.querySelector("mixed-lit-badge");
      const mixedValue = mixedBadge.shadowRoot.querySelector(".value");
      const lightHost = document.querySelector("hybrid-light-host");
      const lightCounter = lightHost.querySelector("light-lit-counter");

      return {
        shadowCounter: {
          label: shadowCounter.label,
          count: shadowCounter.count,
          active: shadowCounter.active,
          activeAttribute: shadowCounter.hasAttribute("active"),
          payload: shadowCounter.payload,
          slotText: shadowCounter.querySelector('[slot="prefix"]')?.textContent,
        },
        mixedBadge: {
          tone: mixedBadge.tone,
          enabled: mixedBadge.enabled,
          model: mixedBadge.model,
          toneAttribute: mixedBadge.getAttribute("tone"),
          enabledAttribute: mixedBadge.hasAttribute("enabled"),
          capabilityConnections: mixedBadge.capabilityConnections,
          text: mixedValue.textContent.trim(),
          color: getComputedStyle(mixedValue).color,
          background: getComputedStyle(mixedValue).backgroundColor,
          properties: [
            ...mixedBadge.constructor.elementProperties.keys(),
          ].sort(),
        },
        lightCounter: {
          root: lightHost.shadowRoot,
          label: lightCounter.label,
          count: lightCounter.count,
          active: lightCounter.active,
          payload: lightCounter.payload,
        },
      };
    });

    expect(result.shadowCounter).toEqual({
      label: "Shadow",
      count: 2,
      active: true,
      activeAttribute: true,
      payload: { id: "shadow-payload" },
      slotText: "Prefix",
    });
    expect(result.mixedBadge).toEqual({
      tone: "positive",
      enabled: true,
      model: { id: "spread-model" },
      toneAttribute: "positive",
      enabledAttribute: true,
      capabilityConnections: 1,
      text: "enabled:spread-model",
      color: "rgb(0, 128, 0)",
      background: "rgb(255, 255, 0)",
      properties: ["enabled", "model", "tone"],
    });
    expect(result.lightCounter).toEqual({
      root: null,
      label: "Light",
      count: 4,
      active: false,
      payload: { id: "light-payload" },
    });
  });

  test("keeps pure Lit events and reconnect lifecycle live after hydration", async ({
    page,
  }) => {
    await page.goto(baseUrl);
    await waitForHydration(page);

    const result = await page.evaluate(async () => {
      const shadowHost = document.querySelector("hybrid-host");
      const shadowCounter =
        shadowHost.shadowRoot.querySelector("plain-lit-counter");
      const originalCounter = shadowCounter;
      const originalButton =
        shadowCounter.shadowRoot.querySelector("[data-counter]");
      originalButton.click();
      await shadowHost.updateComplete;
      await shadowCounter.updateComplete;

      const lightHost = document.querySelector("hybrid-light-host");
      const lightCounter = lightHost.querySelector("light-lit-counter");
      const lightParent = lightHost.parentNode;
      lightHost.remove();
      lightParent.appendChild(lightHost);
      await lightHost.updateComplete;
      await lightCounter.updateComplete;

      return {
        count: shadowCounter.count,
        hostCount: shadowHost.shadowRoot
          .querySelector("[data-host-count]")
          .textContent.trim(),
        sameCounter:
          shadowHost.shadowRoot.querySelector("plain-lit-counter") ===
          originalCounter,
        sameButton:
          shadowCounter.shadowRoot.querySelector("[data-counter]") ===
          originalButton,
        sameLightCounter:
          lightHost.querySelector("light-lit-counter") === lightCounter,
      };
    });

    expect(result).toEqual({
      count: 3,
      hostCount: "3",
      sameCounter: true,
      sameButton: true,
      sameLightCounter: true,
    });
  });
});
