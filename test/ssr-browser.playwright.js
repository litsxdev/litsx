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

test("restores an SSR resource snapshot before the first hydrated render", async ({ page }) => {
  const tempRoot = path.join(repoRoot, "test-results");
  await fs.mkdir(tempRoot, { recursive: true });
  const tempDir = await fs.mkdtemp(path.join(tempRoot, "litsx-resource-snapshot-"));
  const srcDir = path.join(tempDir, "src");
  await fs.mkdir(srcDir, { recursive: true });
  await fs.writeFile(path.join(srcDir, "resource-card.litsx"), `
import { useSsrResourceSnapshot } from "@litsx/core";

const messages = new Map();
if (typeof window === "undefined") messages.set("title", "SSR resource");

function useMessage() {
  useSsrResourceSnapshot({
    key: "library:i18n",
    capture: () => Object.fromEntries(messages),
    restore(snapshot) {
      for (const [key, value] of Object.entries(snapshot)) messages.set(key, value);
      if (typeof window !== "undefined") {
        window.__resourceRestoreCount = (window.__resourceRestoreCount ?? 0) + 1;
      }
    },
  });
  if (!messages.has("title")) {
    if (typeof window !== "undefined") {
      window.__resourceClientLoadCount = (window.__resourceClientLoadCount ?? 0) + 1;
    }
    throw new Error("resource was not restored before the first client render");
  }
  return messages.get("title");
}

export function ResourceCard() {
  return <h1 id="title">{useMessage()}</h1>;
}

export function defineResourceCard() {
  if (!customElements.get("resource-card")) customElements.define("resource-card", ResourceCard);
}
`);
  await fs.writeFile(path.join(srcDir, "main.js"), `
import { defineResourceCard } from "./resource-card.litsx";
defineResourceCard();
`);

  const server = await createSsrDevServer({
    root: tempDir,
    clientEntry: "./src/main.js",
    logLevel: "silent",
    host: "127.0.0.1",
    strictPort: false,
    elements(loader) {
      return {
        "resource-card": async () => {
          const module = await loader("./src/resource-card.litsx");
          return module.ResourceCard;
        },
      };
    },
    render({ html: serverHtml }) {
      return serverHtml`<resource-card></resource-card>`;
    },
  });
  await server.listen();

  try {
    const consoleErrors = [];
    page.on("console", (message) => {
      if (message.type() === "error") consoleErrors.push(message.text());
    });
    const url = server.resolvedUrls.local[0];
    const documentSource = await (await fetch(url)).text();
    expect(documentSource).toContain('"resources":{"library:i18n":{"title":"SSR resource"}}');
    await page.goto(url);
    // Vite may perform one development reload after materializing the first
    // client asset graph. Assert against the settled hydration document.
    await page.waitForTimeout(1_000);
    await page.waitForLoadState("networkidle");
    await page.waitForFunction(() => customElements.get("resource-card") !== undefined);
    const result = await page.evaluate(() => ({
      title: document.querySelector("resource-card")?.shadowRoot?.querySelector("#title")?.textContent,
      titleCount: document.querySelector("resource-card")?.shadowRoot?.querySelectorAll("#title").length,
      restores: window.__resourceRestoreCount ?? 0,
      clientLoads: window.__resourceClientLoadCount ?? 0,
    }));
    expect(consoleErrors).toEqual([]);
    expect(result).toEqual({
      title: "SSR resource",
      titleCount: 1,
      restores: 1,
      clientLoads: 0,
    });
  } finally {
    await server.close();
  }
});

