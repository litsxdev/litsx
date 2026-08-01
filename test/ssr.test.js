import assert from "assert";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, it } from "vitest";
import { LitElement, html } from "lit";
import { renderLight } from "@lit-labs/ssr-client/directives/render-light.js";
import {
  annotateHydratableCustomElement,
  __litsxServerComponentCall,
  LITSX_MODULE_ID,
  __litsxScopedTemplate,
} from "../packages/core/src/elements/index.js";
import {
  createDocumentContext,
  createEntry,
  createSsrDevServer,
  LitsxSsrMaxSuspensePassesError,
  renderDocument,
  renderBootstrap,
  renderToStream,
  renderToString,
} from "../packages/ssr/src/index.js";
import { css } from "lit";
import { prepareEffects, useMemoValue } from "../packages/core/src/effect-hooks.js";
import { useId, useRef, useState, useExternalStore } from "../packages/core/src/state-hooks.js";
import {
  bindRendererContext,
  renderRendererCall,
} from "../packages/core/src/rendering.js";
import {
  LitsxContextProviderElement,
  createContext,
  useContext,
} from "../packages/core/src/context.js";
import {
  ErrorBoundary,
  createExecutionContextKey,
  getCurrentExecutionContext,
  renderWithSoftSuspense,
  SuspenseBoundary,
  SuspenseList,
  __litsxNoscript,
  useSsrResourceSnapshot,
} from "../packages/core/src/index.js";

