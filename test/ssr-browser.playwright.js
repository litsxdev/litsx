import fs from "node:fs/promises";
import path from "node:path";
import { expect, test } from "@playwright/test";
import { createSsrDevServer } from "../packages/ssr/src/index.js";
import { LITSX_HYDRATION_PAYLOAD_PROPERTY } from "../packages/ssr/src/hydration.js";
import { __litsxNoscript } from "../packages/core/src/index.js";
import { html } from "lit";

const repoRoot = path.resolve(import.meta.dirname, "..");

function viteFsSpecifier(filePath) {
  return `/@fs/${filePath}`;
}

test("keeps dynamic noscript fallback markup inert with JavaScript and usable without it", async ({ browser, page }) => {
  const server = await createSsrDevServer({
    root: repoRoot,
    logLevel: "silent",
    host: "127.0.0.1",
    strictPort: false,
    render({ html: serverHtml }) {
      const title = "No JavaScript fallback";
      return serverHtml`<main><noscript data-litsx-noscript=${__litsxNoscript(() => html`
        <section id="noscript-fallback"><h2>${title}</h2><a href="/browse">Browse</a></section>
      `)}></noscript></main>`;
    },
  });
  await server.listen();

  try {
    const url = server.resolvedUrls.local[0];
    const consoleErrors = [];
    page.on("console", (message) => {
      if (message.type() === "error") consoleErrors.push(message.text());
    });
    await page.goto(url);
    await expect(page.locator("#noscript-fallback")).toHaveCount(0);
    expect(consoleErrors).toEqual([]);

    const noScriptContext = await browser.newContext({ javaScriptEnabled: false });
    const noScriptPage = await noScriptContext.newPage();
    await noScriptPage.goto(url);
    await expect(noScriptPage.locator("#noscript-fallback")).toHaveText("No JavaScript fallbackBrowse");
    await expect(noScriptPage.locator("#noscript-fallback a")).toHaveAttribute("href", "/browse");
    await noScriptContext.close();
  } finally {
    await server.close();
  }
});

test("hydrates a compiled LitSX host containing a dynamic noscript fallback without errors", async ({ page }) => {
  const tempRoot = path.join(repoRoot, "test-results");
  await fs.mkdir(tempRoot, { recursive: true });
  const tempDir = await fs.mkdtemp(path.join(tempRoot, "litsx-ssr-noscript-hydration-"));
  const srcDir = path.join(tempDir, "src");
  await fs.mkdir(srcDir, { recursive: true });
  await fs.writeFile(path.join(srcDir, "noscript-host.litsx"), `
export function NoscriptHost() {
  const title = "Hydrated fallback";
  return <main><noscript><NoscriptCard .title={title} /></noscript><p id="live-content">Live content</p></main>;
}

export function NoscriptCard({ title }) {
  return <section id="noscript-fallback"><h2>{title}</h2></section>;
}

export function defineNoscriptHost() {
  if (!customElements.get("noscript-host")) {
    customElements.define("noscript-host", NoscriptHost);
  }
}
`);
  await fs.writeFile(path.join(srcDir, "main.js"), `
import { defineNoscriptHost } from "./noscript-host.litsx";
defineNoscriptHost();
`);
  const server = await createSsrDevServer({
    root: tempDir,
    clientEntry: "./src/main.js",
    logLevel: "silent",
    host: "127.0.0.1",
    strictPort: false,
    elements(loader) {
      return {
        "noscript-host": async () => (await loader("./src/noscript-host.litsx")).NoscriptHost,
      };
    },
    render({ html: serverHtml }) {
      return serverHtml`<noscript-host></noscript-host>`;
    },
  });
  await server.listen();

  try {
    const consoleErrors = [];
    page.on("console", (message) => {
      if (message.type() === "error") consoleErrors.push(message.text());
    });
    await page.goto(server.resolvedUrls.local[0]);
    await page.waitForFunction(() => customElements.get("noscript-host") !== undefined);
    const result = await page.evaluate(() => {
      const root = document.querySelector("noscript-host")?.shadowRoot;
      return {
        fallbackElementCount: root?.querySelectorAll("#noscript-fallback").length ?? 0,
        liveText: root?.querySelector("#live-content")?.textContent ?? "",
      };
    });
    expect(consoleErrors).toEqual([]);
    expect(result.fallbackElementCount).toBe(0);
    expect(result.liveText).toBe("Live content");
  } finally {
    await server.close();
  }
});

