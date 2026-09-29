import fs from "node:fs/promises";
import path from "node:path";
import { expect, test } from "@playwright/test";
import { createServer } from "vite";
import { createSsrDevServer } from "../packages/vite-plugin/src/ssr.js";
import { LITSX_HYDRATION_PAYLOAD_PROPERTY } from "../packages/ssr/src/hydration.js";
import { __litsxNoscript } from "../packages/core/src/index.js";
import {
  createUnoCssVitePlugins,
  litsxUnoCss,
  withUnoCssViteCompiler,
} from "../packages/unocss/src/vite.js";
import { litsxTailwind } from "../packages/tailwind/src/vite.js";
import { html } from "lit";
import { presetWind4 } from "unocss";

const repoRoot = path.resolve(import.meta.dirname, "..");

function viteFsSpecifier(filePath) {
  return `/@fs/${filePath}`;
}

function isolatedViteOptions(tempDir) {
  return {
    cacheDir: path.join(tempDir, ".vite-cache"),
    optimizeDeps: { noDiscovery: true },
  };
}

test("hydrates imported camelCase props, declared attribute aliases, and spreads without changing branches", async ({
  page,
}) => {
  const tempRoot = path.join(repoRoot, "test-results");
  await fs.mkdir(tempRoot, { recursive: true });
  const tempDir = await fs.mkdtemp(
    path.join(tempRoot, "litsx-imported-props-"),
  );
  const srcDir = path.join(tempDir, "src");
  await fs.mkdir(srcDir, { recursive: true });

  await fs.writeFile(
    path.join(srcDir, "contract-button.tsx"),
    `
export type ContractButtonProps = {
  label?: string;
  iconOnly?: boolean;
  ariaLabel?: string | null;
};

export function ContractButton({
  label = "",
  iconOnly = false,
  ariaLabel = "",
}: ContractButtonProps) {
  return <>{iconOnly
    ? <span data-branch="icon">Icon:{ariaLabel || label}</span>
    : <span data-branch="label">Label:{ariaLabel || label}</span>}</>;
}

ContractButton.properties = {
  iconOnly: { type: Boolean, reflect: true, attribute: "icon-only" },
  ariaLabel: { type: String, reflect: true, attribute: "aria-label" },
};
`,
  );
  await fs.writeFile(
    path.join(srcDir, "contract-root.tsx"),
    `
import { ContractButton } from "./contract-button";

const runtimeProps = { iconOnly: true, ariaLabel: "Runtime spread" };

export function ContractRoot() {
  const dynamicValue = true;
  const dynamicLabel = "Attribute label";
  return (
    <main>
      <ContractButton data-case="camel-true" label="Open" iconOnly={true} />
      <ContractButton data-case="camel-false" label="Closed" iconOnly={false} />
      <ContractButton data-case="attribute-static" label="Static" icon-only="" />
      <ContractButton data-case="attribute-dynamic" label="Dynamic" icon-only={dynamicValue} />
      <ContractButton data-case="aria-camel" ariaLabel="Camel label" />
      <ContractButton data-case="aria-attribute" aria-label={dynamicLabel} />
      <ContractButton data-case="spread-literal" {...{ iconOnly: true, ariaLabel: "Literal spread" }} />
      <ContractButton data-case="spread-runtime" {...runtimeProps} />
      <ContractButton data-case="spread-false" {...{ iconOnly: false, ariaLabel: null }} />
      <ContractButton data-case="spread-undefined" {...{ iconOnly: undefined, ariaLabel: undefined }} />
    </main>
  );
}
`,
  );
  await fs.writeFile(
    path.join(srcDir, "main.js"),
    `
const components = await import("./contract-root.tsx");
const button = await import("./contract-button.tsx");
const { registerHydrationModules } = await import("@litsx/ssr/hydration");
await registerHydrationModules([components, button]);
`,
  );

  const server = await createSsrDevServer({
    root: tempDir,
    vite: isolatedViteOptions(tempDir),
    clientEntry: "./src/main.js",
    bootstrap: {
      content: `
const captureBranches = () => {
  const root = document.querySelector("contract-root");
  const hosts = [...(root?.shadowRoot?.querySelectorAll("contract-button") ?? [])];
  window.__litsxImportedPropHosts = hosts;
  window.__litsxImportedPropBranches = hosts.map((host) =>
    host.shadowRoot?.querySelector("[data-branch]") ?? null
  );
  window.__litsxImportedPropSsr = hosts.map((host) => ({
    caseName: host.getAttribute("data-case"),
    iconAttribute: host.hasAttribute("icon-only"),
    branch: host.shadowRoot?.querySelector("[data-branch]")?.getAttribute("data-branch") ?? null,
  }));
};
captureBranches();
const { hydratePage } = await import("@litsx/ssr/hydration");
await hydratePage({ register: () => import("/src/main.js") });
window.__litsxImportedPropsHydrated = true;
`,
    },
    logLevel: "silent",
    host: "127.0.0.1",
    strictPort: false,
    elements(loader) {
      return {
        "contract-root": async () =>
          (await loader("./src/contract-root.tsx")).ContractRoot,
      };
    },
    render({ html: serverHtml }) {
      return serverHtml`<contract-root></contract-root>`;
    },
  });
  await server.listen();

  try {
    const consoleErrors = [];
    const consoleWarnings = [];
    const pageErrors = [];
    page.on("console", (message) => {
      if (message.type() === "error") consoleErrors.push(message.text());
      if (message.type() === "warning") consoleWarnings.push(message.text());
    });
    page.on("pageerror", (error) =>
      pageErrors.push(error.stack || error.message),
    );
    await page.goto(server.resolvedUrls.local[0]);
    await page.waitForFunction(
      () => window.__litsxImportedPropsHydrated === true,
    );
    await page.evaluate(async () => {
      const root = document.querySelector("contract-root");
      await root.updateComplete;
      const hosts = [
        ...(root.shadowRoot?.querySelectorAll("contract-button") ?? []),
      ];
      await Promise.all(hosts.map((host) => host.updateComplete));
      await new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(resolve)),
      );
    });
    await page.waitForFunction(() => {
      const root = document.querySelector("contract-root");
      const hosts = [
        ...(root?.shadowRoot?.querySelectorAll("contract-button") ?? []),
      ];
      return (
        hosts.length === 10 &&
        hosts.every(
          (host) =>
            host.updateComplete?.then && typeof host.iconOnly === "boolean",
        )
      );
    });

    const result = await page.evaluate(() => {
      const root = document.querySelector("contract-root");
      const hosts = [...root.shadowRoot.querySelectorAll("contract-button")];
      return {
        ssr: window.__litsxImportedPropSsr,
        hydrated: hosts.map((host, index) => {
          const branch = host.shadowRoot.querySelector("[data-branch]");
          return {
            caseName: host.getAttribute("data-case"),
            iconOnly: host.iconOnly,
            ariaLabel: host.ariaLabel ?? null,
            iconAttribute: host.hasAttribute("icon-only"),
            ariaAttribute: host.getAttribute("aria-label"),
            branch: branch?.getAttribute("data-branch"),
            sameHost: host === window.__litsxImportedPropHosts[index],
            sameBranch: branch === window.__litsxImportedPropBranches[index],
          };
        }),
      };
    });

    expect(result.ssr).toEqual([
      { caseName: "camel-true", iconAttribute: true, branch: "icon" },
      { caseName: "camel-false", iconAttribute: false, branch: "label" },
      { caseName: "attribute-static", iconAttribute: true, branch: "icon" },
      { caseName: "attribute-dynamic", iconAttribute: true, branch: "icon" },
      { caseName: "aria-camel", iconAttribute: false, branch: "label" },
      { caseName: "aria-attribute", iconAttribute: false, branch: "label" },
      { caseName: "spread-literal", iconAttribute: true, branch: "icon" },
      { caseName: "spread-runtime", iconAttribute: true, branch: "icon" },
      { caseName: "spread-false", iconAttribute: false, branch: "label" },
      { caseName: "spread-undefined", iconAttribute: false, branch: "label" },
    ]);
    expect(result.hydrated).toEqual([
      {
        caseName: "camel-true",
        iconOnly: true,
        ariaLabel: "",
        iconAttribute: true,
        ariaAttribute: "",
        branch: "icon",
        sameHost: true,
        sameBranch: true,
      },
      {
        caseName: "camel-false",
        iconOnly: false,
        ariaLabel: "",
        iconAttribute: false,
        ariaAttribute: "",
        branch: "label",
        sameHost: true,
        sameBranch: true,
      },
      {
        caseName: "attribute-static",
        iconOnly: true,
        ariaLabel: "",
        iconAttribute: true,
        ariaAttribute: "",
        branch: "icon",
        sameHost: true,
        sameBranch: true,
      },
      {
        caseName: "attribute-dynamic",
        iconOnly: true,
        ariaLabel: "",
        iconAttribute: true,
        ariaAttribute: "",
        branch: "icon",
        sameHost: true,
        sameBranch: true,
      },
      {
        caseName: "aria-camel",
        iconOnly: false,
        ariaLabel: "Camel label",
        iconAttribute: false,
        ariaAttribute: "Camel label",
        branch: "label",
        sameHost: true,
        sameBranch: true,
      },
      {
        caseName: "aria-attribute",
        iconOnly: false,
        ariaLabel: "Attribute label",
        iconAttribute: false,
        ariaAttribute: "Attribute label",
        branch: "label",
        sameHost: true,
        sameBranch: true,
      },
      {
        caseName: "spread-literal",
        iconOnly: true,
        ariaLabel: "Literal spread",
        iconAttribute: true,
        ariaAttribute: "Literal spread",
        branch: "icon",
        sameHost: true,
        sameBranch: true,
      },
      {
        caseName: "spread-runtime",
        iconOnly: true,
        ariaLabel: "Runtime spread",
        iconAttribute: true,
        ariaAttribute: "Runtime spread",
        branch: "icon",
        sameHost: true,
        sameBranch: true,
      },
      {
        caseName: "spread-false",
        iconOnly: false,
        ariaLabel: null,
        iconAttribute: false,
        ariaAttribute: null,
        branch: "label",
        sameHost: true,
        sameBranch: true,
      },
      {
        caseName: "spread-undefined",
        iconOnly: false,
        ariaLabel: "",
        iconAttribute: false,
        ariaAttribute: "",
        branch: "label",
        sameHost: true,
        sameBranch: true,
      },
    ]);
    expect(consoleErrors).toEqual([]);
    expect(
      consoleWarnings.filter(
        (message) => !message.startsWith("Lit is in dev mode."),
      ),
    ).toEqual([]);
    expect(pageErrors).toEqual([]);
  } finally {
    await server.close();
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

test("preserves imported component host attributes through SSR, hydration, and updates", async ({
  page,
}) => {
  const tempRoot = path.join(repoRoot, "test-results");
  await fs.mkdir(tempRoot, { recursive: true });
  const tempDir = await fs.mkdtemp(
    path.join(tempRoot, "litsx-host-attributes-"),
  );
  const srcDir = path.join(tempDir, "src");
  await fs.mkdir(srcDir, { recursive: true });

  await fs.writeFile(
    path.join(srcDir, "quartz-icon.tsx"),
    `
import { css, defineHook } from "@litsx/core";
import { LightDomMixin } from "@litsx/core/elements";

const useLightDom = defineHook({ mixin: LightDomMixin });

export type QuartzIconProps = {
  name?: string;
  payload?: { id: number };
};

export function QuartzIcon({ name = "", payload }: QuartzIconProps) {
  return <span data-name={name} data-payload={payload?.id ?? ""}>{name}</span>;
}

QuartzIcon.styles = css\`
  :host { display: block; }
  :host(.rotate-180) { rotate: 180deg; }
  :host(.rotate-0) { rotate: 0deg; }
\`;

export function QuartzLightIcon({ name = "", payload }: QuartzIconProps) {
  useLightDom();
  return <span data-name={name} data-payload={payload?.id ?? ""}>{name}</span>;
}

QuartzLightIcon.styles = css\`
  quartz-light-icon { display: block; }
  quartz-light-icon.rotate-180 { rotate: 180deg; }
  quartz-light-icon.rotate-0 { rotate: 0deg; }
\`;
`,
  );
  await fs.writeFile(
    path.join(srcDir, "host-attribute-root.tsx"),
    `
import { QuartzIcon, QuartzLightIcon } from "./quartz-icon";

const spreadAttributes = {
  class: "spread-middle",
  title: "Spread title",
  "aria-label": "Spread icon",
  "data-state": "open",
  payload: { id: 2 },
};

const handleClick = (event) => {
  event.currentTarget.setAttribute("data-clicked", "true");
};

export function HostAttributeRoot({ open = true }) {
  return (
    <main>
      <QuartzIcon
        name="direct"
        class={open ? "rotate-180" : "rotate-0"}
        id="direct-icon"
        style="color: red"
        slot="indicator"
        part="icon"
        exportparts="glyph"
        title="Direct title"
        tabindex="-1"
        role="img"
        aria-hidden="true"
        data-state={open ? "open" : "closed"}
        payload={{ id: 1 }}
        on:click={handleClick}
      />
      <QuartzLightIcon
        name="light"
        class={open ? "rotate-180" : "rotate-0"}
        aria-label="Light icon"
        data-state={open ? "open" : "closed"}
        payload={{ id: 3 }}
        on:click={handleClick}
      />
      <QuartzIcon
        name="spread"
        class="spread-first"
        {...spreadAttributes}
        class={open ? "rotate-180" : undefined}
        on:click={handleClick}
      />
    </main>
  );
}
`,
  );
  await fs.writeFile(
    path.join(srcDir, "main.js"),
    `
const root = await import("./host-attribute-root.tsx");
const icon = await import("./quartz-icon.tsx");
const { registerHydrationModules } = await import("@litsx/ssr/hydration");
await registerHydrationModules([root, icon]);
`,
  );

  const server = await createSsrDevServer({
    root: tempDir,
    vite: isolatedViteOptions(tempDir),
    clientEntry: "./src/main.js",
    bootstrap: {
      content: `
const root = document.querySelector("host-attribute-root");
window.__litsxHostAttributeNodes = [...root.shadowRoot.querySelectorAll("quartz-icon, quartz-light-icon")];
window.__litsxHostAttributeSsr = window.__litsxHostAttributeNodes.map((host) => ({
  name: (host.shadowRoot ?? host).querySelector("span")?.getAttribute("data-name") ?? null,
  className: host.getAttribute("class"),
  id: host.getAttribute("id"),
  ariaHidden: host.getAttribute("aria-hidden"),
  ariaLabel: host.getAttribute("aria-label"),
  state: host.getAttribute("data-state"),
  title: host.getAttribute("title"),
}));
const { hydratePage } = await import("@litsx/ssr/hydration");
await hydratePage({ register: () => import("/src/main.js") });
window.__litsxHostAttributesHydrated = true;
`,
    },
    logLevel: "silent",
    host: "127.0.0.1",
    strictPort: false,
    elements(loader) {
      return {
        "host-attribute-root": async () =>
          (await loader("./src/host-attribute-root.tsx")).HostAttributeRoot,
      };
    },
    render({ html: serverHtml }) {
      return serverHtml`<host-attribute-root></host-attribute-root>`;
    },
  });
  await server.listen();

  try {
    const consoleErrors = [];
    const consoleWarnings = [];
    const pageErrors = [];
    page.on("console", (message) => {
      if (message.type() === "error") consoleErrors.push(message.text());
      if (message.type() === "warning") consoleWarnings.push(message.text());
    });
    page.on("pageerror", (error) =>
      pageErrors.push(error.stack || error.message),
    );

    await page.goto(server.resolvedUrls.local[0]);
    await page.waitForFunction(
      () => window.__litsxHostAttributesHydrated === true,
    );
    await page.waitForFunction(() => {
      const root = document.querySelector("host-attribute-root");
      const renderRoot = root?.renderRoot ?? root?.shadowRoot ?? root;
      return (
        renderRoot?.querySelectorAll("quartz-icon, quartz-light-icon")
          .length === 3
      );
    });

    const initial = await page.evaluate(async () => {
      const root = document.querySelector("host-attribute-root");
      await root.updateComplete;
      const renderRoot = root.renderRoot ?? root.shadowRoot ?? root;
      const hosts = [
        ...renderRoot.querySelectorAll("quartz-icon, quartz-light-icon"),
      ];
      await Promise.all(hosts.map((host) => host.updateComplete));
      const [direct, light, spread] = hosts;
      direct.dispatchEvent(new Event("click"));
      light.dispatchEvent(new Event("click"));
      spread.dispatchEvent(new Event("click"));
      return {
        ssr: window.__litsxHostAttributeSsr,
        rootIsLight: renderRoot === root,
        direct: {
          sameNode: direct === window.__litsxHostAttributeNodes[0],
          className: direct.getAttribute("class"),
          id: direct.id,
          style: direct.getAttribute("style"),
          slot: direct.getAttribute("slot"),
          part: direct.getAttribute("part"),
          exportparts: direct.getAttribute("exportparts"),
          title: direct.title,
          tabindex: direct.getAttribute("tabindex"),
          role: direct.getAttribute("role"),
          ariaHidden: direct.getAttribute("aria-hidden"),
          state: direct.dataset.state,
          payload: direct.payload,
          clicked: direct.dataset.clicked,
          rotate: getComputedStyle(direct).rotate,
        },
        light: {
          sameNode: light === window.__litsxHostAttributeNodes[1],
          className: light.getAttribute("class"),
          ariaLabel: light.getAttribute("aria-label"),
          state: light.dataset.state,
          payload: light.payload,
          clicked: light.dataset.clicked,
          rotate: getComputedStyle(light).rotate,
          rendersInLightDom:
            light.shadowRoot === null && light.querySelector("span") !== null,
        },
        spread: {
          sameNode: spread === window.__litsxHostAttributeNodes[2],
          className: spread.getAttribute("class"),
          ariaLabel: spread.getAttribute("aria-label"),
          state: spread.dataset.state,
          title: spread.title,
          payload: spread.payload,
          clicked: spread.dataset.clicked,
          rotate: getComputedStyle(spread).rotate,
        },
      };
    });

    expect(initial.ssr).toEqual([
      {
        name: "direct",
        className: "rotate-180",
        id: "direct-icon",
        ariaHidden: "true",
        ariaLabel: null,
        state: "open",
        title: "Direct title",
      },
      {
        name: null,
        className: "rotate-180",
        id: null,
        ariaHidden: null,
        ariaLabel: "Light icon",
        state: "open",
        title: null,
      },
      {
        name: "spread",
        className: "rotate-180",
        id: null,
        ariaHidden: null,
        ariaLabel: "Spread icon",
        state: "open",
        title: "Spread title",
      },
    ]);
    expect(initial.rootIsLight).toBe(false);
    expect(initial.direct).toEqual({
      sameNode: true,
      className: "rotate-180",
      id: "direct-icon",
      style: "color: red",
      slot: "indicator",
      part: "icon",
      exportparts: "glyph",
      title: "Direct title",
      tabindex: "-1",
      role: "img",
      ariaHidden: "true",
      state: "open",
      payload: { id: 1 },
      clicked: "true",
      rotate: "180deg",
    });
    expect(initial.spread).toEqual({
      sameNode: true,
      className: "rotate-180",
      ariaLabel: "Spread icon",
      state: "open",
      title: "Spread title",
      payload: { id: 2 },
      clicked: "true",
      rotate: "180deg",
    });
    expect(initial.light).toEqual({
      sameNode: true,
      className: "rotate-180",
      ariaLabel: "Light icon",
      state: "open",
      payload: { id: 3 },
      clicked: "true",
      rotate: "180deg",
      rendersInLightDom: true,
    });

    const updated = await page.evaluate(async () => {
      const root = document.querySelector("host-attribute-root");
      const renderRoot = root.renderRoot ?? root.shadowRoot ?? root;
      const nodes = [
        ...renderRoot.querySelectorAll("quartz-icon, quartz-light-icon"),
      ];
      root.open = false;
      await root.updateComplete;
      await Promise.all(nodes.map((host) => host.updateComplete));
      const current = [
        ...renderRoot.querySelectorAll("quartz-icon, quartz-light-icon"),
      ];
      return {
        sameNodes: current.every((host, index) => host === nodes[index]),
        directClass: current[0].getAttribute("class"),
        directState: current[0].dataset.state,
        directRotate: getComputedStyle(current[0]).rotate,
        lightClass: current[1].getAttribute("class"),
        lightState: current[1].dataset.state,
        lightRotate: getComputedStyle(current[1]).rotate,
        spreadClass: current[2].getAttribute("class"),
      };
    });

    expect(updated).toEqual({
      sameNodes: true,
      directClass: "rotate-0",
      directState: "closed",
      directRotate: "0deg",
      lightClass: "rotate-0",
      lightState: "closed",
      lightRotate: "0deg",
      spreadClass: null,
    });
    expect(consoleErrors).toEqual([]);
    expect(
      consoleWarnings.filter(
        (message) => !message.startsWith("Lit is in dev mode."),
      ),
    ).toEqual([]);
    expect(pageErrors).toEqual([]);
  } finally {
    await server.close();
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

test("registers React lazy elements only after their default export resolves", async ({
  page,
}) => {
  const tempRoot = path.join(repoRoot, "test-results");
  await fs.mkdir(tempRoot, { recursive: true });
  const tempDir = await fs.mkdtemp(path.join(tempRoot, "litsx-react-lazy-"));
  const srcDir = path.join(tempDir, "src");
  await fs.mkdir(srcDir, { recursive: true });

  await fs.writeFile(
    path.join(srcDir, "results-panel.tsx"),
    `
export default function ResultsPanel() {
  return <p data-ready="true">Lazy results ready</p>;
}
`,
  );
  await fs.writeFile(
    path.join(srcDir, "lazy-root.tsx"),
    `
import { lazy } from "react";

const ResultsPanel = lazy(() => import("./results-panel.tsx"));

export function LazyRoot() {
  return <main><ResultsPanel /></main>;
}
`,
  );
  await fs.writeFile(
    path.join(srcDir, "main.js"),
    `
const root = await import("./lazy-root.tsx");
const { registerHydrationModules } = await import("@litsx/ssr/hydration");
await registerHydrationModules([root]);
`,
  );

  const server = await createSsrDevServer({
    root: tempDir,
    vite: isolatedViteOptions(tempDir),
    litsx: { reactCompat: true },
    clientEntry: "./src/main.js",
    bootstrap: {
      content: `
const { hydratePage } = await import("@litsx/ssr/hydration");
await hydratePage({ register: () => import("/src/main.js") });
window.__litsxLazyHydrated = true;
`,
    },
    logLevel: "silent",
    host: "127.0.0.1",
    strictPort: false,
    elements(loader) {
      return {
        "lazy-root": async () => (await loader("./src/lazy-root.tsx")).LazyRoot,
      };
    },
    render({ html: serverHtml }) {
      return serverHtml`<lazy-root></lazy-root>`;
    },
  });
  await server.listen();

  try {
    const consoleErrors = [];
    const pageErrors = [];
    page.on("console", (message) => {
      if (message.type() === "error") consoleErrors.push(message.text());
    });
    page.on("pageerror", (error) =>
      pageErrors.push(error.stack || error.message),
    );

    await page.goto(server.resolvedUrls.local[0]);
    await page.waitForFunction(() => window.__litsxLazyHydrated === true);
    await page.waitForFunction(() => {
      const root = document.querySelector("lazy-root");
      const renderRoot = root?.renderRoot ?? root?.shadowRoot ?? root;
      const panel = renderRoot?.querySelector("results-panel");
      const panelRoot = panel?.renderRoot ?? panel?.shadowRoot ?? panel;
      return (
        panelRoot?.querySelector('[data-ready="true"]')?.textContent ===
        "Lazy results ready"
      );
    });

    const result = await page.evaluate(() => {
      const root = document.querySelector("lazy-root");
      const renderRoot = root.renderRoot ?? root.shadowRoot ?? root;
      const panel = renderRoot.querySelector("results-panel");
      return {
        loaderInStaticElements: Object.values(
          root.constructor.elements ?? {},
        ).some((value) => value?.name === "ResultsPanel"),
        panelConstructor: panel.constructor.name,
      };
    });

    expect(result.loaderInStaticElements).toBe(false);
    expect(result.panelConstructor).not.toBe("HTMLElement");
    expect(consoleErrors).toEqual([]);
    expect(pageErrors).toEqual([]);
  } finally {
    await server.close();
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

test("hydrates React Context through a scoped light-DOM provider and propagates updates", async ({
  page,
}) => {
  const tempRoot = path.join(repoRoot, "test-results");
  await fs.mkdir(tempRoot, { recursive: true });
  const tempDir = await fs.mkdtemp(path.join(tempRoot, "litsx-react-context-"));
  const srcDir = path.join(tempDir, "src");
  await fs.mkdir(srcDir, { recursive: true });

  await fs.writeFile(
    path.join(srcDir, "context-root.tsx"),
    `
import React, { createContext, useContext, useState } from "react";

const ThemeContext = createContext("default");

function ThemeValue() {
  const theme = useContext(ThemeContext);
  return <p data-theme>{theme}</p>;
}

export function ContextRoot() {
  const [theme, setTheme] = useState("violet");
  return (
    <ThemeContext.Provider value={theme}>
      <ThemeValue />
      <button onClick={() => setTheme(current => current === "violet" ? "coral" : "violet")}>
        toggle
      </button>
    </ThemeContext.Provider>
  );
}
`,
  );
  await fs.writeFile(
    path.join(srcDir, "main.js"),
    `
const root = await import("./context-root.tsx");
const { registerHydrationModules } = await import("@litsx/ssr/hydration");
await registerHydrationModules([root]);
`,
  );

  const server = await createSsrDevServer({
    root: tempDir,
    vite: isolatedViteOptions(tempDir),
    litsx: { reactCompat: true },
    clientEntry: "./src/main.js",
    bootstrap: {
      content: `
const root = document.querySelector("context-root");
window.__litsxContextSsrNodes = {
  root,
  provider: root?.querySelector("litsx-context-provider"),
  value: root?.querySelector("[data-theme]"),
};
const { hydratePage } = await import("@litsx/ssr/hydration");
await hydratePage({ register: () => import("/src/main.js") });
window.__litsxContextHydrated = true;
`,
    },
    logLevel: "silent",
    host: "127.0.0.1",
    strictPort: false,
    elements(loader) {
      return {
        "context-root": async () =>
          (await loader("./src/context-root.tsx")).ContextRoot,
      };
    },
    render({ html: serverHtml }) {
      return serverHtml`<context-root></context-root>`;
    },
  });
  await server.listen();

  try {
    const consoleErrors = [];
    const pageErrors = [];
    page.on("console", (message) => {
      if (message.type() === "error") consoleErrors.push(message.text());
    });
    page.on("pageerror", (error) =>
      pageErrors.push(error.stack || error.message),
    );

    await page.goto(server.resolvedUrls.local[0]);
    await page.waitForFunction(() => window.__litsxContextHydrated === true);
    await page.waitForFunction(
      () =>
        document.querySelector("context-root [data-theme]")?.textContent ===
        "violet",
    );
    await page.evaluate(() => {
      const root = document.querySelector("context-root");
      window.__litsxHydratedContextNodes = {
        provider: root?.querySelector("litsx-context-provider"),
        value: root?.querySelector("[data-theme]"),
      };
    });

    await page.locator("context-root button").click();
    await page.waitForFunction(
      () =>
        document.querySelector("context-root [data-theme]")?.textContent ===
        "coral",
    );
    await page.locator("context-root button").click();
    await page.waitForFunction(
      () =>
        document.querySelector("context-root [data-theme]")?.textContent ===
        "violet",
    );

    const result = await page.evaluate(() => {
      const root = document.querySelector("context-root");
      const provider = root.querySelector("litsx-context-provider");
      const value = root.querySelector("[data-theme]");
      return {
        text: value.textContent,
        providerInitialized: Boolean(provider._provider),
        contextIsExpando: Object.hasOwn(provider, "context"),
        valueIsExpando: Object.hasOwn(provider, "value"),
        sameRoot: root === window.__litsxContextSsrNodes.root,
        sameProviderAcrossUpdates:
          provider === window.__litsxHydratedContextNodes.provider,
        sameValueAcrossUpdates:
          value === window.__litsxHydratedContextNodes.value,
      };
    });

    expect(result).toEqual({
      text: "violet",
      providerInitialized: true,
      contextIsExpando: false,
      valueIsExpando: false,
      sameRoot: true,
      sameProviderAcrossUpdates: true,
      sameValueAcrossUpdates: true,
    });
    expect(consoleErrors).toEqual([]);
    expect(pageErrors).toEqual([]);
  } finally {
    await server.close();
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

test("hydrates native object style bindings without replacing nodes and updates removals", async ({
  page,
}) => {
  const tempRoot = path.join(repoRoot, "test-results");
  await fs.mkdir(tempRoot, { recursive: true });
  const tempDir = await fs.mkdtemp(path.join(tempRoot, "litsx-object-style-"));
  const srcDir = path.join(tempDir, "src");
  await fs.mkdir(srcDir, { recursive: true });

  await fs.writeFile(
    path.join(srcDir, "style-root.tsx"),
    `
import { useState } from "@litsx/core";

export function StyleRoot() {
  const [active, setActive] = useState(true);
  const computedStyle = active
    ? { backgroundColor: "tomato", width: "20px", opacity: 0.5, "--accent": "gold" }
    : { color: "blue", opacity: 1, "--accent": undefined };
  const spreadProps = {
    style: active
      ? { "border-top": "3px solid black", "--spread-accent": "purple" }
      : "color: green; display: block",
  };

  return (
    <main>
      <div id="object" style={computedStyle}>object</div>
      <div id="text" style={active ? "color: purple" : null}>text</div>
      <div id="spread" {...spreadProps}>spread</div>
      <button id="toggle" on:click={() => setActive(false)}>toggle</button>
    </main>
  );
}
`,
  );
  await fs.writeFile(
    path.join(srcDir, "main.js"),
    `
const root = await import("./style-root.tsx");
const { registerHydrationModules } = await import("@litsx/ssr/hydration");
await registerHydrationModules([root]);
`,
  );

  const server = await createSsrDevServer({
    root: tempDir,
    vite: isolatedViteOptions(tempDir),
    clientEntry: "./src/main.js",
    bootstrap: {
      content: `
const host = document.querySelector("style-root");
const root = host.shadowRoot;
window.__litsxStyleNodes = [root.querySelector("#object"), root.querySelector("#text"), root.querySelector("#spread")];
window.__litsxStyleSsr = window.__litsxStyleNodes.map((node) => node.getAttribute("style"));
const { hydratePage } = await import("@litsx/ssr/hydration");
await hydratePage({ register: () => import("/src/main.js") });
window.__litsxStyleHydrated = true;
`,
    },
    logLevel: "silent",
    host: "127.0.0.1",
    strictPort: false,
    elements(loader) {
      return {
        "style-root": async () =>
          (await loader("./src/style-root.tsx")).StyleRoot,
      };
    },
    render({ html: serverHtml }) {
      return serverHtml`<style-root></style-root>`;
    },
  });
  await server.listen();

  try {
    const pageErrors = [];
    page.on("pageerror", (error) =>
      pageErrors.push(error.stack || error.message),
    );
    await page.goto(server.resolvedUrls.local[0]);
    await page.waitForFunction(() => window.__litsxStyleHydrated === true);

    const initial = await page.evaluate(async () => {
      const host = document.querySelector("style-root");
      await host.updateComplete;
      const nodes = [
        host.shadowRoot.querySelector("#object"),
        host.shadowRoot.querySelector("#text"),
        host.shadowRoot.querySelector("#spread"),
      ];
      return {
        ssr: window.__litsxStyleSsr,
        sameNodes: nodes.map(
          (node, index) => node === window.__litsxStyleNodes[index],
        ),
        styles: nodes.map((node) => ({
          backgroundColor: node.style.backgroundColor,
          borderTop: node.style.borderTop,
          accent: node.style.getPropertyValue("--accent"),
          spreadAccent: node.style.getPropertyValue("--spread-accent"),
          color: node.style.color,
          width: node.style.width,
          opacity: node.style.opacity,
        })),
      };
    });

    expect(initial.ssr[0]).toContain("background-color:tomato");
    expect(initial.ssr[2]).toContain("border-top:3px solid black");
    expect(initial.sameNodes).toEqual([true, true, true]);
    expect(initial.styles[0]).toMatchObject({
      backgroundColor: "tomato",
      accent: "gold",
      width: "20px",
      opacity: "0.5",
    });
    expect(initial.styles[1].color).toBe("purple");
    expect(initial.styles[2]).toMatchObject({
      borderTop: "3px solid black",
      spreadAccent: "purple",
    });

    const updated = await page.evaluate(async () => {
      const host = document.querySelector("style-root");
      host.shadowRoot.querySelector("#toggle").click();
      await host.updateComplete;
      const nodes = [
        host.shadowRoot.querySelector("#object"),
        host.shadowRoot.querySelector("#text"),
        host.shadowRoot.querySelector("#spread"),
      ];
      return {
        sameNodes: nodes.map(
          (node, index) => node === window.__litsxStyleNodes[index],
        ),
        styles: nodes.map((node) => ({
          backgroundColor: node.style.backgroundColor,
          borderTop: node.style.borderTop,
          accent: node.style.getPropertyValue("--accent"),
          spreadAccent: node.style.getPropertyValue("--spread-accent"),
          color: node.style.color,
          display: node.style.display,
          width: node.style.width,
          opacity: node.style.opacity,
        })),
      };
    });

    expect(updated.sameNodes).toEqual([true, true, true]);
    expect(updated.styles[0]).toEqual({
      backgroundColor: "",
      borderTop: "",
      accent: "",
      spreadAccent: "",
      color: "blue",
      display: "",
      width: "",
      opacity: "1",
    });
    expect(updated.styles[1].color).toBe("");
    expect(updated.styles[2]).toMatchObject({
      borderTop: "",
      spreadAccent: "",
      color: "green",
      display: "block",
    });
    expect(pageErrors).toEqual([]);
  } finally {
    await server.close();
  }
});

test("applies shared Wind4 styles after SSR hydration in shadow and light DOM", async ({
  page,
}) => {
  const tempRoot = path.join(repoRoot, "test-results");
  await fs.mkdir(tempRoot, { recursive: true });
  const tempDir = await fs.mkdtemp(path.join(tempRoot, "litsx-unocss-wind4-"));
  const srcDir = path.join(tempDir, "src");
  await fs.mkdir(srcDir, { recursive: true });
  await fs.writeFile(
    path.join(srcDir, "wind-classes.ts"),
    `
export const shadowCardClasses = "p-4 rounded-lg bg-red-500";
export const lightCardClasses = "p-8 rounded-lg bg-blue-500";

export const buttonSizes = {
  sm: "h-8 px-3",
  md: "h-10 px-4",
  lg: "h-12 px-6",
};

export const buttonAppearances = {
  default: "bg-slate-200",
  primary: "bg-blue-600",
  danger: "bg-red-600",
};

export const buttonStates = {
  compact: "rounded-sm",
  regular: "rounded-xl",
  variants: "data-[size=lg]:border-4 data-[appearance=danger]:opacity-50",
};
`,
  );
  await fs.writeFile(
    path.join(srcDir, "wind-cards.tsx"),
    `
import {
  buttonAppearances,
  buttonSizes,
  buttonStates,
  lightCardClasses,
  shadowCardClasses,
} from "./wind-classes";

export function ShadowWindCard() {
  return <article id="shadow-panel" class={shadowCardClasses}>Shadow</article>;
}
ShadowWindCard.styles = [shadowCardClasses];

export function LightWindCard() {
  return <article id="light-panel" class={lightCardClasses}>Light</article>;
}
LightWindCard.lightDom = true;
LightWindCard.styles = [lightCardClasses];

export function DynamicWindButton({ size = "md", appearance = "default" }) {
  return (
    <button
      class={\`\${buttonSizes[size]} \${buttonAppearances[appearance]} \${
        size === "sm" ? buttonStates.compact : buttonStates.regular
      } \${buttonStates.variants}\`}
      data-size={size}
      data-appearance={appearance}
    >
      {size}-{appearance}
    </button>
  );
}
DynamicWindButton.styles = [buttonSizes, buttonAppearances, buttonStates];

export function ThemeLeaf() {
  return <div id="theme-leaf" class="bg-blue-600">Inherited theme</div>;
}

export function ThemeMiddle() {
  return <theme-leaf />;
}

export function ThemeOuter() {
  return (
    <section style="--colors-blue-600: rgb(1 2 3)">
      <theme-middle />
    </section>
  );
}

export function defineWindCards() {
  if (!customElements.get("shadow-wind-card")) {
    customElements.define("shadow-wind-card", ShadowWindCard);
  }
  if (!customElements.get("light-wind-card")) {
    customElements.define("light-wind-card", LightWindCard);
  }
  if (!customElements.get("dynamic-wind-button")) {
    customElements.define("dynamic-wind-button", DynamicWindButton);
  }
  if (!customElements.get("theme-leaf")) {
    customElements.define("theme-leaf", ThemeLeaf);
  }
  if (!customElements.get("theme-middle")) {
    customElements.define("theme-middle", ThemeMiddle);
  }
  if (!customElements.get("theme-outer")) {
    customElements.define("theme-outer", ThemeOuter);
  }
}
`,
  );
  await fs.writeFile(
    path.join(srcDir, "main.js"),
    `
import "@webcomponents/scoped-custom-element-registry";
import "virtual:uno.css";
import { defineWindCards } from "./wind-cards.tsx";
import { mountGlobalLightDom } from "./global-light.tsx";
defineWindCards();
mountGlobalLightDom();
`,
  );
  await fs.writeFile(
    path.join(srcDir, "global-light.tsx"),
    `
export function mountGlobalLightDom() {
  const element = document.createElement("main");
  element.id = "global-light-panel";
  element.className = "p-6 rounded-lg bg-green-500 text-white";
  element.textContent = "Global light DOM";
  document.body.append(element);
}
`,
  );

  const unoOptions = { presets: [presetWind4()] };
  const server = await createSsrDevServer({
    root: tempDir,
    vite: isolatedViteOptions(tempDir),
    clientEntry: "./src/main.js",
    logLevel: "silent",
    host: "127.0.0.1",
    strictPort: false,
    litsx: withUnoCssViteCompiler(),
    plugins: createUnoCssVitePlugins(unoOptions),
    elements(loader) {
      return {
        "shadow-wind-card": async () =>
          (await loader("./src/wind-cards.tsx")).ShadowWindCard,
        "light-wind-card": async () =>
          (await loader("./src/wind-cards.tsx")).LightWindCard,
        "dynamic-wind-button": async () =>
          (await loader("./src/wind-cards.tsx")).DynamicWindButton,
        "theme-leaf": async () =>
          (await loader("./src/wind-cards.tsx")).ThemeLeaf,
        "theme-middle": async () =>
          (await loader("./src/wind-cards.tsx")).ThemeMiddle,
        "theme-outer": async () =>
          (await loader("./src/wind-cards.tsx")).ThemeOuter,
      };
    },
    render({ html: serverHtml }) {
      return serverHtml`
        <shadow-wind-card></shadow-wind-card>
        <light-wind-card></light-wind-card>
        <dynamic-wind-button size="sm" appearance="default"></dynamic-wind-button>
        <dynamic-wind-button size="md" appearance="primary"></dynamic-wind-button>
        <dynamic-wind-button size="lg" appearance="danger"></dynamic-wind-button>
        <theme-outer></theme-outer>
      `;
    },
  });
  await server.listen();

  try {
    const consoleErrors = [];
    const pageErrors = [];
    page.on("console", (message) => {
      if (message.type() === "error") consoleErrors.push(message.text());
    });
    page.on("pageerror", (error) => pageErrors.push(error.message));
    await page.goto(server.resolvedUrls.local[0]);
    await page.waitForFunction(
      () =>
        customElements.get("shadow-wind-card") !== undefined &&
        customElements.get("light-wind-card") !== undefined &&
        customElements.get("dynamic-wind-button") !== undefined &&
        customElements.get("theme-outer") !== undefined &&
        document.querySelector("#global-light-panel") !== null,
    );
    await page.waitForFunction(
      () =>
        getComputedStyle(document.querySelector("#global-light-panel"))
          .padding === "24px",
    );
    const result = await page.evaluate(() => {
      const shadowPanel = document
        .querySelector("shadow-wind-card")
        ?.shadowRoot?.querySelector("#shadow-panel");
      const lightPanel = document.querySelector("light-wind-card #light-panel");
      const globalLightPanel = document.querySelector("#global-light-panel");
      const shadowStyle = getComputedStyle(shadowPanel);
      const lightStyle = getComputedStyle(lightPanel);
      const globalLightStyle = getComputedStyle(globalLightPanel);
      const buttons = [...document.querySelectorAll("dynamic-wind-button")].map(
        (host) => {
          const button = host.shadowRoot?.querySelector("button");
          const style = getComputedStyle(button);
          return {
            size: host.getAttribute("size"),
            appearance: host.getAttribute("appearance"),
            height: style.height,
            paddingLeft: style.paddingLeft,
            background: style.backgroundColor,
            borderRadius: style.borderRadius,
            borderWidth: style.borderWidth,
            opacity: style.opacity,
          };
        },
      );
      const themeOuter = document.querySelector("theme-outer");
      const themeMiddle = themeOuter?.shadowRoot?.querySelector("theme-middle");
      const themeLeaf = themeMiddle?.shadowRoot?.querySelector("theme-leaf");
      const themeNode = themeLeaf?.shadowRoot?.querySelector("#theme-leaf");
      return {
        shadowPadding: shadowStyle.padding,
        shadowRadius: shadowStyle.borderRadius,
        shadowBackground: shadowStyle.backgroundColor,
        lightPadding: lightStyle.padding,
        lightRadius: lightStyle.borderRadius,
        lightBackground: lightStyle.backgroundColor,
        globalLightPadding: globalLightStyle.padding,
        globalLightRadius: globalLightStyle.borderRadius,
        globalLightBackground: globalLightStyle.backgroundColor,
        buttons,
        inheritedTheme: getComputedStyle(themeNode)
          .getPropertyValue("--colors-blue-600")
          .trim(),
        leafStyles: (themeLeaf?.constructor.styles ?? [])
          .flat(Infinity)
          .map((style) => style?.cssText ?? "")
          .join("\n"),
      };
    });

    expect(result.shadowPadding).toBe("16px");
    expect(result.shadowRadius).not.toBe("0px");
    expect(result.shadowBackground).not.toBe("rgba(0, 0, 0, 0)");
    expect(result.lightPadding).toBe("32px");
    expect(result.lightRadius).not.toBe("0px");
    expect(result.lightBackground).not.toBe("rgba(0, 0, 0, 0)");
    expect(result.globalLightPadding).toBe("24px");
    expect(result.globalLightRadius).not.toBe("0px");
    expect(result.globalLightBackground).not.toBe("rgba(0, 0, 0, 0)");
    expect(result.buttons).toEqual([
      {
        size: "sm",
        appearance: "default",
        height: "32px",
        paddingLeft: "12px",
        background: expect.stringMatching(/^oklab\(/),
        borderRadius: "4px",
        borderWidth: "0px",
        opacity: "1",
      },
      {
        size: "md",
        appearance: "primary",
        height: "40px",
        paddingLeft: "16px",
        background: expect.stringMatching(/^oklab\(/),
        borderRadius: "12px",
        borderWidth: "0px",
        opacity: "1",
      },
      {
        size: "lg",
        appearance: "danger",
        height: "48px",
        paddingLeft: "24px",
        background: expect.stringMatching(/^oklab\(/),
        borderRadius: "12px",
        borderWidth: "4px",
        opacity: "0.5",
      },
    ]);
    expect(result.inheritedTheme).toBe("rgb(1 2 3)");
    expect(result.leafStyles).not.toContain("--colors-blue-600:");
    expect(consoleErrors).toEqual([]);
    expect(pageErrors).toEqual([]);
  } finally {
    await server.close();
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

test("scopes light DOM utilities at nested component boundaries", async ({
  page,
}) => {
  const tempRoot = path.join(repoRoot, "test-results");
  await fs.mkdir(tempRoot, { recursive: true });
  const tempDir = await fs.mkdtemp(path.join(tempRoot, "litsx-unocss-scope-"));
  const srcDir = path.join(tempDir, "src");
  await fs.mkdir(srcDir, { recursive: true });
  await fs.writeFile(
    path.join(tempDir, "index.html"),
    '<main id="outside" class="p-8"></main><parent-card></parent-card><script type="module" src="/src/main.js"></script>',
  );
  await fs.writeFile(
    path.join(srcDir, "child.tsx"),
    `
export function ChildCard({ probeClass = "" }) {
  return <section><div id="probe" class={probeClass}></div><div id="owned" class="p-2"></div></section>;
}
ChildCard.lightDom = true;
`,
  );
  await fs.writeFile(
    path.join(srcDir, "parent.tsx"),
    `
import { ChildCard } from "./child";
export function ParentCard() {
  return <section><div id="parent-owned" class="p-8"></div><ChildCard probeClass="p-8" /></section>;
}
ParentCard.lightDom = true;
ParentCard.elements = { "child-card": ChildCard };
`,
  );
  await fs.writeFile(
    path.join(srcDir, "main.js"),
    `
import { ParentCard } from "./parent.tsx";
customElements.define("parent-card", ParentCard);
`,
  );
  const server = await createServer({
    configFile: false,
    root: tempDir,
    logLevel: "silent",
    ...isolatedViteOptions(tempDir),
    plugins: litsxUnoCss({ unocss: { presets: [presetWind4()] } }),
  });
  await server.listen();

  try {
    const pageErrors = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));
    await page.goto(server.resolvedUrls.local[0]);
    await page.waitForSelector("parent-card child-card #owned");
    const result = await page.evaluate(() => {
      const parent = document.querySelector("parent-card");
      const child = parent.querySelector("child-card");
      return {
        parentScope: parent.getAttribute("data-litsx-style-scope"),
        childScope: child.getAttribute("data-litsx-style-scope"),
        parentPadding: getComputedStyle(parent.querySelector("#parent-owned"))
          .padding,
        childOwnedPadding: getComputedStyle(child.querySelector("#owned"))
          .padding,
        childProbePadding: getComputedStyle(child.querySelector("#probe"))
          .padding,
        outsidePadding: getComputedStyle(document.querySelector("#outside"))
          .padding,
        scopeRules: [
          ...document.querySelectorAll("style[data-litsx-light-dom-style]"),
        ]
          .map((style) => style.textContent)
          .filter((css) => css.includes("@scope")),
      };
    });

    expect(result.parentScope).toMatch(/^[a-z0-9]+$/);
    expect(result.childScope).toMatch(/^[a-z0-9]+$/);
    expect(result.childScope).not.toBe(result.parentScope);
    expect(result.parentPadding).toBe("32px");
    expect(result.childOwnedPadding).toBe("8px");
    expect(result.childProbePadding).toBe("0px");
    expect(result.outsidePadding).toBe("0px");
    expect(result.scopeRules).toHaveLength(2);
    expect(pageErrors).toEqual([]);
  } finally {
    await server.close();
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

test("composes structural mixin metadata in shadow and light DOM and supports isolated styles", async ({
  page,
}) => {
  const tempRoot = path.join(repoRoot, "test-results");
  await fs.mkdir(tempRoot, { recursive: true });
  const tempDir = await fs.mkdtemp(
    path.join(tempRoot, "litsx-static-composition-"),
  );
  const srcDir = path.join(tempDir, "src");
  await fs.mkdir(srcDir, { recursive: true });
  await fs.writeFile(
    path.join(tempDir, "index.html"),
    `<shadow-composed capability="shadow"></shadow-composed>
     <shadow-isolated capability="isolated"></shadow-isolated>
     <light-composed capability="light"></light-composed>
     <script type="module" src="/src/main.js"></script>`,
  );
  await fs.writeFile(
    path.join(srcDir, "components.tsx"),
    `
import { css, defineHook, replaceStyles, useHost } from "@litsx/core";

class MixinChild extends HTMLElement {}
class OwnChild extends HTMLElement {}

const CapabilityMixin = (Base) => class extends Base {
  static properties = { capability: { type: String } };
  static styles = [super.styles ?? [], css\`.probe { color: rgb(255, 0, 0); }\`];
  static elements = {
    ...(super.elements ?? {}),
    "mixin-child": MixinChild,
  };
};

const useCapability = defineHook({
  mixin: CapabilityMixin,
  use() { return useHost().capability; },
});

export function ShadowComposed() {
  const capability = useCapability();
  return <div class="probe">{capability}</div>;
}
ShadowComposed.styles = css\`.probe { background-color: rgb(0, 0, 255); }\`;
ShadowComposed.elements = { "own-child": OwnChild };

export function ShadowIsolated() {
  const capability = useCapability();
  return <div class="probe">{capability}</div>;
}
ShadowIsolated.styles = replaceStyles(css\`.probe { color: rgb(0, 128, 0); }\`);

export function LightComposed() {
  const capability = useCapability();
  return <div class="probe">{capability}</div>;
}
LightComposed.lightDom = true;
LightComposed.styles = css\`.probe { background-color: rgb(128, 0, 128); }\`;
`,
  );
  await fs.writeFile(
    path.join(srcDir, "main.js"),
    `
import { LightComposed, ShadowComposed, ShadowIsolated } from "./components.tsx";
customElements.define("shadow-composed", ShadowComposed);
customElements.define("shadow-isolated", ShadowIsolated);
customElements.define("light-composed", LightComposed);
`,
  );

  const server = await createServer({
    configFile: false,
    root: tempDir,
    logLevel: "silent",
    ...isolatedViteOptions(tempDir),
    plugins: litsxUnoCss({ unocss: { presets: [presetWind4()] } }),
  });
  await server.listen();

  try {
    const pageErrors = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));
    await page.goto(server.resolvedUrls.local[0]);
    await page.waitForFunction(
      () =>
        document
          .querySelector("shadow-composed")
          ?.shadowRoot?.querySelector(".probe")?.textContent === "shadow" &&
        document
          .querySelector("shadow-isolated")
          ?.shadowRoot?.querySelector(".probe")?.textContent === "isolated" &&
        document.querySelector("light-composed .probe")?.textContent ===
          "light",
    );

    const result = await page.evaluate(() => {
      const shadow = document.querySelector("shadow-composed");
      const isolated = document.querySelector("shadow-isolated");
      const light = document.querySelector("light-composed");
      const shadowStyle = getComputedStyle(
        shadow.shadowRoot.querySelector(".probe"),
      );
      const isolatedStyle = getComputedStyle(
        isolated.shadowRoot.querySelector(".probe"),
      );
      const lightStyle = getComputedStyle(light.querySelector(".probe"));
      return {
        shadowColor: shadowStyle.color,
        shadowBackground: shadowStyle.backgroundColor,
        isolatedColor: isolatedStyle.color,
        lightColor: lightStyle.color,
        lightBackground: lightStyle.backgroundColor,
        properties: [...shadow.constructor.elementProperties.keys()],
        elements: Object.keys(shadow.constructor.elements).sort(),
      };
    });

    expect(result.shadowColor).toBe("rgb(255, 0, 0)");
    expect(result.shadowBackground).toBe("rgb(0, 0, 255)");
    expect(result.isolatedColor).toBe("rgb(0, 128, 0)");
    expect(result.lightColor).toBe("rgb(255, 0, 0)");
    expect(result.lightBackground).toBe("rgb(128, 0, 128)");
    expect(result.properties).toContain("capability");
    expect(result.elements).toEqual(["mixin-child", "own-child"]);
    expect(pageErrors).toEqual([]);
  } finally {
    await server.close();
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

test("updates the Wind4 preflight when a later client module adds theme tokens", async ({
  page,
}) => {
  const tempRoot = path.join(repoRoot, "test-results");
  await fs.mkdir(tempRoot, { recursive: true });
  const tempDir = await fs.mkdtemp(
    path.join(tempRoot, "litsx-unocss-wind4-serve-order-"),
  );
  const srcDir = path.join(tempDir, "src");
  await fs.mkdir(srcDir, { recursive: true });
  await fs.writeFile(
    path.join(tempDir, "index.html"),
    `<main id="app"></main><script type="module" src="/src/main.js"></script>`,
  );
  await fs.writeFile(
    path.join(srcDir, "early.tsx"),
    `
export function EarlyCard() {
  return <article class="p-4">Early</article>;
}
`,
  );
  await fs.writeFile(
    path.join(srcDir, "late.tsx"),
    `
export function LateCard() {
  return <article id="late-card" class="text-white rounded-lg">Late</article>;
}

export function LateGlobalCard() {
  return <article id="late-global-card" class="text-white rounded-lg">Late global</article>;
}
LateGlobalCard.lightDom = true;
`,
  );
  await fs.writeFile(
    path.join(srcDir, "theme.css"),
    `:root { --quartz-theme-probe: quartz-theme-still-present; }`,
  );
  await fs.writeFile(
    path.join(srcDir, "main.js"),
    `
import "./theme.css";
import "virtual:uno.css";
import { EarlyCard } from "./early.tsx";

customElements.define("early-card", EarlyCard);
document.querySelector("#app").append(document.createElement("early-card"));

await new Promise((resolve) => requestAnimationFrame(resolve));
window.__litsxInitialThemeProbe = getComputedStyle(document.documentElement)
  .getPropertyValue("--quartz-theme-probe")
  .trim();
window.__litsxInitialStyleIds = [...document.querySelectorAll("style[data-vite-dev-id]")]
  .map((style) => style.getAttribute("data-vite-dev-id"));
const { LateCard, LateGlobalCard } = await import("./late.tsx");
customElements.define("late-card", LateCard);
customElements.define("late-global-card", LateGlobalCard);
const lateCard = document.createElement("late-card");
document.querySelector("#app").append(lateCard);
const lateGlobal = document.createElement("late-global-card");
document.querySelector("#app").append(lateGlobal);
await lateCard.updateComplete;
await lateGlobal.updateComplete;
await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
window.__litsxLateCardReady = true;
`,
  );

  const server = await createServer({
    configFile: false,
    root: tempDir,
    cacheDir: path.join(tempDir, ".vite-cache"),
    logLevel: "silent",
    server: {
      host: "127.0.0.1",
      strictPort: false,
    },
    resolve: {
      alias: [
        {
          find: /^lit$/,
          replacement: path.resolve(repoRoot, "node_modules/lit/index.js"),
        },
        {
          find: "@litsx/core/elements",
          replacement: path.resolve(
            repoRoot,
            "packages/core/src/elements/index.js",
          ),
        },
        {
          find: "@litsx/core",
          replacement: path.resolve(repoRoot, "packages/core/src/index.js"),
        },
      ],
    },
    plugins: litsxUnoCss({
      litsx: { lightDomStyles: "global" },
      unocss: { presets: [presetWind4()] },
    }),
  });
  await server.listen();

  try {
    await page.goto(server.resolvedUrls.local[0]);
    await page.waitForFunction(() => window.__litsxLateCardReady === true);
    await page.waitForFunction(
      () =>
        getComputedStyle(document.querySelector("#late-global-card"))
          .borderRadius !== "0px",
    );
    const result = await page.evaluate(() => {
      const host = document.querySelector("late-card");
      const card = host?.shadowRoot?.querySelector("#late-card");
      const globalCard = document.querySelector("#late-global-card");
      const componentStyles =
        host?.constructor?.styles
          ?.flat(Infinity)
          .map((style) => style?.cssText ?? "")
          .join("\n") ?? "";
      return {
        radius: getComputedStyle(card).borderRadius,
        variable: getComputedStyle(card)
          .getPropertyValue("--colors-white")
          .trim(),
        className: card?.className ?? "",
        componentStyles,
        globalRadius: getComputedStyle(globalCard).borderRadius,
        globalColor: getComputedStyle(globalCard).color,
        themeProbe: getComputedStyle(document.documentElement)
          .getPropertyValue("--quartz-theme-probe")
          .trim(),
        initialThemeProbe: window.__litsxInitialThemeProbe,
        initialStyleIds: window.__litsxInitialStyleIds,
        viteStyleIds: [...document.querySelectorAll("style[data-vite-dev-id]")]
          .map((style) => style.getAttribute("data-vite-dev-id")),
      };
    });

    expect(
      result.initialThemeProbe,
      JSON.stringify({
        initialThemeProbe: result.initialThemeProbe,
        initialStyleIds: result.initialStyleIds,
      }),
    ).toBe("quartz-theme-still-present");
    expect(result.componentStyles).toContain("var(--colors-white)");
    expect(result.componentStyles).toContain("var(--radius-lg)");
    expect(result.componentStyles).not.toContain("--colors-white:");
    expect(result.componentStyles).not.toContain("--radius-lg:");
    expect(result.variable).not.toBe("");
    expect(result.className).toBe("text-white rounded-lg");
    expect(result.radius).not.toBe("0px");
    expect(result.globalRadius).not.toBe("0px");
    expect(result.globalColor).not.toBe("rgb(0, 0, 0)");
    expect(result.themeProbe).toBe("quartz-theme-still-present");
    expect(result.viteStyleIds.filter((id) => id?.endsWith("/src/theme.css"))).toHaveLength(1);
    expect(result.viteStyleIds.filter((id) => id === "/__litsx_unocss_global.css")).toHaveLength(1);
  } finally {
    await server.close();
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

test("preserves ordinary CSS while late Tailwind modules materialize utilities", async ({
  page,
}) => {
  const tempRoot = path.join(repoRoot, "test-results");
  await fs.mkdir(tempRoot, { recursive: true });
  const tempDir = await fs.mkdtemp(
    path.join(tempRoot, "litsx-tailwind-serve-order-"),
  );
  const srcDir = path.join(tempDir, "src");
  await fs.mkdir(srcDir, { recursive: true });
  await fs.writeFile(
    path.join(tempDir, "index.html"),
    `<main id="app"></main><script type="module" src="/src/main.js"></script>`,
  );
  await fs.writeFile(
    path.join(srcDir, "tailwind.css"),
    `@import "tailwindcss" source(none);`,
  );
  await fs.writeFile(
    path.join(srcDir, "theme.css"),
    `:root { --quartz-tailwind-probe: quartz-tailwind-still-present; }`,
  );
  await fs.writeFile(
    path.join(srcDir, "early.tsx"),
    `
export function EarlyTailwindCard() {
  return <article id="early-tailwind-card" class="p-4">Early</article>;
}
`,
  );
  await fs.writeFile(
    path.join(srcDir, "late.tsx"),
    `
export function LateTailwindCard() {
  return <article id="late-tailwind-card" class="rounded-lg bg-blue-500 p-6">Late</article>;
}

export function LateTailwindGlobalCard() {
  return <article id="late-tailwind-global-card" class="rounded-xl bg-green-500 p-8">Late global</article>;
}
LateTailwindGlobalCard.lightDom = true;
`,
  );
  await fs.writeFile(
    path.join(srcDir, "main.js"),
    `
import "./theme.css";
import { EarlyTailwindCard } from "./early.tsx";

customElements.define("early-tailwind-card", EarlyTailwindCard);
const earlyCard = document.createElement("early-tailwind-card");
document.querySelector("#app").append(earlyCard);
await earlyCard.updateComplete;
await new Promise((resolve) => requestAnimationFrame(resolve));
window.__litsxInitialTailwindThemeProbe = getComputedStyle(document.documentElement)
  .getPropertyValue("--quartz-tailwind-probe")
  .trim();
const { LateTailwindCard, LateTailwindGlobalCard } = await import("./late.tsx");
customElements.define("late-tailwind-card", LateTailwindCard);
customElements.define("late-tailwind-global-card", LateTailwindGlobalCard);
const lateCard = document.createElement("late-tailwind-card");
const lateGlobalCard = document.createElement("late-tailwind-global-card");
document.querySelector("#app").append(lateCard, lateGlobalCard);
await lateCard.updateComplete;
await lateGlobalCard.updateComplete;
await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
window.__litsxLateTailwindReady = true;
`,
  );

  const server = await createServer({
    configFile: false,
    root: tempDir,
    cacheDir: path.join(tempDir, ".vite-cache"),
    logLevel: "silent",
    server: {
      host: "127.0.0.1",
      strictPort: false,
    },
    resolve: {
      alias: [
        {
          find: /^lit$/,
          replacement: path.resolve(repoRoot, "node_modules/lit/index.js"),
        },
        {
          find: "@litsx/core/elements",
          replacement: path.resolve(
            repoRoot,
            "packages/core/src/elements/index.js",
          ),
        },
        {
          find: "@litsx/core",
          replacement: path.resolve(repoRoot, "packages/core/src/index.js"),
        },
      ],
    },
    plugins: litsxTailwind({
      litsx: { lightDomStyles: "global" },
      integration: {
        entry: "./src/tailwind.css",
        sources: [],
      },
    }),
  });
  await server.listen();

  try {
    await page.goto(server.resolvedUrls.local[0]);
    await page.waitForFunction(() => window.__litsxLateTailwindReady === true);
    await page.waitForFunction(
      () =>
        getComputedStyle(
          document.querySelector("#late-tailwind-global-card"),
        ).padding === "32px",
    );
    const result = await page.evaluate(() => {
      const earlyHost = document.querySelector("early-tailwind-card");
      const lateHost = document.querySelector("late-tailwind-card");
      const earlyCard = earlyHost?.shadowRoot?.querySelector(
        "#early-tailwind-card",
      );
      const lateCard = lateHost?.shadowRoot?.querySelector(
        "#late-tailwind-card",
      );
      const lateGlobalCard = document.querySelector(
        "#late-tailwind-global-card",
      );
      return {
        initialThemeProbe: window.__litsxInitialTailwindThemeProbe,
        themeProbe: getComputedStyle(document.documentElement)
          .getPropertyValue("--quartz-tailwind-probe")
          .trim(),
        earlyPadding: getComputedStyle(earlyCard).padding,
        latePadding: getComputedStyle(lateCard).padding,
        lateRadius: getComputedStyle(lateCard).borderRadius,
        globalPadding: getComputedStyle(lateGlobalCard).padding,
        globalRadius: getComputedStyle(lateGlobalCard).borderRadius,
        viteStyleIds: [...document.querySelectorAll("style[data-vite-dev-id]")]
          .map((style) => style.getAttribute("data-vite-dev-id")),
      };
    });

    expect(result.initialThemeProbe).toBe("quartz-tailwind-still-present");
    expect(result.themeProbe).toBe("quartz-tailwind-still-present");
    expect(result.earlyPadding).toBe("16px");
    expect(result.latePadding).toBe("24px");
    expect(result.lateRadius).not.toBe("0px");
    expect(result.globalPadding).toBe("32px");
    expect(result.globalRadius).not.toBe("0px");
    expect(
      result.viteStyleIds.filter((id) => id?.endsWith("/src/theme.css")),
    ).toHaveLength(1);
    const tailwindStyleIds = result.viteStyleIds.filter((id) =>
      id?.includes("@litsx/tailwind/"),
    );
    expect(tailwindStyleIds.length).toBeGreaterThan(0);
    expect(new Set(tailwindStyleIds).size).toBe(tailwindStyleIds.length);
  } finally {
    await server.close();
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

test("restores an SSR resource snapshot before the first hydrated render", async ({
  page,
}) => {
  const tempRoot = path.join(repoRoot, "test-results");
  await fs.mkdir(tempRoot, { recursive: true });
  const tempDir = await fs.mkdtemp(
    path.join(tempRoot, "litsx-resource-snapshot-"),
  );
  const srcDir = path.join(tempDir, "src");
  await fs.mkdir(srcDir, { recursive: true });
  await fs.writeFile(
    path.join(srcDir, "resource-card.tsx"),
    `
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
`,
  );
  await fs.writeFile(
    path.join(srcDir, "main.js"),
    `
import { defineResourceCard } from "./resource-card.tsx";
defineResourceCard();
`,
  );

  const server = await createSsrDevServer({
    root: tempDir,
    vite: isolatedViteOptions(tempDir),
    clientEntry: "./src/main.js",
    logLevel: "silent",
    host: "127.0.0.1",
    strictPort: false,
    elements(loader) {
      return {
        "resource-card": async () => {
          const module = await loader("./src/resource-card.tsx");
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
    expect(documentSource).toContain(
      '"resources":{"library:i18n":{"title":"SSR resource"}}',
    );
    await page.goto(url);
    // Vite may perform one development reload after materializing the first
    // client asset graph. Assert against the settled hydration document.
    await page.waitForTimeout(1_000);
    await page.waitForLoadState("networkidle");
    await page.waitForFunction(
      () => customElements.get("resource-card") !== undefined,
    );
    const result = await page.evaluate(() => ({
      title: document
        .querySelector("resource-card")
        ?.shadowRoot?.querySelector("#title")?.textContent,
      titleCount: document
        .querySelector("resource-card")
        ?.shadowRoot?.querySelectorAll("#title").length,
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

test("hydrates both useExpose signatures without executing imperative handles during SSR", async ({
  page,
}) => {
  const tempRoot = path.join(repoRoot, "test-results");
  await fs.mkdir(tempRoot, { recursive: true });
  const tempDir = await fs.mkdtemp(path.join(tempRoot, "litsx-ssr-expose-"));
  const srcDir = path.join(tempDir, "src");
  await fs.mkdir(srcDir, { recursive: true });
  await fs.writeFile(
    path.join(srcDir, "expose-card.tsx"),
    `
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
    window.__forwardedExposeHandle = forwardedRef.value;
  }, []);

  return <p id="status">Expose ready</p>;
}

export function defineExposeCard() {
  if (!customElements.get("expose-card")) customElements.define("expose-card", ExposeCard);
}
`,
  );
  await fs.writeFile(
    path.join(srcDir, "main.js"),
    `
import { defineExposeCard } from "./expose-card.tsx";
defineExposeCard();
`,
  );

  const server = await createSsrDevServer({
    root: tempDir,
    vite: isolatedViteOptions(tempDir),
    clientEntry: "./src/main.js",
    logLevel: "silent",
    host: "127.0.0.1",
    strictPort: false,
    elements(loader) {
      return {
        "expose-card": async () =>
          (await loader("./src/expose-card.tsx")).ExposeCard,
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
      return (
        typeof element?.focus === "function" &&
        typeof window.__forwardedExposeHandle?.focus === "function"
      );
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

test("restores a native object ref after the first client render suspends", async ({
  page,
}) => {
  const tempRoot = path.join(repoRoot, "test-results");
  await fs.mkdir(tempRoot, { recursive: true });
  const tempDir = await fs.mkdtemp(
    path.join(tempRoot, "litsx-ssr-suspended-ref-"),
  );
  const srcDir = path.join(tempDir, "src");
  await fs.mkdir(srcDir, { recursive: true });
  await fs.writeFile(
    path.join(srcDir, "suspended-form.tsx"),
    `
import { useOnCommit, useRef } from "@litsx/core";

let clientReady = typeof window === "undefined";
let clientPending = null;

function useColdClientResource() {
  if (clientReady) return;
  clientPending ??= new Promise((resolve) => {
    setTimeout(() => {
      clientReady = true;
      resolve();
    }, 20);
  });
  throw clientPending;
}

export function SuspendedForm() {
  const formRef = useRef(null);
  useColdClientResource();
  useOnCommit(() => {
    window.__suspendedFormRef = formRef.value;
    window.__suspendedFormCommitCount = (window.__suspendedFormCommitCount ?? 0) + 1;
  }, []);
  return <form ref={formRef} id="suspended-form"><input name="query" value="ready" /></form>;
}

export function defineSuspendedForm() {
  if (!customElements.get("suspended-form")) customElements.define("suspended-form", SuspendedForm);
}
`,
  );
  await fs.writeFile(
    path.join(srcDir, "main.js"),
    `
import { defineSuspendedForm } from "./suspended-form.tsx";
defineSuspendedForm();
`,
  );

  const server = await createSsrDevServer({
    root: tempDir,
    vite: isolatedViteOptions(tempDir),
    clientEntry: "./src/main.js",
    logLevel: "silent",
    host: "127.0.0.1",
    strictPort: false,
    elements(loader) {
      return {
        "suspended-form": async () =>
          (await loader("./src/suspended-form.tsx")).SuspendedForm,
      };
    },
    render({ html: serverHtml }) {
      return serverHtml`<suspended-form></suspended-form>`;
    },
  });
  await server.listen();

  try {
    const pageErrors = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));
    const url = server.resolvedUrls.local[0];
    const ssrHtml = await (await fetch(url)).text();
    expect(ssrHtml.match(/<form\b/g) ?? []).toHaveLength(1);

    await page.goto(url, { waitUntil: "networkidle" });
    await page.waitForFunction(() => {
      const host = document.querySelector("suspended-form");
      const form = host?.shadowRoot?.querySelector("#suspended-form") ?? null;
      return Boolean(form && window.__suspendedFormRef === form);
    });

    expect(
      await page.evaluate(() => {
        const host = document.querySelector("suspended-form");
        const forms =
          host?.shadowRoot?.querySelectorAll("#suspended-form") ?? [];
        return {
          formCount: forms.length,
          refMatches:
            forms.length === 1 && window.__suspendedFormRef === forms[0],
          commits: window.__suspendedFormCommitCount ?? 0,
        };
      }),
    ).toEqual({
      formCount: 1,
      refMatches: true,
      commits: 1,
    });
    expect(pageErrors).toEqual([]);
  } finally {
    await server.close();
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

test("keeps dynamic noscript fallback markup inert with JavaScript and usable without it", async ({
  browser,
  page,
}) => {
  const server = await createSsrDevServer({
    root: repoRoot,
    logLevel: "silent",
    host: "127.0.0.1",
    strictPort: false,
    render({ html: serverHtml }) {
      const title = "No JavaScript fallback";
      // Keep the elements adjacent: this fixture asserts the exact fallback text.
      const fallback = () => {
        // prettier-ignore
        return html`<section id="noscript-fallback"><h2>${title}</h2><a href="/browse">Browse</a></section>`;
      };
      return serverHtml`<main><noscript data-litsx-noscript=${__litsxNoscript(fallback)}></noscript></main>`;
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

    const noScriptContext = await browser.newContext({
      javaScriptEnabled: false,
    });
    const noScriptPage = await noScriptContext.newPage();
    await noScriptPage.goto(url);
    await expect(noScriptPage.locator("#noscript-fallback")).toHaveText(
      "No JavaScript fallbackBrowse",
    );
    await expect(noScriptPage.locator("#noscript-fallback a")).toHaveAttribute(
      "href",
      "/browse",
    );
    await noScriptContext.close();
  } finally {
    await server.close();
  }
});

test("hydrates a compiled LitSX host containing a dynamic noscript fallback without errors", async ({
  page,
}) => {
  const tempRoot = path.join(repoRoot, "test-results");
  await fs.mkdir(tempRoot, { recursive: true });
  const tempDir = await fs.mkdtemp(
    path.join(tempRoot, "litsx-ssr-noscript-hydration-"),
  );
  const srcDir = path.join(tempDir, "src");
  await fs.mkdir(srcDir, { recursive: true });
  await fs.writeFile(
    path.join(srcDir, "noscript-host.tsx"),
    `
export function NoscriptHost() {
  const title = "Hydrated fallback";
  return <main><noscript><NoscriptCard title={title} /></noscript><p id="live-content">Live content</p></main>;
}

export function NoscriptCard({ title = "" }) {
  return <section id="noscript-fallback"><h2>{title}</h2></section>;
}

export function defineNoscriptHost() {
  if (!customElements.get("noscript-host")) {
    customElements.define("noscript-host", NoscriptHost);
  }
}
`,
  );
  await fs.writeFile(
    path.join(srcDir, "main.js"),
    `
import { defineNoscriptHost } from "./noscript-host.tsx";
defineNoscriptHost();
`,
  );
  const server = await createSsrDevServer({
    root: tempDir,
    vite: isolatedViteOptions(tempDir),
    clientEntry: "./src/main.js",
    logLevel: "silent",
    host: "127.0.0.1",
    strictPort: false,
    elements(loader) {
      return {
        "noscript-host": async () =>
          (await loader("./src/noscript-host.tsx")).NoscriptHost,
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
    await page.waitForFunction(
      () => customElements.get("noscript-host") !== undefined,
    );
    const result = await page.evaluate(() => {
      const root = document.querySelector("noscript-host")?.shadowRoot;
      return {
        fallbackElementCount:
          root?.querySelectorAll("#noscript-fallback").length ?? 0,
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

test("hydrates nested LitSX property bindings for arrays, objects, and callbacks", async ({
  browser,
  page,
}) => {
  const tempRoot = path.join(repoRoot, "test-results");
  await fs.mkdir(tempRoot, { recursive: true });
  const tempDir = await fs.mkdtemp(
    path.join(tempRoot, "litsx-nested-properties-"),
  );
  const srcDir = path.join(tempDir, "src");
  await fs.mkdir(srcDir, { recursive: true });
  await fs.writeFile(
    path.join(srcDir, "nested-properties.tsx"),
    `
import { useOnConnect, useState } from "@litsx/core";

type Item = { id: string; label: string };
type Config = { pageSize: number };
type NestedProps = {
  items?: Item[];
  config?: Config;
  value?: number;
  enabled?: boolean;
  onNavigate?: (item: Item) => void;
};
type ParentProps = NestedProps & {
  resolveItems?: (items: Item[]) => Item[];
  resolveConfig?: (config: Config) => Config;
  createNavigateHandler?: () => (item: Item) => void;
};

export function NestedPropertyGrandchild({
  items = [],
  config = {},
  value = 0,
  enabled = false,
  onNavigate = () => {},
}: NestedProps) {
  useOnConnect(() => {
    window.__nestedPropertyState = {
      itemIds: items.map((item) => item.id),
      pageSize: config.pageSize,
      value,
      enabled,
      callbackType: typeof onNavigate,
    };
  }, [items, config, enabled, onNavigate]);
  return <button id="navigate" on:click={() => onNavigate(items[0])}>{items[0]?.label}:{config.pageSize}:{value}:{String(enabled)}</button>;
}

export function NestedPropertyChild({
  items = [],
  config = {},
  value = 0,
  enabled = false,
  onNavigate = () => {},
}: NestedProps) {
  return (
    <NestedPropertyGrandchild
      items={items}
      config={config}
      value={value}
      enabled={enabled}
      onNavigate={onNavigate}
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
}: ParentProps) {
  const [revision, setRevision] = useState(0);
  return (
    <section>
      <button id="refresh" on:click={() => setRevision(revision + 1)}>Refresh</button>
      <NestedPropertyChild
        items={resolveItems(items)}
        config={resolveConfig(config)}
        value={revision}
        enabled={true}
        onNavigate={createNavigateHandler()}
      />
    </section>
  );
}

export function defineNestedProperties() {
  if (!customElements.get("nested-property-parent")) {
    customElements.define("nested-property-parent", NestedPropertyParent);
  }
}
`,
  );
  await fs.writeFile(
    path.join(srcDir, "main.js"),
    `
import { defineNestedProperties } from "./nested-properties.tsx";
defineNestedProperties();
`,
  );

  const server = await createSsrDevServer({
    root: tempDir,
    vite: isolatedViteOptions(tempDir),
    clientEntry: "./src/main.js",
    logLevel: "silent",
    host: "127.0.0.1",
    strictPort: false,
    elements(loader) {
      return {
        "nested-property-parent": async () =>
          (await loader("./src/nested-properties.tsx")).NestedPropertyParent,
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
    expect(ssrHtml.match(/<nested-property-grandchild\b/g) ?? []).toHaveLength(
      1,
    );

    const ssrContext = await browser.newContext({ javaScriptEnabled: false });
    const ssrPage = await ssrContext.newPage();
    await ssrPage.goto(url);
    expect(
      await ssrPage.evaluate(() => {
        const parent = document.querySelector("nested-property-parent");
        const children =
          parent?.shadowRoot?.querySelectorAll("nested-property-child") ?? [];
        const child = children[0];
        return {
          childCount: children.length,
          grandchildCount:
            child?.shadowRoot?.querySelectorAll("nested-property-grandchild")
              .length ?? 0,
        };
      }),
    ).toEqual({ childCount: 1, grandchildCount: 1 });
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
    await page
      .locator("nested-property-parent")
      .evaluate((parent) =>
        parent.shadowRoot.querySelector("#refresh").click(),
      );
    await page.waitForFunction(() => {
      const parent = document.querySelector("nested-property-parent");
      const child = parent?.shadowRoot?.querySelector("nested-property-child");
      const grandchild = child?.shadowRoot?.querySelector(
        "nested-property-grandchild",
      );
      return grandchild?.value === 1;
    });
    expect(
      await page.evaluate(() => {
        const parent = document.querySelector("nested-property-parent");
        const children =
          parent?.shadowRoot?.querySelectorAll("nested-property-child") ?? [];
        const child = children[0];
        const grandchildren =
          child?.shadowRoot?.querySelectorAll("nested-property-grandchild") ??
          [];
        const grandchild = grandchildren[0];
        return {
          childCount: children.length,
          grandchildCount: grandchildren.length,
          childMatchesParentScope:
            child?.constructor ===
            parent?.constructor?.elements?.["nested-property-child"],
          grandchildMatchesChildScope:
            grandchild?.constructor ===
            child?.constructor?.elements?.["nested-property-grandchild"],
        };
      }),
    ).toEqual({
      childCount: 1,
      grandchildCount: 1,
      childMatchesParentScope: true,
      grandchildMatchesChildScope: true,
    });
    const button = await page
      .locator("nested-property-parent")
      .evaluateHandle((parent) =>
        parent.shadowRoot
          .querySelector("nested-property-child")
          .shadowRoot.querySelector("nested-property-grandchild")
          .shadowRoot.querySelector("#navigate"),
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
import { css, useOnConnect, useState } from "@litsx/core";

export function SsrLeafShadow({ label = "" }) {
  useOnConnect(() => {
    window.__litsxClientConnectCalls = (window.__litsxClientConnectCalls ?? 0) + 1;
  }, []);
  const [count, setCount] = useState(3);
  return <button id="leaf-button" on:click={() => setCount(count + 1)}>leaf:{label}:{count}</button>;
}
SsrLeafShadow.styles = css\`:host { display: inline-block; color: rgb(0, 96, 128); }\`;

export function SsrLightLayer({ children, level = 0 }) {
  return <section class="light-layer" data-level={level}>{children}</section>;
}
SsrLightLayer.lightDom = true;

export function SsrShadowLayer({ children, level = 0 }) {
  return <section class="shadow-layer" data-level={level}>{children}</section>;
}
SsrShadowLayer.styles = css\`:host { display: contents; }\`;

export function SsrAppRoot({ name = "demo" }) {
  const [title] = useState(name);
  return (
    <main id="app-root">
      <h1>{title}</h1>
      <SsrShadowLayer level={1}>
        <SsrLightLayer level={2}>
          <SsrShadowLayer level={3}>
            <SsrLightLayer level={4}>
              <SsrLeafShadow label={title} />
            </SsrLightLayer>
          </SsrShadowLayer>
        </SsrLightLayer>
      </SsrShadowLayer>
    </main>
  );
}
SsrAppRoot.styles = css\`:host { display: block; }\`;

export function defineSsrComponents() {
  if (!customElements.get("ssr-app-root")) {
    customElements.define("ssr-app-root", SsrAppRoot);
  }
}
`;
}

function createSuspenseComponentsSource() {
  return `
import { css, SuspenseBoundary, SuspenseList, useOnConnect, useRef, useState, type LitsxRenderable } from "@litsx/core";

function createDeferred() {
  let resolve = null;
  const promise = new Promise((nextResolve) => {
    resolve = nextResolve;
  });
  return { promise, resolve };
}

function resolvePendingSteps(pendingStepsRef) {
  pendingStepsRef.value ??= new Map();
  return pendingStepsRef.value;
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
  return (
    <article class="guide-card">
      <p class="guide-card__eyebrow">{eyebrow}</p>
      <h2>{titleRenderer()}</h2>
      {contentRenderer()}
    </article>
  );
};

GuideCard.styles = css\`
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

export const SuspenseGuideApp = () => {
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
    pendingStepsRef.value = new Map();
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
      pendingStepsRef.value = new Map();
    };
  }, []);

  const renderGuideCard = (stepIndex, renderCard) => {
    // These delays model client-side staged reveal. On the server, their
    // promises have no lifecycle hook to resolve them, so suspending here
    // would prevent SSR from ever producing the hydration shell.
    if (typeof window === "undefined") {
      return renderCard();
    }
    suspendUntil(pendingStepsRef, stepIndex, revealedCount);
    return renderCard();
  };

  return (
    <section class="guide" aria-label="Getting started with LitSX">
      <SuspenseList class="guide-list" reveal-order="forwards" tail="hidden">
        <SuspenseBoundary fallback={null}>
          {renderGuideCard(0, () => (
              <GuideCard
                eyebrow={"Getting started"}
                titleRenderer={() => <><code>src/app.tsx</code>, then open <code>Getting Started</code></>}
                contentRenderer={() => <p>First card body</p>}
              />
          ))}
        </SuspenseBoundary>

        <SuspenseBoundary fallback={null}>
          {renderGuideCard(1, () => (
              <GuideCard
                eyebrow={"Authored model"}
                titleRenderer={() => <>Read <code>Authored Model</code> while you learn LitSX bindings</>}
                contentRenderer={() => <p>Second card body</p>}
              />
          ))}
        </SuspenseBoundary>

        <SuspenseBoundary fallback={null}>
          {renderGuideCard(2, () => (
              <GuideCard
                eyebrow={"Tooling flow"}
                titleRenderer={() => "Pair the tooling docs with your daily loop"}
                contentRenderer={() => (
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

SuspenseGuideApp.styles = css\`
  :host { display: block; padding: 24px; font-family: sans-serif; }
  .guide-list { display: grid; gap: 18px; grid-template-columns: repeat(3, minmax(0, 1fr)); }
\`;

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

test("hydrates a real browser page when component modules load before the hydration runtime", async ({
  browser,
  page,
}) => {
  const tempRoot = path.join(repoRoot, "test-results");
  await fs.mkdir(tempRoot, { recursive: true });
  const tempDir = await fs.mkdtemp(path.join(tempRoot, "litsx-ssr-browser-"));
  const srcDir = path.join(tempDir, "src");
  await fs.mkdir(srcDir, { recursive: true });

  const clientComponentsPath = path.join(srcDir, "components.client.tsx");
  const clientPreloadPath = path.join(srcDir, "preload.js");
  const clientEntryPath = path.join(srcDir, "main.js");
  const componentsSource = createComponentsSource();
  await fs.writeFile(clientComponentsPath, componentsSource);
  await fs.writeFile(
    clientPreloadPath,
    `
import "./components.client.tsx";
`,
  );
  await fs.writeFile(
    clientEntryPath,
    `
// The SSR bootstrap imports this entry through hydratePage({ register }).
// Entries register custom elements; they must not hydrate the document again.
const components = await import("./components.client.tsx");
const { registerHydrationModules } = await import("@litsx/ssr/hydration");
await registerHydrationModules([components]);
`,
  );
  const server = await createSsrDevServer({
    root: tempDir,
    vite: isolatedViteOptions(tempDir),
    clientEntry: "./src/main.js",
    bootstrap: {
      content: `
if (new URL(window.location.href).searchParams.has("scoped-polyfill")) {
  await import("@webcomponents/scoped-custom-element-registry");
}
await import("/src/preload.js");
const { hydratePage } = await import("@litsx/ssr/hydration");
await hydratePage({ register: () => import("/src/main.js") });
`,
    },
    logLevel: "silent",
    host: "127.0.0.1",
    strictPort: false,
    elements(loader) {
      return {
        "ssr-app-root": async () =>
          (await loader("./src/components.client.tsx")).SsrAppRoot,
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
    const pageErrors = [];
    page.on("console", (message) => {
      if (message.type() === "error") {
        consoleErrors.push(message.text());
      }
    });
    page.on("pageerror", (error) =>
      pageErrors.push(error.stack || error.message),
    );
    await page.addInitScript(() => {
      const captureSsrNode = () => {
        const root = document.querySelector("ssr-app-root");
        const node = root?.shadowRoot?.querySelector("#app-root");
        if (node && !window.__litsxInitialSsrAppRoot) {
          window.__litsxInitialSsrAppRoot = node;
        }
        const findLeafButton = (searchRoot) => {
          for (const element of searchRoot?.querySelectorAll?.("*") ?? []) {
            if (element.id === "leaf-button") return element;
            const nested =
              element.shadowRoot && findLeafButton(element.shadowRoot);
            if (nested) return nested;
          }
          return null;
        };
        const button = findLeafButton(root?.shadowRoot);
        if (button && !window.__litsxInitialSsrLeafButton) {
          window.__litsxInitialSsrLeafButton = button;
        }
      };
      new MutationObserver(captureSsrNode).observe(document, {
        childList: true,
        subtree: true,
      });
    });
    await page.goto(url);
    await page.waitForFunction(() => window.__litsxClientConnectCalls === 1);

    const browserResult = await page.evaluate((hydrationPayloadProperty) => {
      const root = document.querySelector("ssr-app-root");
      return {
        rootPayload: root?.[hydrationPayloadProperty] ?? null,
        rootText:
          root?.shadowRoot?.querySelector("#app-root")?.textContent ?? "",
        hasDeclarativeShadowDom: Boolean(root?.shadowRoot),
        preservedSsrNode:
          root?.shadowRoot?.querySelector("#app-root") ===
          window.__litsxInitialSsrAppRoot,
        preservedSsrLeafButton: (() => {
          const visit = (searchRoot) => {
            for (const element of searchRoot?.querySelectorAll?.("*") ?? []) {
              if (element.id === "leaf-button") return element;
              const nested = element.shadowRoot && visit(element.shadowRoot);
              if (nested) return nested;
            }
            return null;
          };
          return visit(root?.shadowRoot) === window.__litsxInitialSsrLeafButton;
        })(),
      };
    }, LITSX_HYDRATION_PAYLOAD_PROPERTY);
    expect(consoleErrors).toEqual([]);
    expect(pageErrors).toEqual([]);
    expect(browserResult.hasDeclarativeShadowDom).toBe(true);
    expect(browserResult.preservedSsrNode).toBe(true);
    expect(browserResult.preservedSsrLeafButton).toBe(true);
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
      return (
        buttons.length === 1 && buttons[0].textContent === "leaf:Real Browser:3"
      );
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

    const polyfillContext = await browser.newContext();
    const polyfillPage = await polyfillContext.newPage();
    const polyfillErrors = [];
    polyfillPage.on("console", (message) => {
      if (message.type() === "error") {
        polyfillErrors.push(message.text());
      }
    });
    polyfillPage.on("pageerror", (error) =>
      polyfillErrors.push(error.stack || error.message),
    );
    await polyfillPage.addInitScript(() => {
      const captureSsrNode = () => {
        const node = document
          .querySelector("ssr-app-root")
          ?.shadowRoot?.querySelector("#app-root");
        if (node && !window.__litsxInitialSsrAppRoot) {
          window.__litsxInitialSsrAppRoot = node;
        }
      };
      new MutationObserver(captureSsrNode).observe(document, {
        childList: true,
        subtree: true,
      });
    });

    try {
      await polyfillPage.goto(`${url}?scoped-polyfill=1`);
      try {
        await polyfillPage.waitForFunction(
          () => window.__litsxClientConnectCalls === 1,
          undefined,
          { timeout: 5000 },
        );
      } catch (error) {
        throw new Error(
          `Polyfilled hydration did not connect: ${JSON.stringify(polyfillErrors)}`,
          { cause: error },
        );
      }
      const polyfillResult = await polyfillPage.evaluate(() => {
        const root = document.querySelector("ssr-app-root");
        const lightLayers = [];
        const collectLightLayers = (searchRoot) => {
          for (const element of searchRoot.querySelectorAll(
            "ssr-light-layer",
          )) {
            lightLayers.push(element);
          }
          for (const element of searchRoot.querySelectorAll("*")) {
            if (element.shadowRoot) {
              collectLightLayers(element.shadowRoot);
            }
          }
        };
        collectLightLayers(document);
        return {
          preservedSsrNode:
            root?.shadowRoot?.querySelector("#app-root") ===
            window.__litsxInitialSsrAppRoot,
          lightLayerCount: lightLayers.length,
          lightLayersInitialized: lightLayers.every(
            (element) => element.constructor.name !== "HTMLElement",
          ),
        };
      });

      expect(polyfillErrors).toEqual([]);
      expect(polyfillResult).toEqual({
        preservedSsrNode: true,
        lightLayerCount: 2,
        lightLayersInitialized: true,
      });
    } finally {
      await polyfillContext.close();
    }
  } finally {
    await server.close();
  }
});

test("hydrates without DOM duplication when using only the public hydration module-registration API", async ({
  page,
}) => {
  const tempRoot = path.join(repoRoot, "test-results");
  await fs.mkdir(tempRoot, { recursive: true });
  const tempDir = await fs.mkdtemp(
    path.join(tempRoot, "litsx-ssr-browser-register-"),
  );
  const srcDir = path.join(tempDir, "src");
  await fs.mkdir(srcDir, { recursive: true });

  const clientComponentsPath = path.join(srcDir, "components.client.tsx");
  const clientEntryPath = path.join(srcDir, "main.js");
  const hydrationEntryPath = path.join(
    repoRoot,
    "packages/ssr/src/hydration.js",
  );
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
  () => import("./components.client.tsx"),
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
    vite: isolatedViteOptions(tempDir),
    clientEntry: "./src/main.js",
    logLevel: "silent",
    host: "127.0.0.1",
    strictPort: false,
    elements(loader) {
      return {
        "ssr-app-root": async () =>
          (await loader("./src/components.client.tsx")).SsrAppRoot,
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
    await page.waitForFunction(() =>
      Boolean(window.__litsxSsrRegisterBrowserResult),
    );

    const browserResult = await page.evaluate(
      () => window.__litsxSsrRegisterBrowserResult,
    );
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

test("reveals suspense-list guide cards after SSR hydration", async ({
  page,
}) => {
  test.setTimeout(60_000);
  const tempRoot = path.join(repoRoot, "test-results");
  await fs.mkdir(tempRoot, { recursive: true });
  const tempDir = await fs.mkdtemp(
    path.join(tempRoot, "litsx-ssr-suspense-browser-"),
  );
  const srcDir = path.join(tempDir, "src");
  await fs.mkdir(srcDir, { recursive: true });

  const clientComponentsPath = path.join(srcDir, "components.client.tsx");
  const clientEntryPath = path.join(srcDir, "main.js");
  await fs.writeFile(clientComponentsPath, createSuspenseComponentsSource());
  await fs.writeFile(
    clientEntryPath,
    `
import { defineSsrComponents } from "./components.client.tsx";

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
    vite: isolatedViteOptions(tempDir),
    clientEntry: "./src/main.js",
    logLevel: "silent",
    host: "127.0.0.1",
    strictPort: false,
    elements(loader) {
      return {
        "suspense-guide-app": async () =>
          (await loader("./src/components.client.tsx")).SuspenseGuideApp,
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
    await page.waitForFunction(
      () => Boolean(window.__litsxSsrSuspenseGuideResult),
      null,
      {
        timeout: 5000,
      },
    );

    const result = await page.evaluate(
      () => window.__litsxSsrSuspenseGuideResult,
    );
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
