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

  it("characterizes same-tag light-dom shim collisions against native shadow hosts", async () => {
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
        panelCtor: "HTMLElement",
        cardCtor: null,
      },
      nested: {
        hostCtor: "ProbeHost",
        panelCtor: "HTMLElement",
        cardCtor: null,
      },
    });
  }, 30000);
});