function createComponentsSource() {
  return `
import { useOnConnect, useState } from "@litsx/core";

export function SsrLeafShadow({ label }) {
  static styles = \`:host { display: inline-block; color: rgb(0, 96, 128); }\`;

  useOnConnect(() => {
    window.__litsxClientConnectCalls = (window.__litsxClientConnectCalls ?? 0) + 1;
  }, []);
  const [count, setCount] = useState(3);
  return <button id="leaf-button" @click={() => setCount(count + 1)}>leaf:{label}:{count}</button>;
}

export function SsrLightLayer({ children, level }) {
  static lightDom = true;

  return <section class="light-layer" data-level={level}>{children}</section>;
}

export function SsrShadowLayer({ children, level }) {
  static styles = \`:host { display: contents; }\`;

  return <section class="shadow-layer" data-level={level}>{children}</section>;
}

export function SsrAppRoot({ name = "demo" }) {
  static styles = \`:host { display: block; }\`;

  const [title] = useState(name);
  return (
    <main id="app-root">
      <h1>{title}</h1>
      <SsrShadowLayer .level={1}>
        <SsrLightLayer .level={2}>
          <SsrShadowLayer .level={3}>
            <SsrLightLayer .level={4}>
              <SsrLeafShadow .label={title} />
            </SsrLightLayer>
          </SsrShadowLayer>
        </SsrLightLayer>
      </SsrShadowLayer>
    </main>
  );
}

export function defineSsrComponents() {
  if (!customElements.get("ssr-app-root")) {
    customElements.define("ssr-app-root", SsrAppRoot);
  }
}
`;
}

function createSuspenseComponentsSource() {
  return `
import { SuspenseBoundary, SuspenseList, useOnConnect, useRef, useState, type LitsxRenderable } from "@litsx/core";

function createDeferred() {
  let resolve = null;
  const promise = new Promise((nextResolve) => {
    resolve = nextResolve;
  });
  return { promise, resolve };
}

function resolvePendingSteps(pendingStepsRef) {
  pendingStepsRef.current ??= new Map();
  return pendingStepsRef.current;
}

function suspendUntil(pendingStepsRef, stepIndex, revealedCount) {
  if (revealedCount > stepIndex) {
    return;
  }

  const pendingSteps = resolvePendingSteps(pendingStepsRef);
  let pending = pendingSteps.get(stepIndex);
  if (!pending) {
    pending = createDeferred();
    pendingSteps.set(stepIndex, pending);
  }

  throw pending.promise;
}

export const GuideCard = ({
  eyebrow = "",
  titleRenderer = () => null,
  contentRenderer = () => null,
}: {
  eyebrow?: string;
  titleRenderer?: () => LitsxRenderable;
  contentRenderer?: () => LitsxRenderable;
}) => {
  static styles = \`
    :host { display: block; }
    .guide-card {
      padding: 24px;
      border: 1px solid rgba(21, 32, 51, 0.08);
      border-radius: 24px;
      background:
        linear-gradient(180deg, rgba(255, 255, 255, 0.78), transparent 140px),
        rgba(255, 250, 245, 0.96);
      box-shadow: 0 18px 48px rgba(21, 32, 51, 0.08);
      animation: guide-card-enter 280ms ease both;
    }
    @keyframes guide-card-enter {
      from { opacity: 0; transform: translateY(14px); }
      to { opacity: 1; transform: translateY(0); }
    }
  \`;

  return (
    <article class="guide-card">
      <p class="guide-card__eyebrow">{eyebrow}</p>
      <h2>{titleRenderer()}</h2>
      {contentRenderer()}
    </article>
  );
};

export const SuspenseGuideApp = () => {
  static styles = \`
    :host { display: block; padding: 24px; font-family: sans-serif; }
    .guide-list { display: grid; gap: 18px; grid-template-columns: repeat(3, minmax(0, 1fr)); }
  \`;

  const delays = [180, 220, 240];
  const pendingStepsRef = useRef(null);
  const [revealedCount, setRevealedCount] = useState(0);
  const pendingSteps = resolvePendingSteps(pendingStepsRef);

  if (revealedCount > 0) {
    for (const [stepIndex, deferred] of pendingSteps) {
      if (stepIndex < revealedCount) {
        pendingSteps.delete(stepIndex);
        deferred.resolve?.();
      }
    }
  }

  useOnConnect(() => {
    for (const deferred of resolvePendingSteps(pendingStepsRef).values()) {
      deferred.resolve?.();
    }
    pendingStepsRef.current = new Map();
    setRevealedCount(0);

    const [firstDelay = 0, ...remainingDelays] = delays;
    let intervalId = null;

    const firstTimeoutId = setTimeout(() => {
      setRevealedCount((count) => count + 1);

      if (remainingDelays.length === 0) {
        return;
      }

      const [intervalDelay = 0] = remainingDelays;
      let intervalIndex = 0;
      intervalId = setInterval(() => {
        setRevealedCount((count) => count + 1);
        intervalIndex += 1;
        if (intervalIndex >= remainingDelays.length) {
          clearInterval(intervalId);
          intervalId = null;
        }
      }, intervalDelay);
    }, firstDelay);

    return () => {
      clearTimeout(firstTimeoutId);
      if (intervalId != null) {
        clearInterval(intervalId);
      }
      for (const deferred of resolvePendingSteps(pendingStepsRef).values()) {
        deferred.resolve?.();
      }
      pendingStepsRef.current = new Map();
    };
  }, []);

  const renderGuideCard = (stepIndex, renderCard) => {
    suspendUntil(pendingStepsRef, stepIndex, revealedCount);
    return renderCard();
  };

  return (
    <section class="guide" aria-label="Getting started with LitSX">
      <SuspenseList class="guide-list" reveal-order="forwards" tail="hidden">
        <SuspenseBoundary fallback={null}>
          {renderGuideCard(0, () => (
              <GuideCard
                .eyebrow={"Getting started"}
                .titleRenderer={() => <><code>src/app.litsx</code>, then open <code>Getting Started</code></>}
                .contentRenderer={() => <p>First card body</p>}
              />
          ))}
        </SuspenseBoundary>

        <SuspenseBoundary fallback={null}>
          {renderGuideCard(1, () => (
              <GuideCard
                .eyebrow={"Authored model"}
                .titleRenderer={() => <>Read <code>Authored Model</code> while you learn LitSX bindings</>}
                .contentRenderer={() => <p>Second card body</p>}
              />
          ))}
        </SuspenseBoundary>

        <SuspenseBoundary fallback={null}>
          {renderGuideCard(2, () => (
              <GuideCard
                .eyebrow={"Tooling flow"}
                .titleRenderer={() => "Pair the tooling docs with your daily loop"}
                .contentRenderer={() => (
                  <ul>
                    <li><code>npm run dev</code></li>
                    <li><code>npm run lint</code></li>
                  </ul>
                )}
              />
          ))}
        </SuspenseBoundary>
      </SuspenseList>
    </section>
  );
};

export function defineSsrComponents() {
  if (!customElements.get("suspense-guide-app")) {
    customElements.define("suspense-guide-app", SuspenseGuideApp);
  }
  if (!customElements.get("guide-card")) {
    customElements.define("guide-card", GuideCard);
  }
}
`;
}

