import path from "node:path";
import { expect, test } from "@playwright/test";
import { createSsrDevServer } from "../packages/ssr/src/index.js";

const repoRoot = path.resolve(import.meta.dirname, "..");
const fixtureRoot = path.join(repoRoot, "test/fixtures/svg-interoperability");
const SVG_NS = "http://www.w3.org/2000/svg";
const HTML_NS = "http://www.w3.org/1999/xhtml";

test.describe("native JSX SVG interoperability", () => {
  let server;
  let baseUrl;

  test.beforeAll(async () => {
    server = await createSsrDevServer({
      root: fixtureRoot,
      vite: {
        cacheDir: path.join(repoRoot, "test-results/svg-interoperability-vite"),
        optimizeDeps: { noDiscovery: true },
      },
      clientEntry: "./src/main.js",
      bootstrap: {
        content: `
try {
const host = document.querySelector("svg-host");
const root = host?.shadowRoot;
window.__svgBeforeHydration = {
  host,
  svg: root?.querySelector("[data-icon]"),
  primary: root?.querySelector("[data-primary]"),
  spread: root?.querySelector("[data-spread]"),
  namespacedSpread: root?.querySelector("[data-namespaced-spread]"),
  dynamic: [...(root?.querySelectorAll("[data-dynamic]") ?? [])],
  foreignObject: root?.querySelector("[data-foreign]"),
  htmlChild: root?.querySelector("[data-html-child]"),
};
const { hydratePage } = await import("@litsx/ssr/hydration");
await hydratePage({ register: () => import("/src/main.js") });
await host?.updateComplete;
window.__svgHydrated = true;
} catch (error) {
  window.__svgError = error?.stack ?? String(error);
  throw error;
}
`,
      },
      logLevel: "silent",
      host: "127.0.0.1",
      strictPort: false,
      elements(loader) {
        return {
          "svg-host": async () => (await loader("./src/svg-host.tsx")).SvgHost,
        };
      },
      render({ html }) {
        return html`<svg-host></svg-host>`;
      },
    });
    await server.listen();
    baseUrl = server.resolvedUrls.local[0];
  });

  test.afterAll(async () => {
    await server?.close();
  });

  async function waitForHydration(page) {
    await page.waitForFunction(() => window.__svgHydrated === true || window.__svgError);
    expect(await page.evaluate(() => window.__svgError ?? null)).toBeNull();
  }

  test("preserves SSR SVG nodes, namespaces and dynamic attributes through hydration", async ({ page }) => {
    const pageErrors = [];
    const consoleWarnings = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));
    page.on("console", (message) => {
      if (
        message.type() === "warning" &&
        !message.text().startsWith("Lit is in dev mode.")
      ) {
        consoleWarnings.push(message.text());
      }
    });
    await page.goto(baseUrl);
    await waitForHydration(page);

    const result = await page.evaluate(() => {
      const before = window.__svgBeforeHydration;
      const host = document.querySelector("svg-host");
      const root = host.shadowRoot;
      const svg = root.querySelector("[data-icon]");
      const primary = root.querySelector("[data-primary]");
      const spread = root.querySelector("[data-spread]");
      const namespacedSpread = root.querySelector("[data-namespaced-spread]");
      const dynamic = [...root.querySelectorAll("[data-dynamic]")];
      const foreignObject = root.querySelector("[data-foreign]");
      const htmlChild = root.querySelector("[data-html-child]");
      return {
        namespace: {
          svg: svg.namespaceURI,
          primary: primary.namespaceURI,
          spread: spread.namespaceURI,
          namespacedSpread: namespacedSpread.namespaceURI,
          dynamic: dynamic.map((node) => node.namespaceURI),
          foreignObject: foreignObject.namespaceURI,
          htmlChild: htmlChild.namespaceURI,
        },
        identity: {
          host: host === before.host,
          svg: svg === before.svg,
          primary: primary === before.primary,
          spread: spread === before.spread,
          namespacedSpread: namespacedSpread === before.namespacedSpread,
          dynamic: dynamic.every((node, index) => node === before.dynamic[index]),
          foreignObject: foreignObject === before.foreignObject,
          htmlChild: htmlChild === before.htmlChild,
        },
        attributes: {
          viewBox: svg.getAttribute("viewBox"),
          strokeWidth: svg.getAttribute("stroke-width"),
          strokeLinecap: svg.getAttribute("stroke-linecap"),
          strokeLinejoin: svg.getAttribute("stroke-linejoin"),
          ariaHidden: svg.getAttribute("aria-hidden"),
          d: primary.getAttribute("d"),
          spreadCx: spread.getAttribute("cx"),
          xlinkHref: namespacedSpread.getAttributeNS(
            "http://www.w3.org/1999/xlink",
            "href",
          ),
          xmlLang: namespacedSpread.getAttributeNS(
            "http://www.w3.org/XML/1998/namespace",
            "lang",
          ),
          dynamicD: dynamic.map((node) => node.getAttribute("d")),
        },
      };
    });

    expect(result.namespace).toEqual({
      svg: SVG_NS,
      primary: SVG_NS,
      spread: SVG_NS,
      namespacedSpread: SVG_NS,
      dynamic: [SVG_NS, SVG_NS],
      foreignObject: SVG_NS,
      htmlChild: HTML_NS,
    });
    expect(result.identity).toEqual({
      host: true,
      svg: true,
      primary: true,
      spread: true,
      namespacedSpread: true,
      dynamic: true,
      foreignObject: true,
      htmlChild: true,
    });
    expect(result.attributes).toEqual({
      viewBox: "0 0 24 24",
      strokeWidth: "2",
      strokeLinecap: "round",
      strokeLinejoin: "round",
      ariaHidden: "true",
      d: "M20 6 9 17l-5-5",
      spreadCx: "12",
      xlinkHref: "#shape",
      xmlLang: "en",
      dynamicD: ["M2 12h20", "M12 2v20"],
    });
    expect(pageErrors).toEqual([]);
    expect(consoleWarnings).toEqual([]);
  });

  test("updates SVG attributes and mapped shapes after hydration", async ({ page }) => {
    await page.goto(baseUrl);
    await waitForHydration(page);

    const result = await page.evaluate(async () => {
      const host = document.querySelector("svg-host");
      const svgBefore = host.shadowRoot.querySelector("[data-icon]");
      const pathBefore = host.shadowRoot.querySelector("[data-primary]");
      host.viewBox = "0 0 32 32";
      host.strokeWidth = 4;
      host.pathD = "M1 1h30";
      host.hiddenFromA11y = false;
      host.shapes = [{ id: "next", d: "M4 4h24" }];
      await host.updateComplete;
      const svg = host.shadowRoot.querySelector("[data-icon]");
      const path = host.shadowRoot.querySelector("[data-primary]");
      const dynamic = [...host.shadowRoot.querySelectorAll("[data-dynamic]")];
      return {
        sameSvg: svg === svgBefore,
        samePath: path === pathBefore,
        viewBox: svg.getAttribute("viewBox"),
        strokeWidth: svg.getAttribute("stroke-width"),
        ariaHidden: svg.getAttribute("aria-hidden"),
        d: path.getAttribute("d"),
        dynamic: dynamic.map((node) => ({
          namespace: node.namespaceURI,
          id: node.getAttribute("data-dynamic"),
          d: node.getAttribute("d"),
        })),
      };
    });

    expect(result).toEqual({
      sameSvg: true,
      samePath: true,
      viewBox: "0 0 32 32",
      strokeWidth: "4",
      ariaHidden: "false",
      d: "M1 1h30",
      dynamic: [{ namespace: SVG_NS, id: "next", d: "M4 4h24" }],
    });
  });
});