function createDeferred() {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

describe("@litsx/ssr", () => {
  it("renders dynamic LitSX noscript fallbacks without hydration markers", async () => {
    const title = `<fallback & title>`;
    const url = `/?q=<unsafe>&x="quoted"`;
    const items = [
      { href: url, label: "First & <one>" },
      { href: "/second", label: "Second" },
    ];
    const result = await renderToString(html`
      <main>
        <noscript data-litsx-noscript=${__litsxNoscript(() => html`
          <section data-title=${title}>
            <h2>${title}</h2>
            ${items.map((item) => html`<a href=${item.href}>${item.label}</a>`)}
            ${items.length > 1 ? html`<p>More than one</p>` : null}
          </section>
        `)}></noscript>
      </main>
    `);

    assert.match(result.html, /<noscript>\s*<section data-title="&lt;fallback &amp; title&gt;">/);
    assert.match(result.html, /<h2>&lt;fallback &amp; title&gt;<\/h2>/);
    assert.match(result.html, /href="\/\?q=&lt;unsafe&gt;&amp;x=&quot;quoted&quot;"/);
    assert.match(result.html, /First &amp; &lt;one&gt;/);
    assert.match(result.html, /<p>More than one<\/p>/);
    assert.doesNotMatch(result.html, /data-litsx-noscript/);
    const noscriptContents = result.html.match(/<noscript>([\s\S]*?)<\/noscript>/)?.[1] ?? "";
    assert.doesNotMatch(noscriptContents, /lit-part|lit-node|data-litsx-root/);
  });

  it("renders dynamic noscript fallbacks through the streaming SSR API", async () => {
    const streamed = await renderToStream(html`<noscript data-litsx-noscript=${__litsxNoscript(() => html`<p>${"streamed"}</p>`)}></noscript>`);
    const reader = streamed.stream.getReader();
    let htmlOutput = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      htmlOutput += value;
    }

    assert.match(htmlOutput, /<noscript><p>streamed<\/p><\/noscript>/);
    const noscriptContents = htmlOutput.match(/<noscript>([\s\S]*?)<\/noscript>/)?.[1] ?? "";
    assert.doesNotMatch(noscriptContents, /lit-part/);
  });

  it("renders LitSX elements in noscript fallback content through an SSR-only scoped registry", async () => {
    class NoscriptCard extends LitElement {
      static [LITSX_MODULE_ID] = "/src/NoscriptCard.litsx";

      render() {
        return html`<section id="noscript-card">SSR card</section>`;
      }
    }

    const result = await renderToString(html`<noscript data-litsx-noscript=${__litsxNoscript(
      () => html`<noscript-card></noscript-card>`,
      { "noscript-card": NoscriptCard },
    )}></noscript>`);

    assert.match(result.html, /<noscript><noscript-card><template shadowroot="open" shadowrootmode="open"><section id="noscript-card">SSR card<\/section><\/template><\/noscript-card><\/noscript>/);
    assert.doesNotMatch(result.html, /data-litsx-root|\/src\/NoscriptCard\.litsx/);
    assert.deepStrictEqual(result.clientImports, []);
  });

  it("surfaces SSR console output and render errors in the dev-server response", async () => {
    let shouldFail = false;
    const server = await createSsrDevServer({
      root: process.cwd(),
      host: "127.0.0.1",
      port: 0,
      logLevel: "silent",
      render({ html }) {
        if (shouldFail) {
          console.warn("SSR diagnostic before failure");
          throw new Error("SSR render exploded");
        }

        console.log("SSR diagnostic value", { id: 42 });
        return html`<main>ready</main>`;
      },
    });
    await server.listen();

    try {
      const url = server.resolvedUrls.local[0];
      const success = await fetch(url);
      const successDocument = await success.text();
      assert.strictEqual(success.status, 200);
      assert.match(successDocument, /\[LitSX SSR\]/);
      assert.match(successDocument, /SSR diagnostic value/);

      shouldFail = true;
      const failure = await fetch(url);
      const failureDocument = await failure.text();
      assert.strictEqual(failure.status, 500);
      assert.match(failureDocument, /LitSX SSR error/);
      assert.match(failureDocument, /SSR render exploded/);
      assert.match(failureDocument, /SSR diagnostic before failure/);
    } finally {
      await server.close();
    }
  });

  it("renders scoped LitSX elements with nested declarative shadow DOM", async () => {
    class ProductImage extends LitElement {
      static [LITSX_MODULE_ID] = "/src/ProductImage.litsx";

      render() {
        prepareEffects(this);
        const ref = useRef(this, this.alt);
        const imageId = useId(this);
        return html`<img data-image-id=${imageId} alt=${ref.current} src=${this.src}>`;
      }
    }

    class ProductCard extends LitElement {
      static [LITSX_MODULE_ID] = "/src/ProductCard.litsx";
      static styles = css`
        :host {
          display: block;
        }

        h2 {
          color: red;
        }
      `;
      static elements = {
        "product-image": ProductImage,
      };

      render() {
        prepareEffects(this);
        const [count] = useState(this, 1);
        const productId = useId(this);
        const label = useMemoValue(this, () => `${this.product.name}:${count}`, [count, this.product.name]);
        const snapshot = useExternalStore(
          this,
          () => () => {},
          () => "client",
          () => "server",
        );

        return html`
          <section data-product-id=${productId} data-snapshot=${snapshot}>
            <h2>${label}</h2>
            <product-image
              .alt=${this.product.name}
              .src=${this.product.image}
            ></product-image>
          </section>
        `;
      }
    }

    const result = await renderToString(
      html`<product-card .product=${{
        name: "Trail Shoe",
        image: "/shoe.png",
      }}></product-card>`,
      {
        elements: {
          "product-card": ProductCard,
        },
        assetResolver(moduleId) {
          return `/assets/${moduleId.split("/").at(-1)}.js`;
        },
      },
    );

    assert.match(result.html, /<product-card\b/);
    assert.match(result.html, /<product-card\b[^>]*data-litsx-root="litsx-root-0"/);
    assert.match(result.html, /<template shadowroot="open" shadowrootmode="open">/);
    assert.match(result.html, /<style>[\s\S]*:host\s*\{[\s\S]*display:\s*block;[\s\S]*h2\s*\{[\s\S]*color:\s*red;[\s\S]*<\/style>/);
    assert.match(result.html, /data-product-id="litsx-0-0"/);
    assert.match(result.html, /data-snapshot="server"/);
    assert.match(result.html, /Trail Shoe:1/);
    assert.match(result.html, /data-image-id="litsx-1-0"/);
    assert.match(result.html, /src="\/shoe\.png"/);
    assert.deepStrictEqual(result.clientImports, [
      "/assets/ProductCard.litsx.js",
      "/assets/ProductImage.litsx.js",
    ]);
    assert.strictEqual(
      result.renderClientImports(),
      '<script type="module" src="/assets/ProductCard.litsx.js"></script><script type="module" src="/assets/ProductImage.litsx.js"></script>',
    );
    assert.strictEqual(
      result.renderModulePreloads(),
      '<link rel="modulepreload" href="/assets/ProductCard.litsx.js"><link rel="modulepreload" href="/assets/ProductImage.litsx.js">',
    );
    assert.deepStrictEqual(result.hydrationData, {
      version: 1,
      roots: [
        {
          id: "litsx-root-0",
          tagName: "product-card",
          moduleId: "/src/ProductCard.litsx",
        },
      ],
    });
    assert.deepStrictEqual(result.hydrationData.clientImports, [
      "/assets/ProductCard.litsx.js",
      "/assets/ProductImage.litsx.js",
    ]);
    assert.deepStrictEqual(result.hydrationData.payload, {
      roots: {
        "litsx-root-0": {
          props: {
            product: {
              name: "Trail Shoe",
              image: "/shoe.png",
            },
          },
        },
      },
      instances: {
        "litsx-root-0:0": {
          rootId: "litsx-root-0",
          instanceId: "0",
          state: [1],
        },
      },
    });
    assert.strictEqual(
      result.renderClientImportsData(),
      '<script type="application/json" id="__LITSX_CLIENT_IMPORTS__">["/assets/ProductCard.litsx.js","/assets/ProductImage.litsx.js"]</script>',
    );
    assert.strictEqual(
      result.renderHydrationData(),
      '<script type="application/json" id="__LITSX_HYDRATION__">{"version":1,"roots":[{"id":"litsx-root-0","tagName":"product-card","moduleId":"/src/ProductCard.litsx"}],"payload":{"roots":{"litsx-root-0":{"props":{"product":{"name":"Trail Shoe","image":"/shoe.png"}}}},"instances":{"litsx-root-0:0":{"rootId":"litsx-root-0","instanceId":"0","state":[1]}}},"clientImports":["/assets/ProductCard.litsx.js","/assets/ProductImage.litsx.js"]}</script>',
    );
  });

  it("preserves host string attributes as render props inside hydratable shadow DOM", async () => {
    class NavLink extends LitElement {
      static [LITSX_MODULE_ID] = "/src/NavLink.litsx";
      static properties = {
        href: { type: String },
        label: { type: String },
      };

      render() {
        const { href, label } = this;
        return html`<a href=${href}>${label}</a>`;
      }
    }

    class RouteCard extends LitElement {
      static [LITSX_MODULE_ID] = "/src/RouteCard.litsx";
      static properties = {
        title: { type: String },
        body: { type: String },
        href: { type: String },
        cache: { type: String },
      };

      render() {
        const { title, body, href, cache } = this;
        return html`
          <article class="card">
            <div class="header">
              <h2 class="title">${title}</h2>
              <span class="cache">${cache}</span>
            </div>
            <p class="body">${body}</p>
            <a href=${href} class="link">Open route</a>
          </article>
        `;
      }
    }

    const result = await renderToString(
      __litsxScopedTemplate(
        html`
          <nav-link
            slot="nav"
            href="/blog/hello-world"
            label="Dynamic Blog"
          ></nav-link>
          <route-card
            title="Dynamic Route"
            body="/blog/[slug] renders params directly from the request pathname."
            href="/blog/hello-world"
            cache="dynamic"
          ></route-card>
        `,
        {
          "nav-link": NavLink,
          "route-card": RouteCard,
        },
      ),
    );

    assert.match(result.html, /<nav-link[^>]*href="\/blog\/hello-world"[^>]*label="Dynamic Blog"[^>]*>/);
    assert.match(result.html, /<nav-link[\s\S]*<template shadowroot="open" shadowrootmode="open">[\s\S]*<a href="\/blog\/hello-world">[\s\S]*Dynamic Blog[\s\S]*<\/a>[\s\S]*<\/template>/);
    assert.match(result.html, /<route-card[^>]*title="Dynamic Route"[^>]*body="\/blog\/\[slug\] renders params directly from the request pathname\."[^>]*href="\/blog\/hello-world"[^>]*cache="dynamic"[^>]*>/);
    assert.match(result.html, /<h2 class="title">[\s\S]*Dynamic Route[\s\S]*<\/h2>/);
    assert.match(result.html, /<span class="cache">[\s\S]*dynamic[\s\S]*<\/span>/);
    assert.match(result.html, /<p class="body">[\s\S]*\/blog\/\[slug\] renders params directly from the request pathname\.[\s\S]*<\/p>/);
    assert.match(result.html, /<a href="\/blog\/hello-world" class="link">Open route<\/a>/);
  });

  it("streams the same HTML and metadata as renderToString", async () => {
    class ProductCard extends LitElement {
      static [LITSX_MODULE_ID] = "/src/ProductCard.litsx";

      render() {
        prepareEffects(this);
        const [count] = useState(this, 2);
        return html`<article>${this.product.name}:${count}</article>`;
      }
    }

    const value = __litsxScopedTemplate(
      html`<product-card .product=${{ name: "Stream Shoe" }}></product-card>`,
      {
        "product-card": ProductCard,
      },
    );
    const expected = await renderToString(value);
    const streamed = await renderToStream(value);
    const reader = streamed.stream.getReader();
    let htmlOutput = "";

    while (true) {
      const { done, value: chunk } = await reader.read();
      if (done) {
        break;
      }
      htmlOutput += chunk;
    }

    const metadata = await streamed.allReady;
    assert.strictEqual(htmlOutput, expected.html);
    assert.deepStrictEqual(metadata.clientImports, expected.clientImports);
    assert.deepStrictEqual(metadata.hydrationData, expected.hydrationData);
    assert.deepStrictEqual(metadata.hydrationData.payload, expected.hydrationData.payload);
  });

  it("waits for rootless soft suspense before serializing SSR output", async () => {
    const pending = createDeferred();
    const firstPass = createDeferred();
    let ready = false;
    let renderPasses = 0;

    class AsyncCard extends LitElement {
      static [LITSX_MODULE_ID] = "/src/AsyncCard.litsx";

      render() {
        return renderWithSoftSuspense(this, () => {
          prepareEffects(this);
          renderPasses += 1;

          if (!ready) {
            firstPass.resolve();
            throw pending.promise;
          }

          return html`<article data-ready="true">ready:${renderPasses}</article>`;
        });
      }
    }

    const renderPromise = renderToString(
      html`<async-card></async-card>`,
      {
        elements: {
          "async-card": AsyncCard,
        },
      },
    );

    await firstPass.promise;
    ready = true;
    pending.resolve();
    const result = await renderPromise;

    assert.strictEqual(renderPasses, 2);
    assert.match(result.html, /<article data-ready="true">[\s\S]*ready:[\s\S]*2[\s\S]*<\/article>/);
    assert.doesNotMatch(result.html, /ready:1/);
    assert.deepStrictEqual(result.hydrationData.roots, [
      {
        id: "litsx-root-0",
        tagName: "async-card",
        moduleId: "/src/AsyncCard.litsx",
      },
    ]);
  });

  it("waits for rootless soft suspense before streaming SSR output", async () => {
    const pending = createDeferred();
    const firstPass = createDeferred();
    let ready = false;

    class AsyncStreamCard extends LitElement {
      render() {
        return renderWithSoftSuspense(this, () => {
          prepareEffects(this);

          if (!ready) {
            firstPass.resolve();
            throw pending.promise;
          }

          return html`<article>stream-ready</article>`;
        });
      }
    }

    const streamed = await renderToStream(
      html`<async-stream-card></async-stream-card>`,
      {
        elements: {
          "async-stream-card": AsyncStreamCard,
        },
      },
    );
    const reader = streamed.stream.getReader();
    const readPromise = reader.read();

    await firstPass.promise;
    ready = true;
    pending.resolve();

    const firstChunk = await readPromise;
    assert.strictEqual(firstChunk.done, false);
    assert.ok(typeof firstChunk.value === "string");
    assert.doesNotMatch(firstChunk.value, /Loading\.\.\./);
    assert.doesNotMatch(firstChunk.value, /stream-ready-early/);
    let htmlOutput = firstChunk.value;

    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      htmlOutput += value;
    }

    assert.match(htmlOutput, /stream-ready/);
    const metadata = await streamed.allReady;
    assert.deepStrictEqual(metadata.clientImports, []);
    assert.deepStrictEqual(metadata.hydrationData.roots, [
      {
        id: "litsx-root-0",
        tagName: "async-stream-card",
      },
    ]);
    assert.strictEqual(typeof metadata.renderHydrationData, "function");
  });

  it("fails clearly when rootless soft suspense does not converge during SSR", async () => {
    class AlwaysSuspends extends LitElement {
      render() {
        return renderWithSoftSuspense(this, () => {
          throw Promise.resolve();
        });
      }
    }

    await assert.rejects(
      () =>
        renderToString(
          html`<always-suspends></always-suspends>`,
          {
            elements: {
              "always-suspends": AlwaysSuspends,
            },
            maxSuspensePasses: 2,
          },
        ),
      (error) => {
        assert.ok(error instanceof LitsxSsrMaxSuspensePassesError);
        assert.strictEqual(error.code, "LITSX_SSR_MAX_SUSPENSE_PASSES_EXCEEDED");
        assert.strictEqual(error.maxPasses, 2);
        assert.match(error.message, /LitSX SSR exceeded 2 suspense render passes/);
        return true;
      },
    );
  });

  it("renders a full HTML document around the SSR fragment", async () => {
    class ProductCard extends LitElement {
      static [LITSX_MODULE_ID] = "/src/ProductCard.litsx";

      render() {
        prepareEffects(this);
        return html`<article>${this.product.name}</article>`;
      }
    }

    const result = await renderDocument(
      html`<product-card .product=${{ name: "Doc Shoe" }}></product-card>`,
      {
        elements: {
          "product-card": ProductCard,
        },
        title: "SSR Document",
        head: '<meta name="description" content="doc-test">',
        bodyAttributes: {
          class: "ssr-page",
        },
        clientEntry: "/src/main.js",
      },
    );

    assert.match(result.document, /^<!doctype html>/i);
    assert.match(result.document, /<html lang="en">/);
    assert.match(result.document, /<title>SSR Document<\/title>/);
    assert.match(result.document, /<meta name="description" content="doc-test">/);
    assert.match(result.document, /<body class="ssr-page">/);
    assert.match(result.document, /import \{ hydratePage \} from "@litsx\/ssr\/hydration";/);
    assert.match(result.document, /register: \(\) => import\("\/src\/main\.js"\)/);
    assert.doesNotMatch(result.document, /\\u003E/);
    assert.match(result.document, /<script type="application\/json" id="__LITSX_HYDRATION__">/);
    assert.match(result.document, /<link rel="modulepreload" href="\/src\/ProductCard\.litsx">/);
    assert.match(result.document, /<product-card\b[^>]*data-litsx-root="litsx-root-0"/);
    assert.strictEqual(result.html.includes("Doc Shoe"), true);
    assert.strictEqual(result.document.includes(result.html), true);
    assert.strictEqual(result.lang, "en");
    assert.strictEqual(result.title, "SSR Document");
    assert.strictEqual(result.head, '<meta name="description" content="doc-test">');
    assert.deepStrictEqual(result.htmlAttributes, { lang: "en" });
    assert.deepStrictEqual(result.bodyAttributes, { class: "ssr-page" });
    assert.strictEqual(result.modulePreloads, result.renderModulePreloads());
    assert.strictEqual(result.hydrationScript, result.renderHydrationData());
    assert.strictEqual(result.defaultDocument, result.document);
  });

  it("renders non-hydratable documents with escaped metadata and inline bootstrap options", async () => {
    const result = await renderDocument(html`<main>plain</main>`, {
      lang: "es",
      title: "A < B & C",
      head: ["<meta name=\"first\" content=\"1\">", null, "<meta name=\"last\" content=\"2\">"] ,
      htmlAttributes: {
        "data-app": "plain&safe",
        hidden: true,
        ignored: false,
      },
      bodyAttributes: {
        "data-ready": true,
        "data-value": "<value>",
      },
      bootstrap: {
        type: "application/module",
        attributes: {
          nonce: "abc123",
          defer: true,
          ignored: null,
        },
        content: "window.__plain = true;",
      },
    });

    assert.match(result.document, /<html lang="es" data-app="plain&amp;safe" hidden>/);
    assert.match(result.document, /<title>A &lt; B &amp; C<\/title>/);
    assert.match(result.document, /<meta name="first" content="1">[\s\S]*<meta name="last" content="2">/);
    assert.match(result.document, /<body data-ready data-value="&lt;value&gt;">/);
    assert.match(result.document, /<script type="application\/module" nonce="abc123" defer>window\.__plain = true;<\/script>/);
    assert.strictEqual(result.hydrationScript, "");
    assert.strictEqual(result.bootstrap, '<script type="application/module" nonce="abc123" defer>window.__plain = true;</script>');
  });

  it("renders authored document config through renderToString", async () => {
    class ProductCard extends LitElement {
      static [LITSX_MODULE_ID] = "/src/ProductCard.litsx";

      render() {
        prepareEffects(this);
        return html`<article>${this.product.name}</article>`;
      }
    }

    const result = await renderToString(createEntry({
      elements: {
        "product-card": ProductCard,
      },
      render({ html }) {
        return html`<product-card .product=${{ name: "Authored String" }}></product-card>`;
      },
    }));

    assert.match(result.html, /<product-card\b[^>]*data-litsx-root="litsx-root-0"/);
    assert.match(result.html, /Authored String/);
    assert.deepStrictEqual(result.clientImports, ["/src/ProductCard.litsx"]);
  });

  it("renders explicit authored-entry configs through createEntry", async () => {
    class ProductCard extends LitElement {
      static [LITSX_MODULE_ID] = "/src/ProductCard.litsx";

      render() {
        prepareEffects(this);
        return html`<article>${this.product.name}</article>`;
      }
    }

    const result = await renderToString(createEntry({
      elements: {
        "product-card": ProductCard,
      },
      render({ html }) {
        return html`<product-card .product=${{ name: "Explicit Authored" }}></product-card>`;
      },
    }));

    assert.match(result.html, /<product-card\b[^>]*data-litsx-root="litsx-root-0"/);
    assert.match(result.html, /Explicit Authored/);
    assert.deepStrictEqual(result.clientImports, ["/src/ProductCard.litsx"]);
  });

  it("requires createEntry for authored SSR configs", async () => {
    await assert.rejects(
      () =>
        renderToString({
          render({ html }) {
            return html`<main>missing marker</main>`;
          },
        }),
      /renderToString\(\.\.\.\) authored entry objects must be wrapped in createEntry\(\.\.\.\)/,
    );
  });

  it("renders authored document config through renderToStream", async () => {
    class ProductCard extends LitElement {
      static [LITSX_MODULE_ID] = "/src/ProductCard.litsx";

      render() {
        prepareEffects(this);
        return html`<article>${this.product.name}</article>`;
      }
    }

    const streamed = await renderToStream(createEntry({
      elements: {
        "product-card": ProductCard,
      },
      render({ html }) {
        return html`<product-card .product=${{ name: "Authored Stream" }}></product-card>`;
      },
    }));
    const reader = streamed.stream.getReader();
    let htmlOutput = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      htmlOutput += value;
    }

    const metadata = await streamed.allReady;
    assert.match(htmlOutput, /<product-card\b[^>]*data-litsx-root="litsx-root-0"/);
    assert.match(htmlOutput, /Authored Stream/);
    assert.deepStrictEqual(metadata.clientImports, ["/src/ProductCard.litsx"]);
  });

  it("still accepts a raw bootstrap override", async () => {
    const result = await renderDocument(html`<main>ready</main>`, {
      clientEntry: "/src/main.js",
      bootstrap: "/src/raw-bootstrap.js",
    });

    assert.match(result.document, /<script type="module" src="\/src\/raw-bootstrap\.js"><\/script>/);
    assert.doesNotMatch(result.document, /hydratePage/);
    assert.doesNotMatch(result.document, /import\("\/src\/main\.js"\)/);
  });

  it("resolves clientEntry through assetResolver before emitting the hydration bootstrap", async () => {
    const result = await renderDocument(html`<main>ready</main>`, {
      clientEntry: "/src/main.js",
      assetResolver(moduleId) {
        if (moduleId === "/src/main.js") {
          return "/assets/main.abc123.js";
        }

        return moduleId;
      },
    });

    assert.match(result.document, /import \{ hydratePage \} from "@litsx\/ssr\/hydration";/);
    assert.match(result.document, /register: \(\) => import\("\/assets\/main\.abc123\.js"\)/);
    assert.doesNotMatch(result.document, /import\("\/src\/main\.js"\)/);
  });

  it("lets callers provide their own document template", async () => {
    class ProductCard extends LitElement {
      static [LITSX_MODULE_ID] = "/src/ProductCard.litsx";

      render() {
        return html`<article>${this.product.name}</article>`;
      }
    }

    const result = await renderDocument(
      html`<product-card .product=${{ name: "Template Shoe" }}></product-card>`,
      {
        elements: {
          "product-card": ProductCard,
        },
        title: "Custom Shell",
        clientEntry: "/src/main.js",
        template({
          html: fragment,
          title,
          modulePreloads,
          hydrationScript,
          bootstrap,
          htmlAttributesString,
          bodyAttributesString,
        }) {
          return `<!doctype html>
<html${htmlAttributesString}>
  <head>
    <title>${title}</title>
    ${modulePreloads}
  </head>
  <body${bodyAttributesString}>
    <header>Custom shell</header>
    <main data-slot="app">${fragment}</main>
    ${hydrationScript}
    ${bootstrap}
  </body>
</html>`;
        },
      },
    );

    assert.match(result.document, /^<!doctype html>/i);
    assert.match(result.document, /<header>Custom shell<\/header>/);
    assert.match(result.document, /<main data-slot="app">[\s\S]*Template Shoe[\s\S]*<\/main>/);
    assert.match(result.document, /<script type="application\/json" id="__LITSX_HYDRATION__">/);
    assert.match(result.document, /import \{ hydratePage \} from "@litsx\/ssr\/hydration";/);
    assert.match(result.document, /register: \(\) => import\("\/src\/main\.js"\)/);
    assert.doesNotMatch(result.document, /<meta charset="utf-8">/);
    assert.match(result.defaultDocument, /<meta charset="utf-8">/);
    assert.strictEqual(result.htmlAttributesString, ' lang="en"');
    assert.strictEqual(result.bodyAttributesString, "");
  });

  it("lets framework consumers assemble a custom document shell from fragment primitives", async () => {
    class ProductCard extends LitElement {
      static [LITSX_MODULE_ID] = "/src/ProductCard.litsx";

      render() {
        return html`<article>${this.product.name}</article>`;
      }
    }

    const fragment = await renderToString(
      html`<product-card .product=${{ name: "Framework Shoe" }}></product-card>`,
      {
        elements: {
          "product-card": ProductCard,
        },
        assetResolver(moduleId) {
          return `/assets/${moduleId.split("/").at(-1)}.js`;
        },
      },
    );
    const bootstrap = renderBootstrap({
      clientEntry: "/src/main.js",
      assetResolver(moduleId) {
        return moduleId === "/src/main.js" ? "/assets/main.hash.js" : moduleId;
      },
    });
    const document = `<!doctype html>
<html lang="es">
  <head>
    <title>Framework Shell</title>
    <meta name="framework" content="nextsx-like">
    ${fragment.renderModulePreloads()}
    ${fragment.renderHydrationData()}
  </head>
  <body data-runtime="custom">
    <div id="app">${fragment.html}</div>
    ${bootstrap}
  </body>
</html>`;

    assert.match(document, /<title>Framework Shell<\/title>/);
    assert.match(document, /<meta name="framework" content="nextsx-like">/);
    assert.match(document, /<link rel="modulepreload" href="\/assets\/ProductCard\.litsx\.js">/);
    assert.match(document, /<script type="application\/json" id="__LITSX_HYDRATION__">/);
    assert.match(document, /<product-card\b[^>]*data-litsx-root="litsx-root-0"/);
    assert.match(bootstrap, /import \{ hydratePage \} from "@litsx\/ssr\/hydration";/);
    assert.match(bootstrap, /register: \(\) => import\("\/assets\/main\.hash\.js"\)/);
  });

  it("builds reusable document context from a fragment result", async () => {
    class ProductCard extends LitElement {
      static [LITSX_MODULE_ID] = "/src/ProductCard.litsx";

      render() {
        return html`<article>${this.product.name}</article>`;
      }
    }

    const fragment = await renderToString(
      html`<product-card .product=${{ name: "Context Shoe" }}></product-card>`,
      {
        elements: {
          "product-card": ProductCard,
        },
      },
    );
    const context = createDocumentContext(fragment, {
      title: "Context Shell",
      head: '<meta name="ctx" content="1">',
      bodyAttributes: {
        class: "shell",
      },
      clientEntry: "/src/main.js",
    });

    assert.strictEqual(context.title, "Context Shell");
    assert.strictEqual(context.lang, "en");
    assert.strictEqual(context.head, '<meta name="ctx" content="1">');
    assert.deepStrictEqual(context.bodyAttributes, { class: "shell" });
    assert.strictEqual(context.modulePreloads, fragment.renderModulePreloads());
    assert.strictEqual(context.hydrationScript, fragment.renderHydrationData());
    assert.match(context.bootstrap, /register: \(\) => import\("\/src\/main\.js"\)/);
    assert.match(context.defaultDocument, /<title>Context Shell<\/title>/);
  });

  it("renders light-dom boundaries without declarative shadow DOM", async () => {
    const result = await renderToString(
      __litsxScopedTemplate(
        html`
          <suspense-list reveal-order="forwards" tail="hidden">
            <suspense-boundary
              .fallback=${() => html`<span>Loading...</span>`}
              .content=${() => html`<article>Loaded</article>`}
            >${renderLight()}</suspense-boundary>
          </suspense-list>
          <error-boundary
            .fallback=${() => html`<span>Errored</span>`}
            .content=${() => html`<article>Stable</article>`}
          >${renderLight()}</error-boundary>
        `,
        {
          "suspense-list": SuspenseList,
          "suspense-boundary": SuspenseBoundary,
          "error-boundary": ErrorBoundary,
        },
      ),
    );

    assert.doesNotMatch(
      result.html,
      /<suspense-list\b[^>]*>\s*<template shadowroot="open"/,
    );
    assert.doesNotMatch(
      result.html,
      /<suspense-boundary\b[^>]*>\s*<template shadowroot="open"/,
    );
    assert.doesNotMatch(
      result.html,
      /<error-boundary\b[^>]*>\s*<template shadowroot="open"/,
    );
    assert.match(
      result.html,
      /<suspense-boundary\b/,
    );
    assert.match(result.html, /<article>Loaded<\/article>/);
    assert.match(
      result.html,
      /<error-boundary\b/,
    );
    assert.match(result.html, /<article>Stable<\/article>/);
  });

  it("waits for suspense-boundary content before final SSR serialization", async () => {
    const pending = createDeferred();
    const firstPass = createDeferred();
    let ready = false;
    let renders = 0;

    class AsyncCard extends LitElement {
      render() {
        return renderWithSoftSuspense(this, () => {
          renders += 1;
          if (!ready) {
            firstPass.resolve();
            throw pending.promise;
          }

          return html`<article data-ready="true">ready:${renders}</article>`;
        });
      }
    }

    const renderPromise = renderToString(
      html`
        <suspense-boundary
          .fallback=${() => html`<span>Loading...</span>`}
          .content=${() => html`<async-card></async-card>`}
        >${renderLight()}</suspense-boundary>
      `,
      {
        elements: {
          "suspense-boundary": SuspenseBoundary,
          "async-card": AsyncCard,
        },
      },
    );

    await firstPass.promise;
    ready = true;
    pending.resolve();
    const result = await renderPromise;

    assert.strictEqual(renders, 2);
    assert.match(
      result.html,
      /<article data-ready="true">ready:[\s\S]*2[\s\S]*<\/article>/,
    );
    assert.doesNotMatch(result.html, /Loading\.\.\./);
  });

  it("passes through unknown custom elements and plain template results", async () => {
    const result = await renderToString(
      html`<main><external-card data-kind=${"promo"}></external-card></main>`,
    );

    assert.match(result.html, /<main>/);
    assert.match(result.html, /<external-card data-kind="promo"><\/external-card>/);
    assert.deepStrictEqual(result.clientImports, []);
    assert.strictEqual(result.hydrationData, null);
    assert.strictEqual(result.renderClientImports(), "");
    assert.strictEqual(result.renderClientImportsData(), "");
    assert.strictEqual(result.renderModulePreloads(), "");
    assert.strictEqual(result.renderHydrationData(), "");
  });

  it("hydrates generic custom element roots in host-only SSR mode", async () => {
    class ExternalCard extends HTMLElement {}
    annotateHydratableCustomElement(ExternalCard, {
      tagName: "external-card",
      moduleId: "external-card-lib",
    });

    const result = await renderToString(
      __litsxScopedTemplate(
        html`<external-card .product=${{ name: "Promo" }}></external-card>`,
        {
          "external-card": ExternalCard,
        },
      ),
    );

    assert.match(result.html, /<external-card\b[^>]*data-litsx-root="litsx-root-0"/);
    assert.doesNotMatch(result.html, /<template shadowroot="open"/);
    assert.deepStrictEqual(result.clientImports, ["external-card-lib"]);
    assert.deepStrictEqual(result.hydrationData, {
      version: 1,
      roots: [
        {
          id: "litsx-root-0",
          tagName: "external-card",
          moduleId: "external-card-lib",
        },
      ],
    });
    assert.deepStrictEqual(result.hydrationData.payload, {
      roots: {
        "litsx-root-0": {
          props: {
            product: { name: "Promo" },
          },
        },
      },
      instances: {},
    });
  });

  it("lets consumers handle generic custom-element SSR through renderCustomElementSsr", async () => {
    class ExternalCard extends HTMLElement {}
    annotateHydratableCustomElement(ExternalCard, {
      tagName: "external-card",
      moduleId: "external-card-lib",
    });

    const calls = [];
    const result = await renderToString(
      __litsxScopedTemplate(
        html`<external-card .product=${{ name: "Promo" }}></external-card>`,
        {
          "external-card": ExternalCard,
        },
      ),
      {
        renderCustomElementSsr(request) {
          calls.push({
            tagName: request.tagName,
            moduleId: request.moduleId,
            isRoot: request.isRoot,
            rootId: request.rootId,
            props: request.props,
          });

          return {
            mode: "handled",
            host: {
              attributes: {
                "data-adapter": "external",
              },
              props: {
                adapterReady: true,
              },
            },
            content: {
              kind: "shadow-dom",
              html: "<section><h2>Promo</h2></section>",
            },
            assets: {
              clientImports: ["external-card-client"],
              modulePreloads: ["external-card-preload"],
              head: ['<meta name="external-card" content="1">'],
            },
            hydration: {
              payload: {
                source: "adapter",
              },
            },
            artifacts: {
              framework: "external",
            },
          };
        },
      },
    );

    assert.deepStrictEqual(calls, [{
      tagName: "external-card",
      moduleId: "external-card-lib",
      isRoot: true,
      rootId: "litsx-root-0",
      props: {
        product: { name: "Promo" },
      },
    }]);
    assert.match(result.html, /<external-card\b(?=[^>]*data-adapter="external")(?=[^>]*data-litsx-root="litsx-root-0")[^>]*>/);
    assert.match(result.html, /<template shadowroot="open" shadowrootmode="open"><section><h2>Promo<\/h2><\/section><\/template>/);
    assert.deepStrictEqual(result.clientImports, [
      "external-card-lib",
      "external-card-client",
    ]);
    assert.strictEqual(result.renderModulePreloads(), [
      '<link rel="modulepreload" href="external-card-lib">',
      '<link rel="modulepreload" href="external-card-client">',
      '<link rel="modulepreload" href="external-card-preload">',
    ].join(""));
    assert.strictEqual(result.renderHeadTags(), '<meta name="external-card" content="1">');
    assert.deepStrictEqual(result.adapterArtifacts, [{
      tagName: "external-card",
      moduleId: "external-card-lib",
      rootId: "litsx-root-0",
      artifacts: {
        framework: "external",
      },
    }]);
    assert.deepStrictEqual(result.hydrationData.payload, {
      roots: {
        "litsx-root-0": {
          props: {
            product: { name: "Promo" },
            adapterReady: true,
          },
          adapter: {
            source: "adapter",
          },
        },
      },
      instances: {},
    });
  });

  it("merges adapter head tags into renderDocument output", async () => {
    class ExternalCard extends HTMLElement {}
    annotateHydratableCustomElement(ExternalCard, {
      tagName: "external-card",
      moduleId: "external-card-lib",
    });

    const result = await renderDocument(
      __litsxScopedTemplate(html`<external-card></external-card>`, {
        "external-card": ExternalCard,
      }),
      {
        title: "Adapter Page",
        renderCustomElementSsr() {
          return {
            mode: "handled",
            content: {
              kind: "shadow-dom",
              html: "<div>Adapter</div>",
            },
            assets: {
              head: ['<meta name="adapter-page" content="yes">'],
            },
          };
        },
      },
    );

    assert.strictEqual(result.headTags.join(""), '<meta name="adapter-page" content="yes">');
    assert.match(result.document, /<meta name="adapter-page" content="yes">/);
  });

  it("accepts promised renderable values", async () => {
    const result = await renderToString(Promise.resolve(html`<main>ready</main>`));
    assert.match(result.html, /<main>ready<\/main>/);
  });

  it("resolves server-component call markers inside renderToString", async () => {
    async function ProductPage({ label }) {
      return __litsxScopedTemplate(html`<main>${label}</main>`, {});
    }

    const result = await renderToString(
      __litsxServerComponentCall(ProductPage, { label: "ready" }),
    );

    assert.match(result.html, /<main>[\s\S]*ready[\s\S]*<\/main>/);
  });

  it("renders nested server-component call markers inside server-component templates", async () => {
    class ProductCard extends LitElement {
      static [LITSX_MODULE_ID] = "/src/ProductCard.litsx";

      render() {
        return html`<article>${this.product.name}</article>`;
      }
    }

    async function ProductSection({ product }) {
      return __litsxScopedTemplate(
        html`<product-card .product=${product}></product-card>`,
        {
          "product-card": ProductCard,
        },
      );
    }

    async function ProductPage({ product }) {
      return __litsxScopedTemplate(
        html`<main>${__litsxServerComponentCall(ProductSection, { product })}</main>`,
        {},
      );
    }

    const result = await renderToString(
      __litsxServerComponentCall(ProductPage, {
        product: { name: "Nested Trail Shoe" },
      }),
    );

    assert.match(result.html, /<main>/);
    assert.match(result.html, /<product-card\b[^>]*data-litsx-root="litsx-root-0"/);
    assert.match(result.html, /<template shadowroot="open" shadowrootmode="open">/);
    assert.match(result.html, /Nested Trail Shoe/);
    assert.doesNotMatch(result.html, /<product-page\b/);
    assert.doesNotMatch(result.html, /<product-section\b/);
    assert.deepStrictEqual(result.clientImports, ["/src/ProductCard.litsx"]);
    assert.deepStrictEqual(result.hydrationData, {
      version: 1,
      roots: [
        {
          id: "litsx-root-0",
          tagName: "product-card",
          moduleId: "/src/ProductCard.litsx",
        },
      ],
    });
  });

  it("hydrates html template custom elements declared through Component.elements", async () => {
    class ProductCard extends LitElement {
      static [LITSX_MODULE_ID] = "/src/ProductCard.litsx";

      render() {
        return html`<article>${this.product.name}</article>`;
      }
    }

    async function ProductPage({ product }) {
      return __litsxScopedTemplate(
        html`<main><product-card .product=${product}></product-card></main>`,
        ProductPage.elements,
      );
    }

    ProductPage.elements = {
      "product-card": ProductCard,
    };

    const result = await renderToString(
      __litsxServerComponentCall(ProductPage, {
        product: { name: "Trail Shoe" },
      }),
    );

    assert.match(result.html, /<product-card\b[^>]*data-litsx-root="litsx-root-0"/);
    assert.match(result.html, /Trail Shoe/);
    assert.deepStrictEqual(result.clientImports, ["/src/ProductCard.litsx"]);
    assert.deepStrictEqual(result.hydrationData, {
      version: 1,
      roots: [
        {
          id: "litsx-root-0",
          tagName: "product-card",
          moduleId: "/src/ProductCard.litsx",
        },
      ],
    });
  });

  it("renders local async PascalCase composition inside a default-export-style server flow", async () => {
    class ProductCard extends LitElement {
      static [LITSX_MODULE_ID] = "/src/ProductCard.litsx";

      render() {
        return html`<article>${this.product.name}</article>`;
      }
    }

    async function ProductSection({ product }) {
      return __litsxScopedTemplate(
        html`<product-card .product=${product}></product-card>`,
        {
          "product-card": ProductCard,
        },
      );
    }

    async function ProductPage({ product }) {
      return __litsxScopedTemplate(
        html`<main>${__litsxServerComponentCall(ProductSection, { product })}</main>`,
        {},
      );
    }

    const result = await renderToString(
      __litsxServerComponentCall(ProductPage, {
        product: { name: "Local Trail Shoe" },
      }),
    );

    assert.match(result.html, /<main>/);
    assert.match(result.html, /<product-card\b[^>]*data-litsx-root="litsx-root-0"/);
    assert.match(result.html, /Local Trail Shoe/);
    assert.doesNotMatch(result.html, /<product-page\b/);
    assert.doesNotMatch(result.html, /<product-section\b/);
    assert.deepStrictEqual(result.clientImports, ["/src/ProductCard.litsx"]);
    assert.deepStrictEqual(result.hydrationData, {
      version: 1,
      roots: [
        {
          id: "litsx-root-0",
          tagName: "product-card",
          moduleId: "/src/ProductCard.litsx",
        },
      ],
    });
  });

  it("renders complex server-to-lit projected content with nested SSR roots", async () => {
    class ActionChip extends LitElement {
      static [LITSX_MODULE_ID] = "/src/ActionChip.litsx";

      render() {
        return html`<button>${this.label}</button>`;
      }
    }

    class ProductCard extends LitElement {
      static [LITSX_MODULE_ID] = "/src/ProductCard.litsx";

      render() {
        return html`
          <article>
            <header><slot name="actions"></slot></header>
            <section><slot></slot></section>
          </article>
        `;
      }
    }

    async function ProductActions({ product }) {
      return __litsxScopedTemplate(
        html`
          <action-chip slot="actions" .label=${product.cta}></action-chip>
          <p>${product.copy}</p>
        `,
        {
          "action-chip": ActionChip,
        },
      );
    }

    async function ProductPage({ product }) {
      return __litsxScopedTemplate(
        html`
          <product-card .product=${product}>
            ${__litsxServerComponentCall(ProductActions, { product })}
          </product-card>
        `,
        {
          "product-card": ProductCard,
        },
      );
    }

    const result = await renderToString(
      __litsxServerComponentCall(ProductPage, {
        product: {
          cta: "Buy now",
          copy: "Ships tomorrow",
        },
      }),
    );

    assert.doesNotMatch(result.html, /<product-page\b/);
    assert.doesNotMatch(result.html, /<product-actions\b/);
    assert.match(result.html, /<product-card\b[^>]*data-litsx-root="litsx-root-1"/);
    assert.match(result.html, /<slot name="actions"><\/slot>/);
    assert.match(result.html, /<slot><\/slot>/);
    assert.match(result.html, /<action-chip\b(?=[^>]*data-litsx-root="litsx-root-0")(?=[^>]*slot="actions")[^>]*>/);
    assert.match(result.html, /<action-chip[\s\S]*<template shadowroot="open" shadowrootmode="open">[\s\S]*<button>[\s\S]*Buy now[\s\S]*<\/button>[\s\S]*<\/template><\/action-chip>/);
    assert.match(result.html, /<p>[\s\S]*Ships tomorrow[\s\S]*<\/p>/);
    assert.deepStrictEqual(result.clientImports, [
      "/src/ActionChip.litsx",
      "/src/ProductCard.litsx",
    ]);
    assert.deepStrictEqual(result.hydrationData, {
      version: 1,
      roots: [
        {
          id: "litsx-root-0",
          tagName: "action-chip",
          moduleId: "/src/ActionChip.litsx",
        },
        {
          id: "litsx-root-1",
          tagName: "product-card",
          moduleId: "/src/ProductCard.litsx",
        },
      ],
    });
  });

  it("renders complex server-to-server renderer props with scoped Lit content", async () => {
    class ActionChip extends LitElement {
      static [LITSX_MODULE_ID] = "/src/ActionChip.litsx";

      render() {
        return html`<button>${this.label}</button>`;
      }
    }

    function renderAction(product) {
      return __litsxScopedTemplate(
        html`<action-chip .label=${product.cta}></action-chip><p>${product.copy}</p>`,
        {
          "action-chip": ActionChip,
        },
      );
    }

    async function ProductActions({ actionRenderer, product }) {
      return __litsxScopedTemplate(
        html`<section>${actionRenderer(product)}</section>`,
        {},
      );
    }

    async function ProductPage({ product }) {
      return __litsxServerComponentCall(ProductActions, {
        product,
        actionRenderer: renderAction,
      });
    }

    const result = await renderToString(
      __litsxServerComponentCall(ProductPage, {
        product: {
          cta: "Buy now",
          copy: "Ships tomorrow",
        },
      }),
    );

    assert.doesNotMatch(result.html, /<product-page\b/);
    assert.doesNotMatch(result.html, /<product-actions\b/);
    assert.match(result.html, /<section>/);
    assert.match(result.html, /<action-chip\b[^>]*data-litsx-root="litsx-root-0"/);
    assert.match(result.html, /<button>[\s\S]*Buy now[\s\S]*<\/button>/);
    assert.match(result.html, /<p>[\s\S]*Ships tomorrow[\s\S]*<\/p>/);
    assert.deepStrictEqual(result.clientImports, ["/src/ActionChip.litsx"]);
    assert.deepStrictEqual(result.hydrationData, {
      version: 1,
      roots: [
        {
          id: "litsx-root-0",
          tagName: "action-chip",
          moduleId: "/src/ActionChip.litsx",
        },
      ],
    });
  });

  it("renders complex server-to-lit renderer props with scoped Lit content", async () => {
    class ActionChip extends LitElement {
      static [LITSX_MODULE_ID] = "/src/ActionChip.litsx";

      render() {
        return html`<button>${this.label}</button>`;
      }
    }

    class ProductCard extends LitElement {
      static [LITSX_MODULE_ID] = "/src/ProductCard.litsx";
      static elements = {
        "action-chip": ActionChip,
      };

      render() {
        return html`
          <article>
            <header>${renderRendererCall(this.headerRenderer, this.product)}</header>
          </article>
        `;
      }
    }

    function renderHeader(product) {
      return html`<action-chip .label=${product.cta}></action-chip><p>${product.copy}</p>`;
    }

    async function ProductPage({ product }) {
      return __litsxScopedTemplate(
        html`
          <product-card
            .product=${product}
            .headerRenderer=${bindRendererContext(null, renderHeader)}
          ></product-card>
        `,
        {
          "product-card": ProductCard,
        },
      );
    }

    const result = await renderToString(
      __litsxServerComponentCall(ProductPage, {
        product: {
          cta: "Buy now",
          copy: "Ships tomorrow",
        },
      }),
    );

    assert.doesNotMatch(result.html, /<product-page\b/);
    assert.match(result.html, /<product-card\b[^>]*data-litsx-root="litsx-root-0"/);
    assert.match(result.html, /<header>/);
    assert.match(result.html, /<action-chip[^>]*defer-hydration/);
    assert.match(result.html, /<button>[\s\S]*Buy now[\s\S]*<\/button>/);
    assert.match(result.html, /<p>[\s\S]*Ships tomorrow[\s\S]*<\/p>/);
    assert.deepStrictEqual(result.clientImports, [
      "/src/ProductCard.litsx",
      "/src/ActionChip.litsx",
    ]);
    assert.deepStrictEqual(result.hydrationData, {
      version: 1,
      roots: [
        {
          id: "litsx-root-0",
          tagName: "product-card",
          moduleId: "/src/ProductCard.litsx",
        },
      ],
    });
  });

  it("renders nested scoped elements with arrays, objects, and callback property bindings", async () => {
    class PropertyLeaf extends LitElement {
      static [LITSX_MODULE_ID] = "/src/PropertyLeaf.litsx";
      static properties = {
        items: { attribute: false },
        config: { attribute: false },
        onNavigate: { attribute: false },
      };

      render() {
        return html`<button data-page-size=${this.config.pageSize}>${this.items
          .map((item) => item.label)
          .join(",")}:${typeof this.onNavigate}</button>`;
      }
    }

    class PropertyParent extends LitElement {
      static [LITSX_MODULE_ID] = "/src/PropertyParent.litsx";
      static elements = { "property-leaf": PropertyLeaf };
      static properties = {
        items: { attribute: false },
        config: { attribute: false },
      };

      render() {
        const onNavigate = () => {};
        return html`
          <property-leaf
            .items=${this.items}
            .config=${this.config}
            .onNavigate=${onNavigate}
          ></property-leaf>
        `;
      }
    }

    async function PropertyPage() {
      return __litsxScopedTemplate(
        html`
          <property-parent
            .items=${[{ id: "one", label: "First" }]}
            .config=${{ pageSize: 24 }}
          ></property-parent>
        `,
        { "property-parent": PropertyParent },
      );
    }

    const result = await renderToString(__litsxServerComponentCall(PropertyPage, {}));

    assert.match(result.html, /<property-parent\b[^>]*data-litsx-root="litsx-root-0"/);
    assert.match(result.html, /<property-leaf\b/);
    assert.match(result.html, /data-page-size="24"/);
    assert.match(result.html, /First[\s\S]*function/);
    assert.deepStrictEqual(result.clientImports, [
      "/src/PropertyParent.litsx",
      "/src/PropertyLeaf.litsx",
    ]);
    assert.deepStrictEqual(
      result.hydrationData.payload.roots["litsx-root-0"].props,
      {
        items: [{ id: "one", label: "First" }],
        config: { pageSize: 24 },
      },
    );
  });

  it("rejects server components projected through Lit renderer props during SSR", async () => {
    class ActionChip extends LitElement {
      static [LITSX_MODULE_ID] = "/src/ActionChip.litsx";

      render() {
        return html`<button>${this.label}</button>`;
      }
    }

    class ProductCard extends LitElement {
      static [LITSX_MODULE_ID] = "/src/ProductCard.litsx";

      render() {
        return html`
          <article>
            <header>${renderRendererCall(this.headerRenderer, this.product)}</header>
          </article>
        `;
      }
    }

    async function ProductHeader({ product }) {
      return __litsxScopedTemplate(
        html`<action-chip .label=${product.cta}></action-chip><p>${product.copy}</p>`,
        {
          "action-chip": ActionChip,
        },
      );
    }

    function renderHeader(product) {
      return __litsxServerComponentCall(ProductHeader, { product });
    }

    async function ProductPage({ product }) {
      return __litsxScopedTemplate(
        html`
          <product-card
            .product=${product}
            .headerRenderer=${bindRendererContext(null, renderHeader)}
          ></product-card>
        `,
        {
          "product-card": ProductCard,
        },
      );
    }

    await assert.rejects(
      () =>
        renderToString(
          __litsxServerComponentCall(ProductPage, {
            product: {
              cta: "Buy now",
              copy: "Ships tomorrow",
            },
          }),
        ),
      /SSR renderer props must return a renderable TemplateResult, not a server component call or scoped template\./,
    );
  });

  it("keeps scoped registry context isolated across Lit hosts that use the same renderer", async () => {
    class UiChipA extends LitElement {
      render() {
        return html`<span>A</span>`;
      }
    }

    class UiChipB extends LitElement {
      render() {
        return html`<span>B</span>`;
      }
    }

    function renderHeader() {
      return html`<ui-chip></ui-chip>`;
    }

    class CardA extends LitElement {
      static elements = {
        "ui-chip": UiChipA,
      };

      render() {
        return html`<section data-card="a">${renderRendererCall(this.headerRenderer)}</section>`;
      }
    }

    class CardB extends LitElement {
      static elements = {
        "ui-chip": UiChipB,
      };

      render() {
        return html`<section data-card="b">${renderRendererCall(this.headerRenderer)}</section>`;
      }
    }

    async function ProductPage() {
      return __litsxScopedTemplate(
        html`
          <card-a .headerRenderer=${bindRendererContext(null, renderHeader)}></card-a>
          <card-b .headerRenderer=${bindRendererContext(null, renderHeader)}></card-b>
        `,
        {
          "card-a": CardA,
          "card-b": CardB,
        },
      );
    }

    const result = await renderToString(__litsxServerComponentCall(ProductPage, {}));

    assert.match(result.html, /data-card="a"[\s\S]*<span>[\s\S]*A[\s\S]*<\/span>/);
    assert.match(result.html, /data-card="b"[\s\S]*<span>[\s\S]*B[\s\S]*<\/span>/);
  });

  it("resolves context-provider values during SSR without extra hydration payload", async () => {
    const ThemeContext = createContext("light");

    class ContextReader extends LitElement {
      static [LITSX_MODULE_ID] = "/src/ContextReader.litsx";

      render() {
        prepareEffects(this);
        const theme = useContext(this, ThemeContext);
        return html`<span data-theme=${theme}>${theme}</span>`;
      }
    }

    class ContextRoot extends LitElement {
      static [LITSX_MODULE_ID] = "/src/ContextRoot.litsx";
      static elements = {
        "litsx-context-provider": LitsxContextProviderElement,
        "context-reader": ContextReader,
      };

      render() {
        prepareEffects(this);
        return html`
          <litsx-context-provider .context=${ThemeContext} .value=${"dark"}>
            <context-reader></context-reader>
          </litsx-context-provider>
        `;
      }
    }

    const result = await renderToString(
      __litsxScopedTemplate(
        html`<context-root></context-root>`,
        {
          "context-root": ContextRoot,
        },
      ),
    );

    assert.match(result.html, /<span data-theme="dark">/);
    assert.match(result.html, /data-theme="dark"[\s\S]*dark/);
  });

  it("supports request-scoped execution context reads and writes during SSR", async () => {
    const USER_KEY = createExecutionContextKey("user");

    function readUser() {
      return getCurrentExecutionContext()?.get(USER_KEY) ?? null;
    }

    class UserCard extends LitElement {
      render() {
        const executionContext = getCurrentExecutionContext();
        executionContext?.set(USER_KEY, { id: "123" });
        const user = readUser();
        return html`<span data-user-id=${user?.id ?? "missing"}>${user?.id ?? "missing"}</span>`;
      }
    }

    const result = await renderToString(
      __litsxScopedTemplate(
        html`<user-card></user-card>`,
        {
          "user-card": UserCard,
        },
      ),
    );

    assert.match(result.html, /data-user-id="123"/);
    assert.match(result.html, />123</);
  });

  it("returns null for getCurrentExecutionContext when SSR is not active", async () => {
    assert.strictEqual(getCurrentExecutionContext(), null);
  });

  it("avoids temporary SSR module collisions for authored loaders with the same basename", async () => {
    const root = await fs.mkdtemp(path.join(process.cwd(), ".tmp-ssr-collision-"));

    try {
      await fs.mkdir(path.join(root, "alpha"), { recursive: true });
      await fs.mkdir(path.join(root, "beta"), { recursive: true });

      await fs.writeFile(
        path.join(root, "alpha", "index.js"),
        `import { LitElement, html } from "lit";
import { LITSX_MODULE_ID } from "@litsx/core/elements";

export class AlphaCard extends LitElement {
  static [LITSX_MODULE_ID] = "/src/alpha/index.litsx";

  render() {
    return html\`<article>alpha</article>\`;
  }
}
`,
        "utf8",
      );

      await fs.writeFile(
        path.join(root, "beta", "index.js"),
        `import { LitElement, html } from "lit";
import { LITSX_MODULE_ID } from "@litsx/core/elements";

export class BetaCard extends LitElement {
  static [LITSX_MODULE_ID] = "/src/beta/index.litsx";

  render() {
    return html\`<article>beta</article>\`;
  }
}
`,
        "utf8",
      );

      const result = await renderToString(createEntry({
        root,
        elements(loader) {
          return {
            "alpha-card": async () => (await loader("./alpha/index.js")).AlphaCard,
            "beta-card": async () => (await loader("./beta/index.js")).BetaCard,
          };
        },
        render({ html }) {
          return html`<alpha-card></alpha-card><beta-card></beta-card>`;
        },
      }));

      assert.match(result.html, /alpha/);
      assert.match(result.html, /beta/);

      const compiledEntries = (await fs.readdir(path.join(root, ".ssr")))
        .filter((entry) => entry.endsWith(".server.mjs"))
        .sort();

      assert.strictEqual(compiledEntries.length, 2);
      assert.notStrictEqual(compiledEntries[0], compiledEntries[1]);
      assert.match(compiledEntries[0], /^index\.[0-9a-f]{10}\.server\.mjs$/);
      assert.match(compiledEntries[1], /^index\.[0-9a-f]{10}\.server\.mjs$/);
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });

  it("exposes the same execution context to nested server-component calls", async () => {
    const REQUEST_KEY = createExecutionContextKey("request");
    const seenContexts = [];

    async function ProductSection(_props, ssrContext) {
      const executionContext = getCurrentExecutionContext();
      seenContexts.push(executionContext);
      assert.ok(ssrContext);
      executionContext?.set(REQUEST_KEY, "nested");
      return html`<span data-section-request=${executionContext?.get(REQUEST_KEY)}>section</span>`;
    }

    async function ProductPage(_props, ssrContext) {
      const executionContext = getCurrentExecutionContext();
      seenContexts.push(executionContext);
      assert.ok(ssrContext);
      executionContext?.set(REQUEST_KEY, "root");
      return html`
        <main data-page-request=${executionContext?.get(REQUEST_KEY)}>
          ${__litsxServerComponentCall(ProductSection, {})}
        </main>
      `;
    }

    const result = await renderToString(__litsxServerComponentCall(ProductPage, {}));

    assert.strictEqual(seenContexts.length, 2);
    assert.ok(seenContexts[0]);
    assert.strictEqual(seenContexts[0], seenContexts[1]);
    assert.match(result.html, /data-page-request="root"/);
    assert.match(result.html, /data-section-request="nested"/);
  });

  it("allows indirect execution-context reads from custom hooks and runtime helpers during SSR", async () => {
    const USER_KEY = createExecutionContextKey("user");

    function useCurrentUserId(host) {
      return useMemoValue(
        host,
        () => getCurrentExecutionContext()?.get(USER_KEY)?.id ?? "missing",
        [],
      );
    }

    class UserSummary extends LitElement {
      render() {
        prepareEffects(this);
        getCurrentExecutionContext()?.set(USER_KEY, { id: "hook-user" });
        const userId = useCurrentUserId(this);
        return html`<span data-hook-user=${userId}>${userId}</span>`;
      }
    }

    const result = await renderToString(
      __litsxScopedTemplate(
        html`<user-summary></user-summary>`,
        {
          "user-summary": UserSummary,
        },
      ),
    );

    assert.match(result.html, /data-hook-user="hook-user"/);
    assert.match(result.html, />hook-user</);
  });

  it("reuses the same execution context across suspense retries", async () => {
    const RETRY_KEY = createExecutionContextKey("retry-count");
    const ready = createDeferred();
    const started = createDeferred();
    const seenContexts = [];
    let suspended = false;

    class RetryCard extends LitElement {
      render() {
        return renderWithSoftSuspense(this, () => {
          const executionContext = getCurrentExecutionContext();
          seenContexts.push(executionContext);
          const nextCount = (executionContext?.get(RETRY_KEY) ?? 0) + 1;
          executionContext?.set(RETRY_KEY, nextCount);

          if (!suspended) {
            suspended = true;
            started.resolve();
            throw ready.promise;
          }

          return html`<span data-retry-count=${nextCount}>${nextCount}</span>`;
        });
      }
    }

    const renderPromise = renderToString(
      __litsxScopedTemplate(
        html`<retry-card></retry-card>`,
        {
          "retry-card": RetryCard,
        },
      ),
    );

    await started.promise;
    ready.resolve();
    const result = await renderPromise;

    assert.strictEqual(seenContexts.length, 2);
    assert.ok(seenContexts[0]);
    assert.strictEqual(seenContexts[0], seenContexts[1]);
    assert.match(result.html, /data-retry-count="2"/);
  });

  it("captures a completed global resource cache after suspense settles", async () => {
    const ready = createDeferred();
    const started = createDeferred();
    const cache = new Map();
    let captureCount = 0;

    class ResourceCard extends LitElement {
      render() {
        return renderWithSoftSuspense(this, () => {
          useSsrResourceSnapshot({
            key: "library:i18n",
            capture() {
              captureCount += 1;
              return Object.fromEntries(cache);
            },
            restore() {},
          });

          if (!cache.has("product.title")) {
            started.resolve();
            throw ready.promise.then(() => {
              cache.set("product.title", "Trail shoe");
            });
          }
          return html`<h1>${cache.get("product.title")}</h1>`;
        });
      }
    }

    const renderPromise = renderToString(
      __litsxScopedTemplate(html`<resource-card></resource-card>`, {
        "resource-card": ResourceCard,
      }),
    );
    await started.promise;
    assert.strictEqual(captureCount, 0);
    ready.resolve();
    const result = await renderPromise;

    assert.match(result.html, /Trail shoe/);
    assert.strictEqual(captureCount, 1);
    assert.deepStrictEqual(result.hydrationData.payload.resources, {
      "library:i18n": { "product.title": "Trail shoe" },
    });
    assert.match(
      result.renderHydrationData(),
      /"resources":\{"library:i18n":\{"product.title":"Trail shoe"\}\}/,
    );
  });

  it("emits resource-only hydration data without a custom-element root", async () => {
    function ResourcePage() {
      useSsrResourceSnapshot({
        key: "library:flags",
        capture: () => ({ checkout: true }),
        restore() {},
      });
      return html`<main>Resource-only page</main>`;
    }

    const result = await renderToString(
      __litsxServerComponentCall(ResourcePage, {}),
    );

    assert.deepStrictEqual(result.hydrationData.roots, []);
    assert.deepStrictEqual(result.hydrationData.payload, {
      roots: {},
      instances: {},
      resources: { "library:flags": { checkout: true } },
    });
    assert.notStrictEqual(result.renderHydrationData(), "");
  });

  it("captures resource snapshots for streaming SSR after all chunks complete", async () => {
    class StreamResource extends LitElement {
      render() {
        useSsrResourceSnapshot({
          key: "library:stream",
          capture: () => ({ complete: true }),
          restore() {},
        });
        return html`<span>stream resource</span>`;
      }
    }

    const result = await renderToStream(
      __litsxScopedTemplate(html`<stream-resource></stream-resource>`, {
        "stream-resource": StreamResource,
      }),
    );
    const reader = result.stream.getReader();
    while (!(await reader.read()).done) {}
    const metadata = await result.allReady;

    assert.deepStrictEqual(metadata.hydrationData.payload.resources, {
      "library:stream": { complete: true },
    });
  });

  it("isolates global resource snapshots across concurrent SSR requests", async () => {
    const firstGate = createDeferred();
    const secondGate = createDeferred();

    function renderRequest(label, gate) {
      const cache = new Map([["request", label]]);
      const tagName = `${label}-request-resource`;
      class RequestResource extends LitElement {
        render() {
          useSsrResourceSnapshot({
            key: "library:request",
            capture: () => Object.fromEntries(cache),
            restore() {},
          });
          return html`<span>${label}</span>`;
        }
      }
      return renderToString(gate.promise.then(() =>
        __litsxScopedTemplate(
          label === "alpha"
            ? html`<alpha-request-resource></alpha-request-resource>`
            : html`<beta-request-resource></beta-request-resource>`, {
          [tagName]: RequestResource,
        })
      ));
    }

    const firstRender = renderRequest("alpha", firstGate);
    const secondRender = renderRequest("beta", secondGate);
    secondGate.resolve();
    firstGate.resolve();
    const [first, second] = await Promise.all([firstRender, secondRender]);

    assert.deepStrictEqual(first.hydrationData.payload.resources, {
      "library:request": { request: "alpha" },
    });
    assert.deepStrictEqual(second.hydrationData.payload.resources, {
      "library:request": { request: "beta" },
    });
  });

  it("rejects non-JSON global resource snapshots with their resource path", async () => {
    class InvalidResource extends LitElement {
      render() {
        useSsrResourceSnapshot({
          key: "library:invalid",
          capture: () => ({ value: undefined }),
          restore() {},
        });
        return html`<span>invalid</span>`;
      }
    }

    await assert.rejects(
      () => renderToString(
        __litsxScopedTemplate(html`<invalid-resource></invalid-resource>`, {
          "invalid-resource": InvalidResource,
        }),
      ),
      /resource snapshot value at "resources\.library:invalid\.value" is not JSON-serializable/,
    );
  });

  it("keeps useSsrResourceSnapshot inert outside SSR", () => {
    assert.doesNotThrow(() => useSsrResourceSnapshot({
      key: "library:inactive",
      capture() {
        throw new Error("capture must not run");
      },
      restore() {
        throw new Error("restore must not run");
      },
    }));
  });

  it("isolates execution contexts across concurrent SSR requests", async () => {
    const REQUEST_KEY = createExecutionContextKey("request");
    const firstValue = createDeferred();
    const secondValue = createDeferred();
    const seenContexts = [];

    function createRequestCard(label) {
      return class RequestCard extends LitElement {
        render() {
          const executionContext = getCurrentExecutionContext();
          executionContext?.set(REQUEST_KEY, label);
          seenContexts.push(executionContext);
          return html`<span data-request=${executionContext?.get(REQUEST_KEY)}>${executionContext?.get(REQUEST_KEY)}</span>`;
        }
      };
    }

    const FirstRequestCard = createRequestCard("alpha");
    const SecondRequestCard = createRequestCard("beta");

    const firstRender = renderToString(
      firstValue.promise.then(() =>
        __litsxScopedTemplate(
          html`<first-request-card></first-request-card>`,
          {
            "first-request-card": FirstRequestCard,
          },
        ),
      ),
    );
    const secondRender = renderToString(
      secondValue.promise.then(() =>
        __litsxScopedTemplate(
          html`<second-request-card></second-request-card>`,
          {
            "second-request-card": SecondRequestCard,
          },
        ),
      ),
    );

    secondValue.resolve();
    firstValue.resolve();

    const [firstResult, secondResult] = await Promise.all([firstRender, secondRender]);

    assert.strictEqual(seenContexts.length, 2);
    assert.ok(seenContexts[0]);
    assert.ok(seenContexts[1]);
    assert.notStrictEqual(seenContexts[0], seenContexts[1]);
    assert.match(firstResult.html, /data-request="alpha"/);
    assert.match(secondResult.html, /data-request="beta"/);
  });

  it("does not leak execution context state between SSR requests", async () => {
    const REQUEST_COUNT_KEY = createExecutionContextKey("request-count");

    class RequestCounter extends LitElement {
      render() {
        const executionContext = getCurrentExecutionContext();
        const nextCount = (executionContext?.get(REQUEST_COUNT_KEY) ?? 0) + 1;
        executionContext?.set(REQUEST_COUNT_KEY, nextCount);
        return html`<span data-request-count=${nextCount}>${nextCount}</span>`;
      }
    }

    const firstResult = await renderToString(
      __litsxScopedTemplate(
        html`<request-counter></request-counter>`,
        {
          "request-counter": RequestCounter,
        },
      ),
    );
    const secondResult = await renderToString(
      __litsxScopedTemplate(
        html`<request-counter></request-counter>`,
        {
          "request-counter": RequestCounter,
        },
      ),
    );

    assert.match(firstResult.html, /data-request-count="1"/);
    assert.match(secondResult.html, /data-request-count="1"/);
  });
});