test("hydrates a real browser page rendered by @litsx/ssr", async ({ page }) => {
  const tempRoot = path.join(repoRoot, "test-results");
  await fs.mkdir(tempRoot, { recursive: true });
  const tempDir = await fs.mkdtemp(path.join(tempRoot, "litsx-ssr-browser-"));
  const srcDir = path.join(tempDir, "src");
  await fs.mkdir(srcDir, { recursive: true });

  const clientComponentsPath = path.join(srcDir, "components.client.litsx");
  const clientEntryPath = path.join(srcDir, "main.js");
  const componentsSource = createComponentsSource();
  await fs.writeFile(clientComponentsPath, componentsSource);
  await fs.writeFile(
    clientEntryPath,
    `
import { defineSsrComponents } from "./components.client.litsx";

// The SSR bootstrap imports this entry through hydratePage({ register }).
// Entries register custom elements; they must not hydrate the document again.
defineSsrComponents();
`,
  );
  const server = await createSsrDevServer({
    root: tempDir,
    clientEntry: "./src/main.js",
    logLevel: "silent",
    host: "127.0.0.1",
    strictPort: false,
    elements(loader) {
      return {
        "ssr-app-root": async () =>
          (await loader("./src/components.client.litsx")).SsrAppRoot,
      };
    },
    render({ html }) {
      return html`<ssr-app-root .name=${"Real Browser"}></ssr-app-root>`;
    },
  });
  await server.listen();

  try {
    const url = server.resolvedUrls.local[0];
    const consoleErrors = [];
    page.on("console", (message) => {
      if (message.type() === "error") {
        consoleErrors.push(message.text());
      }
    });
    await page.goto(url);
    await page.waitForFunction(() => window.__litsxClientConnectCalls === 1);

    const browserResult = await page.evaluate((hydrationPayloadProperty) => {
      const root = document.querySelector("ssr-app-root");
      return {
        rootPayload: root?.[hydrationPayloadProperty] ?? null,
        rootText: root?.shadowRoot?.querySelector("#app-root")?.textContent ?? "",
        hasDeclarativeShadowDom: Boolean(root?.shadowRoot),
      };
    }, LITSX_HYDRATION_PAYLOAD_PROPERTY);
    expect(consoleErrors).toEqual([]);
    expect(browserResult.hasDeclarativeShadowDom).toBe(true);
    expect(browserResult.rootText).toContain("Real Browser");
    expect(browserResult.rootPayload).toEqual({
      props: {
        name: "Real Browser",
      },
    });
    await page.waitForFunction(() => window.__litsxClientConnectCalls === 1);
    await page.waitForFunction(() => {
      const buttons = [];
      const collectButtons = (root) => {
        for (const element of root.querySelectorAll("*")) {
          if (element.id === "leaf-button") {
            buttons.push(element);
          }
          if (element.shadowRoot) {
            collectButtons(element.shadowRoot);
          }
        }
      };
      collectButtons(document);
      return buttons.length === 1 && buttons[0].textContent === "leaf:Real Browser:3";
    });
    const clickResult = await page.evaluate(async () => {
      const root = document.querySelector("ssr-app-root");
      const buttons = [];
      const collectButtons = (searchRoot) => {
        for (const element of searchRoot.querySelectorAll("*")) {
          if (element.id === "leaf-button") {
            buttons.push(element);
          }
          if (element.shadowRoot) {
            collectButtons(element.shadowRoot);
          }
        }
      };
      collectButtons(document);
      const button = buttons[0];
      const leaf = button.getRootNode().host;
      button.click();
      await leaf.updateComplete;
      buttons.length = 0;
      collectButtons(document);
      return {
        appRootCount: root.renderRoot.querySelectorAll("#app-root").length,
        buttonCount: buttons.length,
        buttonText: buttons[0]?.textContent ?? "",
      };
    });
    expect(clickResult).toEqual({
      appRootCount: 1,
      buttonCount: 1,
      buttonText: "leaf:Real Browser:4",
    });
  } finally {
    await server.close();
  }
});

