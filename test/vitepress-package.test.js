import assert from "assert";
import fs from "fs";
import path from "path";
import { createHighlighter } from "shiki";
import { describe, it, vi } from "vitest";
import {
  litsxVitePress,
  litsxVitePressMarkdown,
} from "../packages/vitepress/src/index.js";
import {
  buildVersionPath,
  defineDocsVersions,
  getPathWithinVersion,
} from "../packages/vitepress/src/shared.js";

let routePath = "/";
const mockDefaultTheme = {
  Layout() {
    return "default-layout";
  },
  enhanceApp() {},
};

vi.mock("vitepress/theme-without-fonts", () => ({
  default: mockDefaultTheme,
}));

vi.mock("vitepress", async () => {
  const actual = await vi.importActual("vitepress");

  return {
    ...actual,
    useRoute() {
      return { path: routePath };
    },
    withBase(pathname) {
      return `/base${pathname}`;
    },
  };
});

describe("@litsx/vitepress", () => {
  it("exposes public theme-related subpath exports", () => {
    const packageJson = JSON.parse(
      fs.readFileSync(path.join(process.cwd(), "packages/vitepress/package.json"), "utf8")
    );

    assert.equal(packageJson.exports["./theme"].default, "./src/theme/index.js");
    assert.equal(
      packageJson.exports["./theme/DocsVersionBanner"].default,
      "./src/theme/DocsVersionBanner.js"
    );
    assert.equal(
      packageJson.exports["./theme/DocsVersionSelect"].default,
      "./src/theme/DocsVersionSelect.js"
    );
    assert.equal(packageJson.exports["./versions"].default, "./src/versions.js");
    assert.equal(packageJson.exports["./styles.css"], "./src/styles.css");
  });

  it("keeps theme/version ui under the theme entrypoint", () => {
    const packageJson = JSON.parse(
      fs.readFileSync(path.join(process.cwd(), "packages/vitepress/package.json"), "utf8")
    );

    assert.ok(!packageJson.exports["."].default.includes("/theme/"));
    assert.equal(packageJson.exports["./theme"].default, "./src/theme/index.js");
  });

  it("keeps the default docs versions in the package", async () => {
    const versions = await import("../packages/vitepress/src/versions.js");

    assert.deepStrictEqual(
      versions.defaultDocsVersions,
      defineDocsVersions([
        {
          id: "next",
          label: "Next",
          prefix: "/",
          snapshot: false,
          published: false,
          current: false,
        },
      ])
    );
  });

  it("computes version-aware paths", () => {
    const versions = [
      { id: "next", label: "Next", prefix: "/" },
      { id: "v1", label: "v1", prefix: "/v1/" },
    ];

    assert.equal(getPathWithinVersion("/v1/guides/intro", versions[1]), "guides/intro");
    assert.equal(buildVersionPath("guides/intro", versions[0], (value) => `/base${value}`), "/base/guides/intro");
    assert.equal(buildVersionPath("guides/intro", versions[1], (value) => `/base${value}`), "/base/v1/guides/intro");
  });

  it("provides the VitePress plugin stack for docs components", async () => {
    const [workerFormatPlugin, resolverPlugin, transformPlugin] = litsxVitePress({
      workspaceRoot: "/repo",
    });
    const id = "/repo/website/docs/.vitepress/theme/components/counter.jsx";

    assert.equal(workerFormatPlugin.name, "litsx-docs-worker-format");
    assert.deepStrictEqual(workerFormatPlugin.config(), {
      worker: {
        format: "es",
      },
    });
    assert.equal(resolverPlugin.name, "litsx-docs-lit-prod-client-only");
    assert.equal(
      resolverPlugin.resolveId("lit", null, { ssr: false }),
      "/repo/node_modules/lit/index.js"
    );
    assert.equal(
      resolverPlugin.resolveId("lit-html", null, { ssr: false }),
      "/repo/node_modules/lit-html/lit-html.js"
    );
    assert.equal(
      resolverPlugin.resolveId("lit-html/is-server.js", null, { ssr: false }),
      "/repo/node_modules/lit-html/is-server.js"
    );
    assert.equal(
      resolverPlugin.resolveId("lit-element/lit-element.js", null, { ssr: false }),
      "/repo/node_modules/lit-element/lit-element.js"
    );
    assert.equal(
      resolverPlugin.resolveId("@lit/reactive-element", null, { ssr: false }),
      "/repo/node_modules/@lit/reactive-element/reactive-element.js"
    );
    assert.equal(resolverPlugin.resolveId("lit", null, { ssr: true }), null);
    assert.equal(transformPlugin.name, "litsx-docs-compiler");

    const source = "export const Counter = () => <button @click={save}>Hi</button>;";
    const transformed = await transformPlugin.transform(
      source,
      id
    );
    const ignored = await transformPlugin.transform(
      "export const value = 1;",
      "/repo/website/docs/guides/counter.jsx"
    );

    assert.ok(transformed);
    assert.match(transformed.code, /html`/);
    assert.ok(transformed.map);
    assert.equal(ignored, null);
  }, 20000);

  it("also transforms docs theme TSX components through the LitSX compiler path", async () => {
    const [, , transformPlugin] = litsxVitePress({
      workspaceRoot: "/repo",
    });

    const transformed = await transformPlugin.transform(
      "export function Counter() { return <button>Save</button>; }",
      "/repo/website/docs/.vitepress/theme/components/counter.tsx"
    );

    assert.ok(transformed);
    assert.match(transformed.code, /html`<button>Save<\/button>`/);
  }, 20000);

  it("supports regexp and function-based include filters for the docs compiler plugin", async () => {
    const source = "export const Counter = () => <button>Save</button>;";

    const [, , regexTransformPlugin] = litsxVitePress({
      workspaceRoot: "/repo",
      include: /Counter\.demo\.tsx$/,
    });
    const [, , functionTransformPlugin] = litsxVitePress({
      workspaceRoot: "/repo",
      include(id) {
        return id.endsWith("/allowed.jsx");
      },
    });

    const regexIncluded = await regexTransformPlugin.transform(
      source,
      "/repo/examples/Counter.demo.tsx"
    );
    const regexExcluded = await regexTransformPlugin.transform(
      source,
      "/repo/examples/Counter.tsx"
    );
    const functionIncluded = await functionTransformPlugin.transform(
      source,
      "/repo/website/docs/.vitepress/theme/components/allowed.jsx"
    );
    const functionExcluded = await functionTransformPlugin.transform(
      source,
      "/repo/website/docs/.vitepress/theme/components/blocked.jsx"
    );

    assert.ok(regexIncluded);
    assert.match(regexIncluded.code, /html`/);
    assert.equal(regexExcluded, null);
    assert.ok(functionIncluded);
    assert.equal(functionExcluded, null);
  }, 20000);

  it("provides LitSX-aware markdown languages through the package", () => {
    const markdown = litsxVitePressMarkdown();

    assert.ok(Array.isArray(markdown.languages));
    assert.deepStrictEqual(
      markdown.languages.map((language) => language.name),
      ["tsx", "jsx"]
    );
    assert.match(JSON.stringify(markdown.languages), /litsx-jsx-attributes/);
    assert.match(JSON.stringify(markdown.languages), /litsx-hoists/);
  });

  it("loads LitSX-aware tsx highlighting without requiring external Shiki languages", async () => {
    const markdown = litsxVitePressMarkdown();
    const highlighter = await createHighlighter({
      themes: ["github-dark"],
      langs: markdown.languages,
    });

    try {
      const html = highlighter.codeToHtml(
        [
          "export function Card() {",
          "  ^styles(`:host { display: block; }`);",
          "  return <button .value={count} ?disabled={busy} @click={save}>Save</button>;",
          "}",
        ].join("\\n"),
        { lang: "tsx", theme: "github-dark" }
      );

      assert.match(html, /vp-code|shiki/);
      assert.match(html, /@(?:<\/span><span[^>]*>)?click/);
      assert.match(html, /\.(?:<\/span><span[^>]*>)?value/);
      assert.match(html, /\?(?:<\/span><span[^>]*>)?disabled/);
      assert.match(html, /\^(?:<\/span><span[^>]*>)?styles/);
    } finally {
      highlighter.dispose();
    }
  });

  it("tokenizes CSS inside ^styles template hoists", async () => {
    const markdown = litsxVitePressMarkdown();
    const highlighter = await createHighlighter({
      themes: ["github-dark"],
      langs: markdown.languages,
    });

    try {
      const html = highlighter.codeToHtml(
        [
          "^styles(`",
          "  :host {",
          "    display: block;",
          "    color: red;",
          "  }",
          "`);",
        ].join("\n"),
        { lang: "tsx", theme: "github-dark" }
      );

      assert.match(html, /display/);
      assert.match(html, /color/);
      assert.match(html, /block/);
      assert.match(html, /red/);
      assert.doesNotMatch(html, /\^styles\(\)/);
    } finally {
      highlighter.dispose();
    }
  });

  it("keeps JSX tag parsing intact for LitSX boolean attrs", async () => {
    const markdown = litsxVitePressMarkdown();
    const highlighter = await createHighlighter({
      themes: ["github-dark"],
      langs: markdown.languages,
    });

    try {
      const tokens = highlighter.codeToTokens(
        "<button ?disabled={count > 3} />",
        { lang: "tsx", theme: "github-dark" }
      );

      const tagNameToken = tokens.tokens[0].find((token) => token.content === "button");
      const attrNameToken = tokens.tokens[0].find((token) => token.content === "disabled");
      const operatorToken = tokens.tokens[0].find((token) => token.content === "?");

      assert.ok(tagNameToken);
      assert.ok(attrNameToken);
      assert.ok(operatorToken);
      assert.notStrictEqual(tagNameToken.color, "#E1E4E8");
      assert.notStrictEqual(attrNameToken.color, "#E1E4E8");
    } finally {
      highlighter.dispose();
    }
  });

  it("renders the version selector with the active version and navigates to the matching page", async () => {
    routePath = "/v1/guides/intro";
    const { default: DocsVersionSelect } = await import("../packages/vitepress/src/theme/DocsVersionSelect.js");
    const versions = [
      { id: "next", label: "Next", prefix: "/" },
      { id: "v1", label: "v1", prefix: "/v1/" },
    ];
    const render = DocsVersionSelect.setup({ versions });
    const originalWindow = globalThis.window;
    globalThis.window = { location: { href: "" } };

    try {
      const vnode = render();
      const selectNode = vnode.children[0];

      assert.equal(selectNode.type, "select");
      assert.equal(selectNode.props.value, "v1");
      selectNode.props.onChange({ target: { value: "next" } });
      assert.equal(globalThis.window.location.href, "/base/guides/intro");
    } finally {
      globalThis.window = originalWindow;
    }
  }, 30000);

  it("shows the older-version banner only for non-current docs routes", async () => {
    const { default: DocsVersionBanner } = await import("../packages/vitepress/src/theme/DocsVersionBanner.js");
    const versions = [
      { id: "next", label: "Next", prefix: "/" },
      { id: "v1", label: "v1", prefix: "/v1/" },
    ];

    routePath = "/guides/intro";
    const currentRender = DocsVersionBanner.setup({ versions });
    assert.equal(currentRender(), null);

    routePath = "/v1/guides/intro";
    const oldRender = DocsVersionBanner.setup({ versions });
    const vnode = oldRender();
    const inner = vnode.children[0];
    const link = inner.children[1];

    assert.equal(link.type, "a");
    assert.equal(link.props.href, "/base/guides/intro");
  }, 30000);

  it("creates the VitePress theme wrapper with the version components wired into the layout", () => {
    const versions = [
      { id: "next", label: "Next", prefix: "/" },
      { id: "v1", label: "v1", prefix: "/v1/" },
    ];
    const originalEnhanceApp = mockDefaultTheme.enhanceApp;
    const enhanceSpy = vi.fn();
    mockDefaultTheme.enhanceApp = enhanceSpy;

    return import("../packages/vitepress/src/theme/index.js").then(({ createLitsxVitePressTheme }) => {
      const theme = createLitsxVitePressTheme({ versions });
      const vnode = theme.Layout();
      const navSlot = vnode.children["nav-bar-content-after"]();
      const topSlot = vnode.children["page-top"]();

      assert.equal(vnode.type, mockDefaultTheme.Layout);
      assert.equal(navSlot.type.name, "DocsVersionSelect");
      assert.deepStrictEqual(navSlot.props.versions, versions);
      assert.equal(topSlot.type.name, "DocsVersionBanner");
      assert.deepStrictEqual(topSlot.props.versions, versions);

      theme.enhanceApp({ app: {} });
      assert.equal(enhanceSpy.mock.calls.length, 1);
      mockDefaultTheme.enhanceApp = originalEnhanceApp;
    }).catch((error) => {
      mockDefaultTheme.enhanceApp = originalEnhanceApp;
      throw error;
    });
  });
});