test("hydrates both useExpose signatures without executing imperative handles during SSR", async ({ page }) => {
  const tempRoot = path.join(repoRoot, "test-results");
  await fs.mkdir(tempRoot, { recursive: true });
  const tempDir = await fs.mkdtemp(path.join(tempRoot, "litsx-ssr-expose-"));
  const srcDir = path.join(tempDir, "src");
  await fs.mkdir(srcDir, { recursive: true });
  await fs.writeFile(path.join(srcDir, "expose-card.litsx"), `
import { useExpose, useOnConnect, useRef } from "@litsx/core";

export function ExposeCard() {
  const forwardedRef = useRef(null);

  useExpose(() => {
    if (typeof window === "undefined") throw new Error("host expose factory ran during SSR");
    return {
      focus() {
        window.__hostExposeCalls = (window.__hostExposeCalls ?? 0) + 1;
      },
    };
  }, []);

  useExpose(forwardedRef, () => {
    if (typeof window === "undefined") throw new Error("ref expose factory ran during SSR");
    return {
      focus() {
        window.__refExposeCalls = (window.__refExposeCalls ?? 0) + 1;
      },
    };
  }, []);

  useOnConnect(() => {
    window.__forwardedExposeHandle = forwardedRef.current;
  }, []);

  return <p id="status">Expose ready</p>;
}

export function defineExposeCard() {
  if (!customElements.get("expose-card")) customElements.define("expose-card", ExposeCard);
}
`);
  await fs.writeFile(path.join(srcDir, "main.js"), `
import { defineExposeCard } from "./expose-card.litsx";
defineExposeCard();
`);

  const server = await createSsrDevServer({
    root: tempDir,
    clientEntry: "./src/main.js",
    logLevel: "silent",
    host: "127.0.0.1",
    strictPort: false,
    elements(loader) {
      return {
        "expose-card": async () => (await loader("./src/expose-card.litsx")).ExposeCard,
      };
    },
    render({ html: serverHtml }) {
      return serverHtml`<expose-card></expose-card>`;
    },
  });
  await server.listen();

  try {
    const consoleErrors = [];
    page.on("console", (message) => {
      if (message.type() === "error") consoleErrors.push(message.text());
    });
    const url = server.resolvedUrls.local[0];
    const documentSource = await (await fetch(url)).text();
    expect(documentSource).toContain("Expose ready");

    await page.goto(url);
    await page.waitForFunction(() => {
      const element = document.querySelector("expose-card");
      return typeof element?.focus === "function" &&
        typeof window.__forwardedExposeHandle?.focus === "function";
    });
    const result = await page.evaluate(() => {
      const element = document.querySelector("expose-card");
      element.focus();
      window.__forwardedExposeHandle.focus();
      return {
        text: element.shadowRoot?.querySelector("#status")?.textContent,
        hostCalls: window.__hostExposeCalls ?? 0,
        refCalls: window.__refExposeCalls ?? 0,
      };
    });

    expect(consoleErrors).toEqual([]);
    expect(result).toEqual({
      text: "Expose ready",
      hostCalls: 1,
      refCalls: 1,
    });
  } finally {
    await server.close();
  }
});

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