test("hydrates without DOM duplication when using only the public hydration module-registration API", async ({ page }) => {
  const tempRoot = path.join(repoRoot, "test-results");
  await fs.mkdir(tempRoot, { recursive: true });
  const tempDir = await fs.mkdtemp(path.join(tempRoot, "litsx-ssr-browser-register-"));
  const srcDir = path.join(tempDir, "src");
  await fs.mkdir(srcDir, { recursive: true });

  const clientComponentsPath = path.join(srcDir, "components.client.litsx");
  const clientEntryPath = path.join(srcDir, "main.js");
  const hydrationEntryPath = path.join(repoRoot, "packages/ssr/src/hydration.js");
  await fs.writeFile(clientComponentsPath, createComponentsSource());
  await fs.writeFile(
    clientEntryPath,
    `
import {
  registerHydrationModules,
} from "${viteFsSpecifier(hydrationEntryPath)}";

// The page bootstrap owns hydratePage(). This entry uses the public module
// registration API to define the hydratable exports it provides.
await registerHydrationModules([
  () => import("./components.client.litsx"),
]);

function collectButtons() {
  const buttons = [];
  const visit = (root) => {
    for (const element of root.querySelectorAll("*")) {
      if (element.id === "leaf-button") {
        buttons.push(element);
      }
      if (element.shadowRoot) {
        visit(element.shadowRoot);
      }
    }
  };
  visit(document);
  return buttons;
}

const root = document.querySelector("ssr-app-root");
window.__litsxSsrRegisterBrowserResult = {
  hasDeclarativeShadowDom: Boolean(root?.shadowRoot),
  appRootCount: root?.renderRoot?.querySelectorAll("#app-root").length ?? 0,
  buttonCount: collectButtons().length,
  buttonText: collectButtons()[0]?.textContent ?? "",
};
`,
  );

  const server = await createSsrDevServer({
    root: tempDir,
    clientEntry: "./src/main.js",
    logLevel: "silent",
    host: "127.0.0.1",
    strictPort: false,
    elements(loader) {
      return {
        "ssr-app-root": async () =>
          (await loader("./src/components.client.litsx")).SsrAppRoot,
      };
    },
    render({ html }) {
      return html`<ssr-app-root .name=${"Register API"}></ssr-app-root>`;
    },
  });
  await server.listen();

  try {
    const url = server.resolvedUrls.local[0];
    const consoleErrors = [];
    page.on("console", (message) => {
      if (message.type() === "error") {
        consoleErrors.push(message.text());
      }
    });
    await page.goto(url);
    await page.waitForFunction(() => Boolean(window.__litsxSsrRegisterBrowserResult));

    const browserResult = await page.evaluate(() => window.__litsxSsrRegisterBrowserResult);
    expect(consoleErrors).toEqual([]);
    expect(browserResult.hasDeclarativeShadowDom).toBe(true);
    expect(browserResult.appRootCount).toBe(1);
    expect(browserResult.buttonCount).toBe(1);
    expect(browserResult.buttonText).toBe("leaf:Register API:3");
    await page.waitForFunction(() => window.__litsxClientConnectCalls === 1);
  } finally {
    await server.close();
  }
});

