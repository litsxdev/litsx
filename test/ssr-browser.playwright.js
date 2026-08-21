import fs from "node:fs/promises";
import path from "node:path";
import { expect, test } from "@playwright/test";
import { createServer } from "vite";
import { createSsrDevServer } from "../packages/ssr/src/index.js";
import { LITSX_HYDRATION_PAYLOAD_PROPERTY } from "../packages/ssr/src/hydration.js";
import { __litsxNoscript } from "../packages/core/src/index.js";
import {
  createUnoCssVitePlugins,
  litsxUnoCss,
  withUnoCssViteCompiler,
} from "../packages/unocss/src/vite.js";
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
      };
    },
    render({ html: serverHtml }) {
      return serverHtml`
        <shadow-wind-card></shadow-wind-card>
        <light-wind-card></light-wind-card>
        <dynamic-wind-button size="sm" appearance="default"></dynamic-wind-button>
        <dynamic-wind-button size="md" appearance="primary"></dynamic-wind-button>
        <dynamic-wind-button size="lg" appearance="danger"></dynamic-wind-button>
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
        document.querySelector("#global-light-panel") !== null,
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
`,
  );
  await fs.writeFile(
    path.join(srcDir, "main.js"),
    `
import "virtual:uno.css";
import { EarlyCard } from "./early.tsx";

customElements.define("early-card", EarlyCard);
document.querySelector("#app").append(document.createElement("early-card"));

await new Promise((resolve) => requestAnimationFrame(resolve));
const { LateCard } = await import("./late.tsx");
customElements.define("late-card", LateCard);
const lateCard = document.createElement("late-card");
document.querySelector("#app").append(lateCard);
const lateGlobal = document.createElement("article");
lateGlobal.id = "late-global-card";
lateGlobal.className = "text-white rounded-lg";
lateGlobal.textContent = "Late global";
document.querySelector("#app").append(lateGlobal);
await lateCard.updateComplete;
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
    plugins: litsxUnoCss({ unocss: { presets: [presetWind4()] } }),
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
      return {
        radius: getComputedStyle(card).borderRadius,
        variable: getComputedStyle(card)
          .getPropertyValue("--colors-white")
          .trim(),
        className: card?.className ?? "",
        preflight: host?.constructor?.styles?.[0]?.cssText ?? "",
        utilities: host?.constructor?.styles?.[1]?.cssText ?? "",
        globalRadius: getComputedStyle(globalCard).borderRadius,
        globalColor: getComputedStyle(globalCard).color,
      };
    });

    expect(result.utilities).toContain("var(--colors-white)");
    expect(result.utilities).toContain("var(--radius-lg)");
    expect(result.preflight).toContain("--colors-white:");
    expect(result.preflight).toContain("--radius-lg:");
    expect(result.variable).not.toBe("");
    expect(result.className).toBe("text-white rounded-lg");
    expect(result.radius).not.toBe("0px");
    expect(result.globalRadius).not.toBe("0px");
    expect(result.globalColor).not.toBe("rgb(0, 0, 0)");
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