test("hydrates nested LitSX property bindings for arrays, objects, and callbacks", async ({ browser, page }) => {
  const tempRoot = path.join(repoRoot, "test-results");
  await fs.mkdir(tempRoot, { recursive: true });
  const tempDir = await fs.mkdtemp(path.join(tempRoot, "litsx-nested-properties-"));
  const srcDir = path.join(tempDir, "src");
  await fs.mkdir(srcDir, { recursive: true });
  await fs.writeFile(path.join(srcDir, "nested-properties.litsx"), `
import { useOnConnect, useState } from "@litsx/core";

export function NestedPropertyGrandchild({
  items = [],
  config = {},
  value = 0,
  enabled = false,
  onNavigate = () => {},
}) {
  useOnConnect(() => {
    window.__nestedPropertyState = {
      itemIds: items.map((item) => item.id),
      pageSize: config.pageSize,
      value,
      enabled,
      callbackType: typeof onNavigate,
    };
  }, [items, config, enabled, onNavigate]);
  return <button id="navigate" @click={() => onNavigate(items[0])}>{items[0]?.label}:{config.pageSize}:{value}:{String(enabled)}</button>;
}

export function NestedPropertyChild({
  items = [],
  config = {},
  value = 0,
  enabled = false,
  onNavigate = () => {},
}) {
  return (
    <NestedPropertyGrandchild
      .items={items}
      .config={config}
      .value={value}
      ?enabled={enabled}
      .onNavigate={onNavigate}
    />
  );
}

export function NestedPropertyParent({
  items = [],
  config = {},
  resolveItems = (value) => value,
  resolveConfig = (value) => value,
  createNavigateHandler = () => (item) => {
    window.__nestedNavigation = item.id;
  },
}) {
  const [revision, setRevision] = useState(0);
  return (
    <section>
      <button id="refresh" @click={() => setRevision(revision + 1)}>Refresh</button>
      <NestedPropertyChild
        .items={resolveItems(items)}
        .config={resolveConfig(config)}
        .value={revision}
        ?enabled={true}
        .onNavigate={createNavigateHandler()}
      />
    </section>
  );
}

export function defineNestedProperties() {
  if (!customElements.get("nested-property-parent")) {
    customElements.define("nested-property-parent", NestedPropertyParent);
  }
}
`);
  await fs.writeFile(path.join(srcDir, "main.js"), `
import { defineNestedProperties } from "./nested-properties.litsx";
defineNestedProperties();
`);

  const server = await createSsrDevServer({
    root: tempDir,
    clientEntry: "./src/main.js",
    logLevel: "silent",
    host: "127.0.0.1",
    strictPort: false,
    elements(loader) {
      return {
        "nested-property-parent": async () =>
          (await loader("./src/nested-properties.litsx")).NestedPropertyParent,
      };
    },
    render({ html: serverHtml }) {
      return serverHtml`
        <nested-property-parent
          .items=${[{ id: "first", label: "First item" }]}
          .config=${{ pageSize: 24 }}
        ></nested-property-parent>
      `;
    },
  });
  await server.listen();

  try {
    const pageErrors = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));
    const url = server.resolvedUrls.local[0];
    const ssrHtml = await (await fetch(url)).text();
    expect(ssrHtml.match(/<nested-property-child\b/g) ?? []).toHaveLength(1);
    expect(ssrHtml.match(/<nested-property-grandchild\b/g) ?? []).toHaveLength(1);

    const ssrContext = await browser.newContext({ javaScriptEnabled: false });
    const ssrPage = await ssrContext.newPage();
    await ssrPage.goto(url);
    expect(await ssrPage.evaluate(() => {
      const parent = document.querySelector("nested-property-parent");
      const children = parent?.shadowRoot?.querySelectorAll("nested-property-child") ?? [];
      const child = children[0];
      return {
        childCount: children.length,
        grandchildCount:
          child?.shadowRoot?.querySelectorAll("nested-property-grandchild").length ?? 0,
      };
    })).toEqual({ childCount: 1, grandchildCount: 1 });
    await ssrContext.close();

    await page.goto(url, { waitUntil: "networkidle" });
    await page.waitForFunction(() => Boolean(window.__nestedPropertyState));

    expect(await page.evaluate(() => window.__nestedPropertyState)).toEqual({
      itemIds: ["first"],
      pageSize: 24,
      value: 0,
      enabled: true,
      callbackType: "function",
    });
    await page.locator("nested-property-parent").evaluate((parent) =>
      parent.shadowRoot.querySelector("#refresh").click()
    );
    await page.waitForFunction(() => {
      const parent = document.querySelector("nested-property-parent");
      const child = parent?.shadowRoot?.querySelector("nested-property-child");
      const grandchild = child?.shadowRoot?.querySelector("nested-property-grandchild");
      return grandchild?.value === 1;
    });
    expect(await page.evaluate(() => {
      const parent = document.querySelector("nested-property-parent");
      const children = parent?.shadowRoot?.querySelectorAll("nested-property-child") ?? [];
      const child = children[0];
      const grandchildren = child?.shadowRoot?.querySelectorAll("nested-property-grandchild") ?? [];
      const grandchild = grandchildren[0];
      return {
        childCount: children.length,
        grandchildCount: grandchildren.length,
        childMatchesParentScope:
          child?.constructor === parent?.constructor?.elements?.["nested-property-child"],
        grandchildMatchesChildScope:
          grandchild?.constructor === child?.constructor?.elements?.["nested-property-grandchild"],
      };
    })).toEqual({
      childCount: 1,
      grandchildCount: 1,
      childMatchesParentScope: true,
      grandchildMatchesChildScope: true,
    });
    const button = await page.locator("nested-property-parent").evaluateHandle((parent) =>
      parent.shadowRoot.querySelector("nested-property-child")
        .shadowRoot.querySelector("nested-property-grandchild")
        .shadowRoot.querySelector("#navigate")
    );
    await button.asElement()?.click();
    expect(await page.evaluate(() => window.__nestedNavigation)).toBe("first");
    expect(pageErrors).toEqual([]);
  } finally {
    await server.close();
    await fs.rm(tempDir, { recursive: true, force: true });
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
