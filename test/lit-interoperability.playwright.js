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
const pureBridge = document.querySelector("plain-lit-bridge");
const pureLeaf = pureBridge?.shadowRoot?.querySelector("matrix-complex-leaf");
const pureTerminal = pureLeaf?.shadowRoot?.querySelector("plain-lit-terminal");
const contextBridge = document.querySelector("plain-lit-context-bridge");
const lightBridge = contextBridge?.querySelector("plain-lit-bridge");
const lightLeaf = lightBridge?.shadowRoot?.querySelector("matrix-complex-leaf");
const lightTerminal = lightLeaf?.shadowRoot?.querySelector("plain-lit-terminal");
window.__litInteropBeforeHydration = {
  shadowHost,
  lightHost,
  shadowCounter,
  shadowButton: shadowCounter?.shadowRoot?.querySelector("[data-counter]"),
  mixedBadge,
  mixedValue: mixedBadge?.shadowRoot?.querySelector(".value"),
  lightCounter,
  lightButton: lightCounter?.shadowRoot?.querySelector("[data-counter]"),
  pureBridge,
  pureBridgeSection: pureBridge?.shadowRoot?.querySelector("[data-plain-bridge]"),
  pureLeaf,
  pureLeafSection: pureLeaf?.shadowRoot?.querySelector("[data-matrix-leaf]"),
  pureTerminal,
  pureTerminalButton: pureTerminal?.shadowRoot?.querySelector("[data-terminal]"),
  contextBridge,
  contextBridgeDeferred: contextBridge?.hasAttribute("defer-hydration"),
  contextBridgeComments: [...(contextBridge?.childNodes ?? [])]
    .filter((node) => node.nodeType === 8)
    .map((node) => node.data),
  lightBridge,
  lightLeaf,
  lightTerminal,
  lightTerminalButton: lightTerminal?.shadowRoot?.querySelector("[data-terminal]"),
};
window.__litInteropStage = "loading-hydration";
const { hydratePage } = await import("@litsx/ssr/hydration");
window.__litInteropStage = "hydrating";
await hydratePage({ register: () => import("/src/main.js") });
for (const [name, element] of [
  ["shadow-host", shadowHost],
  ["light-host", lightHost],
  ["shadow-counter", shadowCounter],
  ["mixed-badge", mixedBadge],
  ["light-counter", lightCounter],
  ["pure-bridge", pureBridge],
  ["pure-leaf", pureLeaf],
  ["pure-terminal", pureTerminal],
  ["context-bridge", contextBridge],
  ["light-bridge", lightBridge],
  ["light-leaf", lightLeaf],
  ["light-terminal", lightTerminal],
]) {
  window.__litInteropStage = "waiting-for-" + name;
  await element?.updateComplete;
}
window.__litInteropStage = "waiting-for-context-update";
await Promise.resolve();
await Promise.all([
  pureLeaf?.updateComplete,
  lightLeaf?.updateComplete,
]);
window.__litInteropStage = "complete";
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
          "plain-lit-bridge": async () =>
            (await loader("./src/matrix-components.tsx")).PlainLitBridge,
          "plain-lit-context-bridge": async () =>
            (await loader("./src/matrix-components.tsx")).PlainLitContextBridge,
        };
      },
      render({ html }) {
        return html`
          <hybrid-host initialCount="2"></hybrid-host>
          <hybrid-light-host></hybrid-light-host>
          <plain-lit-bridge
            bridge-label="root-bridge"
            .payload=${{ id: "root-payload" }}
          ></plain-lit-bridge>
          <plain-lit-context-bridge></plain-lit-context-bridge>
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
    try {
      await page.waitForFunction(
        () => window.__litInteropHydrated === true || window.__litInteropError,
        undefined,
        { timeout: 15_000 },
      );
    } catch (error) {
      const diagnostic = await page.evaluate(() => ({
        stage: window.__litInteropStage,
        body: document.body?.innerText?.slice(0, 500),
        scripts: document.scripts.length,
      }));
      throw new Error(`Hydration stalled: ${JSON.stringify(diagnostic)}.`, {
        cause: error,
      });
    }
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

  test("covers Lit to LitSX to Lit across shadow and light DOM with multiple mixins", async ({
    page,
  }) => {
    const pageErrors = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));
    await page.goto(baseUrl);
    await waitForHydration(page);

    const result = await page.evaluate(async () => {
      const before = window.__litInteropBeforeHydration;
      const pureBridge = document.querySelector("plain-lit-bridge");
      const pureLeaf =
        pureBridge?.shadowRoot?.querySelector("matrix-complex-leaf");
      const pureTerminal =
        pureLeaf?.shadowRoot?.querySelector("plain-lit-terminal");
      const pureTerminalButton =
        pureTerminal?.shadowRoot?.querySelector("[data-terminal]");

      const contextBridge = document.querySelector("plain-lit-context-bridge");
      const contextProvider = contextBridge?.querySelector(
        "litsx-context-provider",
      );
      const lightBridge = contextProvider?.querySelector("plain-lit-bridge");
      const lightLeaf =
        lightBridge?.shadowRoot?.querySelector("matrix-complex-leaf");
      const lightTerminal =
        lightLeaf?.shadowRoot?.querySelector("plain-lit-terminal");

      if (
        !pureBridge || !pureLeaf || !pureTerminal || !pureTerminalButton ||
        !contextBridge || !contextProvider ||
        !lightBridge || !lightLeaf || !lightTerminal
      ) {
        throw new Error("The hybrid interoperability tree did not fully hydrate.");
      }

      const readCapabilities = (leaf) =>
        leaf.shadowRoot
          .querySelector("[data-capabilities]")
          .textContent.replace(/\s+/g, "")
          .trim();
      const prototypeNames = [];
      let ctor = pureLeaf.constructor;
      while (typeof ctor === "function" && ctor.name) {
        prototypeNames.push(ctor.name);
        ctor = Object.getPrototypeOf(ctor);
      }

      const initial = {
        identities: {
          pureBridge: pureBridge === before.pureBridge,
          pureBridgeSection:
            pureBridge.shadowRoot.querySelector("[data-plain-bridge]") ===
            before.pureBridgeSection,
          pureLeaf: pureLeaf === before.pureLeaf,
          pureLeafSection:
            pureLeaf.shadowRoot.querySelector("[data-matrix-leaf]") ===
            before.pureLeafSection,
          pureTerminal: pureTerminal === before.pureTerminal,
          pureTerminalButton:
            pureTerminalButton === before.pureTerminalButton,
          contextBridge: contextBridge === before.contextBridge,
          lightBridge: lightBridge === before.lightBridge,
          lightLeaf: lightLeaf === before.lightLeaf,
          lightTerminal: lightTerminal === before.lightTerminal,
          lightTerminalButton:
            lightTerminal.shadowRoot?.querySelector("[data-terminal]") ===
            before.lightTerminalButton,
        },
        capabilities: {
          pure: readCapabilities(pureLeaf),
          light: readCapabilities(lightLeaf),
        },
        provider: {
          constructorName: contextProvider.constructor.name,
          hostRegistryConstructor:
            contextBridge.registry?.get?.("litsx-context-provider")?.name,
          shimRegistry: typeof contextBridge.registry?._getDefinition === "function",
          hasContext: contextProvider.context != null,
          contextDefault: contextProvider.context?.defaultValue,
          value: contextProvider.value,
          contextAttribute: contextProvider.getAttribute("context"),
          valueAttribute: contextProvider.getAttribute("value"),
          providerInitialized: contextProvider._provider != null,
        },
        lightLeafHydration: {
          contextBridgeDeferredBefore: before.contextBridgeDeferred,
          contextBridgeCommentsBefore: before.contextBridgeComments,
          contextBridgeDeferredAfter:
            contextBridge.hasAttribute("defer-hydration"),
          updatePending: lightLeaf.isUpdatePending,
          deferHydration: lightLeaf.hasAttribute("defer-hydration"),
          constructorName: lightLeaf.constructor.name,
        },
        metadata: {
          properties: [...pureLeaf.constructor.elementProperties.keys()].sort(),
          elements: Object.keys(pureLeaf.constructor.elements).sort(),
          formAssociated: pureLeaf.constructor.formAssociated,
          prototypeNames,
          lifecycle: [...pureLeaf.mixinLifecycle],
          alphaStyleCount: pureLeaf.constructor.elementStyles
            .map((style) => style.cssText)
            .join("\n")
            .split("rgb(180, 0, 0)").length - 1,
        },
        styles: {
          color: getComputedStyle(
            pureLeaf.shadowRoot.querySelector(".matrix-probe"),
          ).color,
          background: getComputedStyle(
            pureLeaf.shadowRoot.querySelector(".matrix-probe"),
          ).backgroundColor,
          borderWidth: getComputedStyle(
            pureLeaf.shadowRoot.querySelector(".matrix-probe"),
          ).borderTopWidth,
          padding: getComputedStyle(
            pureLeaf.shadowRoot.querySelector(".matrix-probe"),
          ).paddingTop,
          bridgeOutline: getComputedStyle(pureBridge).outlineWidth,
        },
        values: {
          rootPayload: pureLeaf.payload,
          lightPayload: lightLeaf.payload,
          rootLabel: pureLeaf.label,
          lightLabel: lightLeaf.label,
        },
      };

      pureTerminalButton.click();
      await pureTerminal.updateComplete;
      await pureLeaf.updateComplete;

      contextProvider.value = "context-updated";
      await lightLeaf.updateComplete;

      const parent = pureBridge.parentNode;
      pureBridge.remove();
      parent.appendChild(pureBridge);
      await pureBridge.updateComplete;
      await pureLeaf.updateComplete;

      return {
        initial,
        updates: {
          pureCapabilities: readCapabilities(pureLeaf),
          lightCapabilities: readCapabilities(lightLeaf),
          terminalText: pureTerminal.shadowRoot
            .querySelector("[data-terminal]")
            .textContent.replace(/\s+/g, "")
            .trim(),
          sameLeaf:
            pureBridge.shadowRoot.querySelector("matrix-complex-leaf") ===
            pureLeaf,
          sameTerminal:
            pureLeaf.shadowRoot.querySelector("plain-lit-terminal") ===
            pureTerminal,
          bridgeConnections: pureBridge.bridgeConnections,
          lifecycle: [...pureLeaf.mixinLifecycle],
        },
      };
    });

    expect(result.initial.identities).toEqual({
      pureBridge: true,
      pureBridgeSection: true,
      pureLeaf: true,
      pureLeafSection: true,
      pureTerminal: true,
      pureTerminalButton: true,
      contextBridge: true,
      lightBridge: true,
      lightLeaf: true,
      lightTerminal: true,
      lightTerminalButton: true,
    });
    expect(result.initial.capabilities).toEqual({
      pure: "root-bridge:alpha:alpha:beta:context-fallback:face-initial",
      light: "light-bridge:alpha:alpha:beta:context-fallback:face-initial",
    });
    expect(result.initial.provider).toEqual({
      constructorName: "LitsxContextProviderElement",
      hostRegistryConstructor: "LitsxContextProviderElement",
      shimRegistry: true,
      hasContext: true,
      contextDefault: "context-fallback",
      value: "context-fallback",
      contextAttribute: null,
      valueAttribute: null,
      providerInitialized: true,
    });
    expect(result.initial.lightLeafHydration).toEqual({
      contextBridgeDeferredBefore: true,
      contextBridgeCommentsBefore: expect.arrayContaining([
        expect.stringMatching(/^lit-part /),
        "lit-node 0",
        "/lit-part",
      ]),
      contextBridgeDeferredAfter: false,
      updatePending: false,
      deferHydration: false,
      constructorName: "MatrixComplexLeaf",
    });
    expect(result.initial.metadata.properties).toEqual(
      expect.arrayContaining(["alpha", "beta", "label", "payload"]),
    );
    expect(result.initial.metadata.elements).toEqual([
      "alpha-marker",
      "beta-marker",
      "own-marker",
      "plain-lit-terminal",
    ]);
    expect(result.initial.metadata.formAssociated).toBe(true);
    expect(result.initial.metadata.prototypeNames).toEqual(
      expect.arrayContaining([
        "AlphaCapability",
        "BetaCapability",
        "FormAssociatedHost",
      ]),
    );
    expect(result.initial.metadata.lifecycle).toEqual([
      "connect:alpha",
      "connect:beta",
    ]);
    expect(result.initial.metadata.alphaStyleCount).toBe(1);
    expect(result.initial.styles).toEqual({
      color: "rgb(180, 0, 0)",
      background: "rgb(0, 0, 180)",
      borderWidth: "4px",
      padding: "5px",
      bridgeOutline: "2px",
    });
    expect(result.initial.values).toEqual({
      rootPayload: { id: "root-payload" },
      lightPayload: { id: "light-payload" },
      rootLabel: "root-bridge",
      lightLabel: "light-bridge",
    });
    expect(result.updates).toEqual({
      pureCapabilities:
        "root-bridge:alpha:alpha:beta:context-fallback:face-6",
      lightCapabilities:
        "light-bridge:alpha:alpha:beta:context-updated:face-initial",
      terminalText: "6:root-payload",
      sameLeaf: true,
      sameTerminal: true,
      bridgeConnections: 2,
      lifecycle: [
        "connect:alpha",
        "connect:beta",
        "disconnect:alpha",
        "disconnect:beta",
        "connect:alpha",
        "connect:beta",
      ],
    });
    expect(pageErrors).toEqual([]);
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
