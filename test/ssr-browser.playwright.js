import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { expect, test } from "@playwright/test";
import { createServer } from "vite";
import { html } from "lit";
import { __litsxScopedTemplate } from "../packages/core/src/elements/index.js";
import { createLitsxCompilationSession } from "../packages/compiler/src/index.js";
import { litsx } from "../packages/vite-plugin/src/index.js";

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

test("hydrates a real browser page rendered by @litsx/ssr", async ({ page }) => {
  const tempRoot = path.join(repoRoot, "test-results");
  await fs.mkdir(tempRoot, { recursive: true });
  const tempDir = await fs.mkdtemp(path.join(tempRoot, "litsx-ssr-browser-"));
  const srcDir = path.join(tempDir, "src");
  await fs.mkdir(srcDir, { recursive: true });

  const serverComponentsPath = path.join(srcDir, "components.server.mjs");
  const clientComponentsPath = path.join(srcDir, "components.client.litsx");
  const clientEntryPath = path.join(srcDir, "main.js");
  const componentsSource = createComponentsSource();
  await fs.writeFile(clientComponentsPath, componentsSource);
  const session = createLitsxCompilationSession({
    transformOptions: {
      ssr: true,
      filename: clientComponentsPath,
    },
  });
  const serverResult = session.transformSync(componentsSource, {
    filename: clientComponentsPath,
    sourceMaps: false,
  });
  await fs.writeFile(serverComponentsPath, serverResult.code);
  await fs.writeFile(
    clientEntryPath,
    `
import { hydrateDocument, LITSX_HYDRATION_PAYLOAD_PROPERTY } from "${viteFsSpecifier(path.join(repoRoot, "packages/ssr-client/src/index.js"))}";

try {
  await hydrateDocument({
    async register() {
      const { defineSsrComponents } = await import("./components.client.litsx");
      defineSsrComponents();
    },
    moduleLoader: async () => {},
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

  await import("@lit-labs/ssr/lib/install-global-dom-shim.js");
  const { renderToString } = await import("../packages/ssr/src/index.js");
  const { SsrAppRoot } = await import(`${pathToFileURL(serverComponentsPath).href}?t=${Date.now()}`);
  const result = await renderToString(
    __litsxScopedTemplate(
      html`<ssr-app-root .name=${"Real Browser"}></ssr-app-root>`,
      {
        "ssr-app-root": SsrAppRoot,
      },
    ),
    {
      assetResolver(moduleId) {
        return moduleId ? "/src/components.client.litsx" : null;
      },
    },
  );
  expect(result.clientImports).toEqual(["/src/components.client.litsx"]);
  expect(result.hydrationData.roots).toEqual([
    {
      id: "litsx-root-0",
      tagName: "ssr-app-root",
      moduleId: clientComponentsPath,
    },
  ]);
  const documentHtml = `<!doctype html>
<html>
  <head>
    ${result.renderModulePreloads()}
    ${result.renderHydrationData()}
  </head>
  <body>
    ${result.html}
    <script type="module" src="/src/main.js"></script>
  </body>
</html>`;
  await fs.writeFile(path.join(tempDir, "index.html"), documentHtml);

  const server = await createServer({
    root: tempDir,
    logLevel: "silent",
    server: {
      host: "127.0.0.1",
      strictPort: false,
    },
    plugins: [
      litsx({
        ssr: true,
      }),
    ],
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
