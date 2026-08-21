import assert from "node:assert";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, it } from "vitest";
import { html, LitElement } from "lit";
import {
  createEntry,
  renderBootstrap,
  renderDocument,
  renderToString,
} from "../packages/ssr/src/index.js";
import { LITSX_MODULE_ID } from "../packages/core/src/elements/index.js";

describe("@litsx/ssr public configuration branches", () => {
  it("renders each supported bootstrap form and omits incomplete configurations", () => {
    assert.strictEqual(renderBootstrap(), "");
    assert.strictEqual(
      renderBootstrap({ bootstrap: "/assets/main.js" }),
      '<script type="module" src="/assets/main.js"></script>',
    );
    assert.strictEqual(
      renderBootstrap({
        bootstrap: {
          type: "text/javascript",
          attributes: { nonce: "safe&sound", defer: true, ignored: false },
          src: "/assets/app?<script>",
        },
      }),
      '<script type="text/javascript" nonce="safe&amp;sound" defer src="/assets/app?&lt;script&gt;"></script>',
    );
    assert.strictEqual(
      renderBootstrap({
        bootstrap: { attributes: { nonce: "abc" }, content: "window.ready = true;" },
      }),
      '<script type="module" nonce="abc">window.ready = true;</script>',
    );
    assert.strictEqual(renderBootstrap({ bootstrap: {} }), "");
  });

  it("validates suspense pass limits before rendering", async () => {
    await assert.rejects(
      () => renderToString(html`<main>never rendered</main>`, { maxSuspensePasses: 0 }),
      /maxSuspensePasses must be a positive finite number/,
    );
    await assert.rejects(
      () => renderToString(html`<main>never rendered</main>`, { maxSuspensePasses: Infinity }),
      /maxSuspensePasses must be a positive finite number/,
    );
  });

  it("resolves authored element classes and lazy element factories", async () => {
    class DirectElement extends LitElement {
      static [LITSX_MODULE_ID] = "/src/DirectElement.litsx";

      render() {
        return html`<p>direct</p>`;
      }
    }

    class LazyElement extends LitElement {
      static [LITSX_MODULE_ID] = "/src/LazyElement.litsx";

      render() {
        return html`<p>lazy</p>`;
      }
    }

    const result = await renderDocument(createEntry({
      elements: {
        "direct-element": DirectElement,
        "lazy-element": async () => LazyElement,
      },
      title: "Authored branches",
      bootstrap: null,
      render({ html: template, clientEntry, root }) {
        assert.strictEqual(clientEntry, null);
        assert.strictEqual(typeof root, "string");
        return template`<direct-element></direct-element><lazy-element></lazy-element>`;
      },
    }));

    assert.match(result.document, /<p>direct<\/p>/);
    assert.match(result.document, /<p>lazy<\/p>/);
    assert.doesNotMatch(result.document, /hydratePage/);
  });

  it("renders authored file templates with marker replacement and fallback injection", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "litsx-ssr-template-"));
    const markedTemplate = path.join(root, "marked.html");
    const fallbackTemplate = path.join(root, "fallback.html");
    await fs.writeFile(
      markedTemplate,
      "<html><head><title><!--app-title--></title><!--app-head--></head><body><!--app-html--><!--app-bootstrap--></body></html>",
    );
    await fs.writeFile(
      fallbackTemplate,
      "<html><head></head><body><!--app-html--></body></html>",
    );

    try {
      const marked = await renderDocument(createEntry({
        root,
        template: "marked.html",
        title: "<Authored>",
        head: "<meta name=\"source\" content=\"test\">",
        bootstrap: "/assets/boot.js",
        render({ html: template }) {
          return template`<main>marked</main>`;
        },
      }));
      assert.match(marked.document, /<title>&lt;Authored&gt;<\/title>/);
      assert.match(marked.document, /<main>marked<\/main>/);
      assert.match(marked.document, /<script type="module" src="\/assets\/boot\.js"><\/script>/);

      const fallback = await renderDocument(createEntry({
        root,
        template: "fallback.html",
        head: "<meta name=\"source\" content=\"fallback\">",
        bootstrap: { content: "window.booted = true;" },
        render({ html: template }) {
          return template`<main>fallback</main>`;
        },
      }));
      assert.match(fallback.document, /<meta name="source" content="fallback">\n<\/head>/);
      assert.match(fallback.document, /<script type="module">window\.booted = true;<\/script>\n<\/body>/);
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });

  it("validates authored entries and handles minimal development templates", async () => {
    await assert.rejects(
      () => renderDocument(createEntry({})),
      /requires a render\(\.\.\.\) callback/,
    );

    const root = await fs.mkdtemp(path.join(os.tmpdir(), "litsx-ssr-minimal-template-"));
    await fs.writeFile(path.join(root, "minimal.html"), "before<!--app-html-->after");
    await fs.writeFile(path.join(root, "invalid.html"), "<main>missing marker</main>");

    try {
      const result = await renderDocument(createEntry({
        root,
        template: "minimal.html",
        head: "<meta name=\"ignored\">",
        bootstrap: "/assets/ignored.js",
        render({ html: template }) {
          return template`<main>minimal</main>`;
        },
      }));
      assert.match(result.document, /^before[\s\S]*<main>minimal<\/main>[\s\S]*after$/);

      await assert.rejects(
        () => renderDocument(createEntry({
          root,
          template: "invalid.html",
          render({ html: template }) {
            return template`<main>invalid</main>`;
          },
        })),
        /HTML templates must contain <!--app-html-->/,
      );
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });

  it("supports authored element loaders and client-entry resolver fallbacks", async () => {
    let receivedLoader = null;
    const result = await renderToString(createEntry({
      clientEntry: "client-entry.js",
      assetResolver() {
        return null;
      },
      elements(importModule) {
        receivedLoader = importModule;
        return {};
      },
      render({ html: template, clientEntry }) {
        assert.match(clientEntry, /client-entry\.js$/);
        return template`<main>loader</main>`;
      },
    }));

    assert.strictEqual(typeof receivedLoader, "function");
    assert.match(result.html, /<main>loader<\/main>/);
  });

  it("uses authored template callbacks and Vite-backed element loaders", async () => {
    class ViteElement extends LitElement {
      static [LITSX_MODULE_ID] = "/component.litsx";

      render() {
        return html`<p>vite element</p>`;
      }
    }

    const loadedIds = [];
    const result = await renderDocument(createEntry({
      root: process.cwd(),
      viteServer: {
        async ssrLoadModule(moduleId) {
          loadedIds.push(moduleId);
          return ViteElement;
        },
      },
      elements(load) {
        return { "vite-element": () => load("component.litsx") };
      },
      template(context) {
        return `<article data-title="${context.title}">${context.html}</article>`;
      },
      title: "callback template",
      render({ html: template }) {
        return template`<vite-element></vite-element>`;
      },
    }));

    assert.deepStrictEqual(loadedIds, ["/component.litsx"]);
    assert.match(result.document, /<article data-title="callback template">/);
    assert.match(result.document, /<p>vite element<\/p>/);
  });

  it("renders promised and list-based top-level values without document metadata", async () => {
    const promised = await renderToString(Promise.resolve(html`<main>promised</main>`));
    const list = await renderToString([
      html`<span>first</span>`,
      Promise.resolve(html`<span>second</span>`),
    ]);
    const document = await renderDocument(html`<main>plain document</main>`, {
      title: null,
      head: null,
      htmlAttributes: null,
      bodyAttributes: null,
      template(context) {
        return context.defaultDocument;
      },
    });

    assert.match(promised.html, /<main>promised<\/main>/);
    assert.match(list.html, /<span>first<\/span>[\s\S]*<span>second<\/span>/);
    assert.match(document.document, /<title><\/title>/);
  });

  it("handles empty registries, default asset resolution, and empty template injections", async () => {
    class BareModuleElement extends LitElement {
      static [LITSX_MODULE_ID] = "@demo/element";

      render() {
        return html`<p>bare module</p>`;
      }
    }

    const emptyRegistry = await renderToString(html`<main>empty registry</main>`, {
      elements: {},
    });
    const bareModule = await renderToString(html`<bare-module></bare-module>`, {
      elements: { "bare-module": BareModuleElement },
    });
    const authored = await renderToString(createEntry({
      clientEntry: "./client.js",
      elements: { ignored: null },
      render({ html: template, clientEntry }) {
        assert.match(clientEntry, /client\.js$/);
        return template`<main>authored defaults</main>`;
      },
    }));

    const root = await fs.mkdtemp(path.join(os.tmpdir(), "litsx-ssr-empty-template-"));
    await fs.writeFile(root + "/empty.html", "<html><head></head><body><!--app-html--></body></html>");
    try {
      const document = await renderDocument(createEntry({
        root,
        template: "empty.html",
        render({ html: template }) {
          return template`<main>empty injections</main>`;
        },
      }));
      assert.match(document.document, /<main>empty injections<\/main>/);
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }

    assert.match(emptyRegistry.html, /empty registry/);
    assert.deepStrictEqual(bareModule.clientImports, ["@demo/element"]);
    assert.match(authored.html, /authored defaults/);
    assert.strictEqual(
      renderBootstrap({ bootstrap: { attributes: "invalid" } }),
      "",
    );
  });

});