test("reveals suspense-list guide cards after SSR hydration", async ({ page }) => {
  const tempRoot = path.join(repoRoot, "test-results");
  await fs.mkdir(tempRoot, { recursive: true });
  const tempDir = await fs.mkdtemp(path.join(tempRoot, "litsx-ssr-suspense-browser-"));
  const srcDir = path.join(tempDir, "src");
  await fs.mkdir(srcDir, { recursive: true });

  const clientComponentsPath = path.join(srcDir, "components.client.litsx");
  const clientEntryPath = path.join(srcDir, "main.js");
  await fs.writeFile(clientComponentsPath, createSuspenseComponentsSource());
  await fs.writeFile(
    clientEntryPath,
    `
import { defineSsrComponents } from "./components.client.litsx";

defineSsrComponents();

function getGuideRoot() {
  return document.querySelector("suspense-guide-app")?.shadowRoot ?? document;
}

function findNestedElement(root, selector) {
  if (root.shadowRoot) {
    const shadowMatch = findNestedElement(root.shadowRoot, selector);
    if (shadowMatch) {
      return shadowMatch;
    }
  }

  const directMatch = root.querySelector(selector);
  if (directMatch) {
    return directMatch;
  }

  for (const element of root.querySelectorAll("*")) {
    if (element.shadowRoot) {
      const nestedMatch = findNestedElement(element.shadowRoot, selector);
      if (nestedMatch) {
        return nestedMatch;
      }
    }
  }

  return null;
}

function collectGuideState() {
  return [...getGuideRoot().querySelectorAll("suspense-boundary")].map((boundary, index) => {
    const card = findNestedElement(boundary, "guide-card");
    return {
      index,
      text: card?.shadowRoot?.textContent?.replace(/\\s+/g, " ").trim() ?? "",
    };
  });
}

window.__litsxSsrSuspenseGuideSnapshots = [];
const snapshotInterval = setInterval(() => {
  window.__litsxSsrSuspenseGuideSnapshots.push(collectGuideState());
}, 100);

setTimeout(() => {
  clearInterval(snapshotInterval);
  window.__litsxSsrSuspenseGuideResult = {
    boundaries: collectGuideState(),
    snapshots: window.__litsxSsrSuspenseGuideSnapshots,
  };
}, 1400);
`,
  );

  const server = await createSsrDevServer({
    root: tempDir,
    clientEntry: "./src/main.js",
    logLevel: "silent",
    host: "127.0.0.1",
    strictPort: false,
    elements(loader) {
      return {
        "suspense-guide-app": async () =>
          (await loader("./src/components.client.litsx")).SuspenseGuideApp,
      };
    },
    render({ html }) {
      return html`<suspense-guide-app></suspense-guide-app>`;
    },
  });
  await server.listen();

  try {
    const url = server.resolvedUrls.local[0];
    const consoleErrors = [];
    page.on("console", (message) => {
      if (message.type() === "error") {
        consoleErrors.push(message.text());
      }
    });
    await page.goto(url);
    await page.waitForFunction(() => Boolean(window.__litsxSsrSuspenseGuideResult), null, {
      timeout: 5000,
    });

    const result = await page.evaluate(() => window.__litsxSsrSuspenseGuideResult);
    expect(consoleErrors).toEqual([]);
    expect(result.boundaries).toHaveLength(3);
    expect(result.boundaries.map((entry) => entry.text)).toEqual([
      expect.stringContaining("First card body"),
      expect.stringContaining("Second card body"),
      expect.stringContaining("npm run dev"),
    ]);
  } finally {
    await server.close();
  }
});
