import assert from "assert";
import path from "path";
import { fileURLToPath } from "url";
import { spawn } from "child_process";
import { afterAll, beforeAll, describe, it } from "vitest";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixtureDir = path.join(__dirname, "browser-fixtures", "scoped-registry-repro");
const viteConfigPath = path.join(fixtureDir, "vite.config.js");
const viteBinPath = path.join(
  __dirname,
  "..",
  "node_modules",
  "vite",
  "bin",
  "vite.js",
);

function startFixtureServer() {
  const child = spawn(process.execPath, [viteBinPath, "--config", viteConfigPath], {
    cwd: path.join(__dirname, ".."),
    env: {
      ...process.env,
      FORCE_COLOR: "0",
      NO_COLOR: "1",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  let output = "";

  const ready = new Promise((resolve, reject) => {
    const onData = (chunk) => {
      const text = chunk.toString();
      output += text;

      const match = text.match(/Local:\s+(http:\/\/127\.0\.0\.1:\d+\/)/);
      if (match) {
        resolve(match[1]);
      }
    };

    const onExit = (code, signal) => {
      reject(
        new Error(
          `Fixture server exited before becoming ready (code=${code}, signal=${signal}).\n${output}`,
        ),
      );
    };

    child.stdout.on("data", onData);
    child.stderr.on("data", onData);
    child.once("exit", onExit);
  });

  return {
    child,
    ready,
    stop() {
      if (!child.killed) {
        child.kill("SIGTERM");
      }
    },
  };
}

async function loadPlaywright() {
  try {
    return await import("playwright");
  } catch (error) {
    throw new Error(
      `playwright is required for test/scoped-registry-browser.check.js: ${error?.message ?? error}`,
    );
  }
}

describe("scoped registry browser fixture", () => {
  let serverHandle;
  let baseUrl;
  let browser;

  beforeAll(async () => {
    serverHandle = startFixtureServer();
    baseUrl = await serverHandle.ready;
    const { chromium } = await loadPlaywright();
    browser = await chromium.launch({ headless: true });
  }, 30000);

  afterAll(async () => {
    await browser?.close();
    serverHandle?.stop();
  });

  async function runProbe(name, argument, pathname = "") {
    const page = await browser.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    try {
      await page.goto(new URL(pathname, baseUrl).href, { waitUntil: "networkidle" });
      const result = await page.evaluate(
        async ({ probeName, probeArgument }) =>
          window.__repro[probeName](probeArgument),
        { probeName: name, probeArgument: argument },
      );
      assert.deepStrictEqual(errors, []);
      return result;
    } finally {
      await page.close();
    }
  }

  it("does not activate the registry shim for plain light-dom components", async () => {
    const result = await runProbe("probePlainLightDomCost");

    assert.deepStrictEqual(result, {
      hostCtor: "PlainLightHost",
      usesLightDom: true,
      shimActive: false,
      registryUnchanged: true,
      text: "plain",
    });
  }, 30000);

  it("initializes light-dom scoped children and preserves lifecycle identity", async () => {
    const result = await runProbe("probeLightDomInitialization");

    assert.deepStrictEqual(result.beforeReconnect, {
      hostCtor: "InitHost",
      hostUsesLightDom: true,
      childCtor: "InitChild",
      value: "bound-value",
      enabled: true,
      enabledAttribute: true,
      renderedValue: "bound-value",
      calls: ["child:constructor", "child:connected"],
    });
    assert.deepStrictEqual(result.afterReconnect, {
      sameChild: true,
      registryRestored: true,
      calls: [
        "child:constructor",
        "child:connected",
        "child:disconnected",
        "child:connected",
      ],
    });
  }, 30000);

  it("propagates scoped React Context bindings in light DOM across updates and reconnects", async () => {
    const result = await runProbe("probeScopedContextProvider");

    assert.deepStrictEqual(result, {
      initial: "violet",
      updated: "coral",
      falseValue: "false",
      reconnected: "reconnected",
      providerInitialized: true,
      contextIsExpando: false,
      valueIsExpando: false,
      sameProvider: true,
      sameReader: true,
    });
  }, 30000);

  it("resolves the nearest constructor for nested light-dom scopes sharing a tag", async () => {
    const result = await runProbe("probeNestedLightScopes");

    assert.deepStrictEqual(result, {
      outerHostCtor: "OuterHost",
      innerHostCtor: "InnerHost",
      outerItemCtor: "OuterItem",
      innerItemCtor: "InnerItem",
      outerKind: "outer",
      innerKind: "inner",
    });
  }, 30000);

  it("initializes a light -> shadow -> light -> shadow component chain", async () => {
    const result = await runProbe("probeLightShadowInteroperability");

    assert.deepStrictEqual(result, {
      outerCtor: "OuterLight",
      shadowCtor: "MiddleShadow",
      shadowHasRoot: true,
      shadowRegistryKind: "platform",
      innerCtor: "InnerLight",
      innerUsesLightDom: true,
      innerRegistryLeaf: "MixedLeaf",
      innerRegistryKind: "shim",
      leafRoot: "ShadowRoot",
      leafCtor: "MixedLeaf",
      leafInitialized: "leaf-ready",
      leafHtml: "leaf-ready",
      composedEventDetail: "leaf-ready",
    });
  }, 30000);

  it("delegates shadow scoping when the Web Components polyfill loads first", async () => {
    const result = await runProbe(
      "probeLightShadowInteroperability",
      undefined,
      "polyfill.html",
    );

    assert.deepStrictEqual(result, {
      outerCtor: "OuterLight",
      shadowCtor: "MiddleShadow",
      shadowHasRoot: true,
      shadowRegistryKind: "platform",
      innerCtor: "InnerLight",
      innerUsesLightDom: true,
      innerRegistryLeaf: "MixedLeaf",
      innerRegistryKind: "shim",
      leafRoot: "ShadowRoot",
      leafCtor: "MixedLeaf",
      leafInitialized: "leaf-ready",
      leafHtml: "leaf-ready",
      composedEventDetail: "leaf-ready",
    });
  }, 30000);

  it("initializes a shadow -> light -> scoped child chain", async () => {
    const result = await runProbe("probeShadowToLightInitialization");

    assert.deepStrictEqual(result, {
      shadowCtor: "ReverseShadow",
      lightCtor: "ReverseLight",
      lightUsesLightDom: true,
      leafCtor: "ReverseLeaf",
      leafInitialized: true,
      leafConnected: true,
    });
  }, 30000);

  it("keeps globally registered third-party elements initialized after shim activation", async () => {
    const result = await runProbe("probeGlobalElementInteroperability");

    assert.deepStrictEqual(result, {
      globalCtor: "ThirdPartyElement",
      scopedCtor: "ScopedChild",
      scopedInitialized: true,
      globalStillRegistered: "ThirdPartyElement",
      calls: ["global:constructor", "global:connected"],
    });
  }, 30000);

  it("upgrades an existing light-dom node after an asynchronous definition", async () => {
    const result = await runProbe("probeLateLightDefinition");

    assert.deepStrictEqual(result, {
      before: {
        ctor: "HTMLElement",
        value: "before-definition",
      },
      after: {
        sameNode: true,
        ctor: "LateChild",
        constructed: true,
        value: "before-definition",
        html: "before-definition",
      },
    });
  }, 30000);

  it("upgrades nested scoped children in the direct async story", async () => {
    const page = await browser.newPage();

    try {
      await page.goto(baseUrl, { waitUntil: "networkidle" });
      await page.evaluate(async () => {
        await window.__repro.renderStory("without");
      });
      await page.evaluate(async () => {
        await window.__repro.resolveMode("without-boundary");
      });

      const snapshot = await page.evaluate(() => window.__repro.snapshot());

      assert.strictEqual(snapshot.hostTag, "browser-repro-without-boundary");
      assert.strictEqual(snapshot.nestedProtoName, "NestedCard");
      assert.match(snapshot.nestedHtml ?? "", /Without boundary/);
    } finally {
      await page.close();
    }
  }, 30000);

  it("keeps nested scoped children working after with-boundary -> without-boundary navigation", async () => {
    const page = await browser.newPage();

    try {
      await page.goto(baseUrl, { waitUntil: "networkidle" });
      await page.evaluate(async () => {
        await window.__repro.renderStory("with");
      });
      await page.evaluate(async () => {
        await window.__repro.renderStory("without");
      });
      await page.evaluate(async () => {
        await window.__repro.resolveMode("with-boundary");
        await window.__repro.resolveMode("without-boundary");
      });

      const snapshot = await page.evaluate(() => window.__repro.snapshot());

      assert.strictEqual(snapshot.hostTag, "browser-repro-without-boundary");
      assert.strictEqual(snapshot.nestedProtoName, "NestedCard");
      assert.match(snapshot.nestedHtml ?? "", /Without boundary/);
    } finally {
      await page.close();
    }
  }, 30000);

  it("mounts the boundary content directly in the light-dom content region without a shadow mount host", async () => {
    const page = await browser.newPage();

    try {
      await page.goto(baseUrl, { waitUntil: "networkidle" });
      await page.evaluate(async () => {
        await window.__repro.renderStory("with");
      });
      await page.evaluate(async () => {
        await window.__repro.resolveMode("with-boundary");
      });

      const snapshot = await page.evaluate(() => window.__repro.snapshot());

      assert.strictEqual(snapshot.hostTag, "browser-repro-with-boundary");
      assert.strictEqual(snapshot.contentUsesMountHost, false);
      assert.strictEqual(snapshot.boundaryDirectPanelTag, "browser-repro-panel");
      assert.strictEqual(snapshot.boundaryDirectPanelCtor, "NestedPanel");
      assert.strictEqual(snapshot.panelCtor, "NestedPanel");
      assert.strictEqual(snapshot.nestedProtoName, "NestedCard");
      assert.match(snapshot.contentRegionHtml ?? "", /browser-repro-panel/);
    } finally {
      await page.close();
    }
  }, 30000);

  it("keeps same-tag light and native shadow registries independently initialized", async () => {
    const differentPage = await browser.newPage();
    await differentPage.goto(baseUrl, { waitUntil: "networkidle" });
    const differentTag = await differentPage.evaluate(async () =>
      window.__repro.probeScopedTagCollision({ sameTag: false })
    );
    await differentPage.close();

    const samePage = await browser.newPage();
    await samePage.goto(baseUrl, { waitUntil: "networkidle" });
    const sameTag = await samePage.evaluate(async () =>
      window.__repro.probeScopedTagCollision({ sameTag: true })
    );
    await samePage.close();

    assert.deepStrictEqual(differentTag, {
      sameTag: false,
      independent: {
        panelCtor: "ProbePanel",
        cardCtor: "ProbeCard",
      },
      nested: {
        hostCtor: "ProbeHost",
        panelCtor: "ProbePanel",
        cardCtor: "ProbeCard",
      },
    });

    assert.deepStrictEqual(sameTag, {
      sameTag: true,
      independent: {
        panelCtor: "ProbePanel",
        cardCtor: "ProbeCard",
      },
      nested: {
        hostCtor: "ProbeHost",
        panelCtor: "ProbePanel",
        cardCtor: "ProbeCard",
      },
    });
  }, 30000);
});
