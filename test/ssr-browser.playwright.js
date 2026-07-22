import fs from "node:fs/promises";
import path from "node:path";
import { expect, test } from "@playwright/test";
import { createSsrDevServer } from "../packages/ssr/src/index.js";

const repoRoot = path.resolve(import.meta.dirname, "..");

function viteFsSpecifier(filePath) {
  return `/@fs/${filePath}`;
}

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

export function SsrLevelFourLight({ label }) {
  static lightDom = true;
  return <SsrLeafShadow .label={label} />;
}

export function SsrLevelThreeShadow({ label }) {
  return (
    <section id="level-three">
      <SsrLevelFourLight .label={label} />
    </section>
  );
}

export function SsrLevelTwoLight({ label }) {
  static lightDom = true;
  return <SsrLevelThreeShadow .label={label} />;
}

export function SsrAppRoot({ name = "demo" }) {
  static styles = \`:host { display: block; }\`;

  const [title] = useState(name);
  return (
    <main id="app-root">
      <h1>{title}</h1>
      <SsrLevelTwoLight .label={title} />
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
import type { LitsxRenderable } from "@litsx/core";
import { SuspenseBoundary, SuspenseList, useOnConnect, useRef, useState } from "@litsx/core";

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

  return (
    <section class="guide" aria-label="Getting started with LitSX">
      <SuspenseList class="guide-list" reveal-order="forwards" tail="hidden">
        <SuspenseBoundary
          .fallbackRenderer={() => null}
          .contentRenderer={() => {
            suspendUntil(pendingStepsRef, 0, revealedCount);
            return (
              <GuideCard
                .eyebrow={"Getting started"}
                .titleRenderer={() => <><code>src/app.litsx</code>, then open <code>Getting Started</code></>}
                .contentRenderer={() => <p>First card body</p>}
              />
            );
          }}
        />

        <SuspenseBoundary
          .fallbackRenderer={() => null}
          .contentRenderer={() => {
            suspendUntil(pendingStepsRef, 1, revealedCount);
            return (
              <GuideCard
                .eyebrow={"Authored model"}
                .titleRenderer={() => <>Read <code>Authored Model</code> while you learn LitSX bindings</>}
                .contentRenderer={() => <p>Second card body</p>}
              />
            );
          }}
        />

        <SuspenseBoundary
          .fallbackRenderer={() => null}
          .contentRenderer={() => {
            suspendUntil(pendingStepsRef, 2, revealedCount);
            return (
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
            );
          }}
        />
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
import { hydratePage, LITSX_HYDRATION_PAYLOAD_PROPERTY } from "${viteFsSpecifier(path.join(repoRoot, "packages/ssr/src/hydration.js"))}";

try {
  await hydratePage({
    async register() {
      const { defineSsrComponents } = await import("./components.client.litsx");
      defineSsrComponents();
    },
  });
} catch (error) {
  window.__litsxSsrBrowserError = error instanceof Error ? error.message : String(error);
}

const root = document.querySelector("ssr-app-root");
window.__litsxSsrBrowserResult = {
  error: window.__litsxSsrBrowserError ?? null,
  rootPayload: root?.[LITSX_HYDRATION_PAYLOAD_PROPERTY] ?? null,
  rootText: root?.shadowRoot?.querySelector("#app-root")?.textContent ?? "",
  hasDeclarativeShadowDom: Boolean(root?.shadowRoot),
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
    await page.waitForFunction(() => Boolean(window.__litsxSsrBrowserResult));

    const browserResult = await page.evaluate(() => window.__litsxSsrBrowserResult);
    expect(consoleErrors).toEqual([]);
    expect(browserResult.error).toBe(null);
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
  hydratePage,
  registerHydrationModules,
} from "${viteFsSpecifier(hydrationEntryPath)}";

try {
  await hydratePage({
    clientImports: [],
    register: () => registerHydrationModules([
      () => import("./components.client.litsx"),
    ]),
  });
} catch (error) {
  window.__litsxSsrRegisterBrowserError = error instanceof Error ? error.message : String(error);
}

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
  error: window.__litsxSsrRegisterBrowserError ?? null,
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
    expect(browserResult.error).toBe(null);
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
import { hydratePage } from "${viteFsSpecifier(path.join(repoRoot, "packages/ssr/src/hydration.js"))}";

try {
  await hydratePage({
    async register() {
      const { defineSsrComponents } = await import("./components.client.litsx");
      defineSsrComponents();
    },
  });
} catch (error) {
  window.__litsxSsrBrowserError = error instanceof Error ? error.message : String(error);
}

function collectGuideState() {
  return [...document.querySelectorAll("suspense-boundary")].map((boundary, index) => {
    const card = boundary.querySelector("guide-card");
    const article = card?.shadowRoot?.querySelector(".guide-card");
    return {
      index,
      pending: boundary.pending,
      resolved: boundary.resolved,
      showing: boundary.getAttribute("showing"),
      phase: boundary.getAttribute("phase"),
      boundaryRect: {
        width: boundary.getBoundingClientRect().width,
        height: boundary.getBoundingClientRect().height,
      },
      cardRect: card ? {
        width: card.getBoundingClientRect().width,
        height: card.getBoundingClientRect().height,
      } : null,
      articleRect: article ? {
        width: article.getBoundingClientRect().width,
        height: article.getBoundingClientRect().height,
      } : null,
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
    error: window.__litsxSsrBrowserError ?? null,
    listRect: (() => {
      const list = document.querySelector("suspense-list");
      return list ? {
        width: list.getBoundingClientRect().width,
        height: list.getBoundingClientRect().height,
      } : null;
    })(),
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
    expect(result.error).toBe(null);
    expect(result.listRect.height).toBeGreaterThan(0);
    expect(result.boundaries).toHaveLength(3);
    expect(result.boundaries.map((entry) => entry.showing)).toEqual([
      "content",
      "content",
      "content",
    ]);
    expect(result.boundaries.every((entry) => entry.resolved === true)).toBe(true);
    expect(result.boundaries.every((entry) => entry.cardRect && entry.cardRect.height > 0)).toBe(true);
    expect(result.boundaries.every((entry) => entry.articleRect && entry.articleRect.height > 0)).toBe(true);
  } finally {
    await server.close();
  }
});
