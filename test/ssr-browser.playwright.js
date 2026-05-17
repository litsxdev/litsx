import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { expect, test } from "@playwright/test";
import { createServer } from "vite";
import { html } from "lit";
import { __litsxScopedTemplate } from "../packages/core/src/elements/index.js";

const repoRoot = path.resolve(import.meta.dirname, "..");

function fileSpecifier(filePath) {
  return pathToFileURL(filePath).href;
}

function viteFsSpecifier(filePath) {
  return `/@fs/${filePath}`;
}

function createComponentsSource({ browser }) {
  const litImport = browser
    ? viteFsSpecifier(path.join(repoRoot, "node_modules/lit/index.js"))
    : fileSpecifier(path.join(repoRoot, "node_modules/lit/index.js"));
  const elementsImport = browser
    ? viteFsSpecifier(path.join(repoRoot, "packages/core/src/elements/index.js"))
    : fileSpecifier(path.join(repoRoot, "packages/core/src/elements/index.js"));
  const renderLightImport = browser
    ? viteFsSpecifier(
        path.join(repoRoot, "node_modules/@lit-labs/ssr-client/directives/render-light.js"),
      )
    : fileSpecifier(
        path.join(repoRoot, "node_modules/@lit-labs/ssr-client/directives/render-light.js"),
      );
  const effectsImport = browser
    ? viteFsSpecifier(path.join(repoRoot, "packages/core/src/effect-hooks.js"))
    : fileSpecifier(path.join(repoRoot, "packages/core/src/effect-hooks.js"));
  const stateImport = browser
    ? viteFsSpecifier(path.join(repoRoot, "packages/core/src/state-hooks.js"))
    : fileSpecifier(path.join(repoRoot, "packages/core/src/state-hooks.js"));

  return `
import { LitElement, css, html } from "${litImport}";
import { renderLight } from "${renderLightImport}";
import { LightDomMixin, ShadowDomMixin, LITSX_MODULE_ID } from "${elementsImport}";
import { prepareEffects } from "${effectsImport}";
import { useState } from "${stateImport}";

export class SsrLeafShadow extends ShadowDomMixin(LitElement) {
  static [LITSX_MODULE_ID] = "/src/ssr-leaf-shadow.js";
  static styles = css\`:host { display: inline-block; color: rgb(0, 96, 128); }\`;

  render() {
    prepareEffects(this);
    const [count, setCount] = useState(this, 3);
    this.__increment = () => setCount(count + 1);
    return html\`<button id="leaf-button" @click=\${this.__increment}>leaf:\${this.label}:\${count}</button>\`;
  }
}

export class SsrLevelFourLight extends LightDomMixin(LitElement) {
  static [LITSX_MODULE_ID] = "/src/ssr-level-four-light.js";
  static elements = { "ssr-leaf-shadow": SsrLeafShadow };

  render() {
    return html\`<ssr-leaf-shadow .label=\${this.label}></ssr-leaf-shadow>\`;
  }
}

export class SsrLevelThreeShadow extends ShadowDomMixin(LitElement) {
  static [LITSX_MODULE_ID] = "/src/ssr-level-three-shadow.js";
  static elements = { "ssr-level-four-light": SsrLevelFourLight };

  render() {
    return html\`<section id="level-three"><ssr-level-four-light .label=\${this.label}>\${renderLight()}</ssr-level-four-light></section>\`;
  }
}

export class SsrLevelTwoLight extends LightDomMixin(LitElement) {
  static [LITSX_MODULE_ID] = "/src/ssr-level-two-light.js";
  static elements = { "ssr-level-three-shadow": SsrLevelThreeShadow };

  render() {
    return html\`<ssr-level-three-shadow .label=\${this.label}></ssr-level-three-shadow>\`;
  }
}

export class SsrAppRoot extends ShadowDomMixin(LitElement) {
  static [LITSX_MODULE_ID] = "/src/ssr-app-root.js";
  static elements = { "ssr-level-two-light": SsrLevelTwoLight };
  static styles = css\`:host { display: block; }\`;

  render() {
    prepareEffects(this);
    const [name] = useState(this, this.name ?? "demo");
    return html\`<main id="app-root"><h1>\${name}</h1><ssr-level-two-light .label=\${name}>\${renderLight()}</ssr-level-two-light></main>\`;
  }
}

export function defineSsrComponents() {
  const definitions = {
    "ssr-app-root": SsrAppRoot,
    "ssr-level-two-light": SsrLevelTwoLight,
    "ssr-level-three-shadow": SsrLevelThreeShadow,
    "ssr-level-four-light": SsrLevelFourLight,
    "ssr-leaf-shadow": SsrLeafShadow,
  };
  for (const [tagName, ctor] of Object.entries(definitions)) {
    if (!customElements.get(tagName)) {
      customElements.define(tagName, ctor);
    }
  }
}
`;
}

test("hydrates a real browser page rendered by @litsx/ssr", async ({ page }) => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "litsx-ssr-browser-"));
  const srcDir = path.join(tempDir, "src");
  await fs.mkdir(srcDir, { recursive: true });

  const serverComponentsPath = path.join(srcDir, "components.server.mjs");
  const clientComponentsPath = path.join(srcDir, "components.client.js");
  const clientEntryPath = path.join(srcDir, "main.js");
  await fs.writeFile(serverComponentsPath, createComponentsSource({ browser: false }));
  await fs.writeFile(clientComponentsPath, createComponentsSource({ browser: true }));
  await fs.writeFile(
    clientEntryPath,
    `
import { hydrateDocument, LITSX_HYDRATION_PAYLOAD_PROPERTY } from "${viteFsSpecifier(path.join(repoRoot, "packages/ssr-client/src/index.js"))}";

try {
  await hydrateDocument({
    async register() {
      const { defineSsrComponents } = await import("./components.client.js");
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
        return moduleId ? "/src/components.client.js" : null;
      },
    },
  );
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
