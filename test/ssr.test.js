import assert from "assert";
import { describe, it } from "vitest";
import { LitElement, html } from "lit";
import {
  __litsxServerComponentCall,
  LITSX_MODULE_ID,
  __litsxScopedTemplate,
} from "../packages/core/src/elements/index.js";
import { renderToString } from "../packages/ssr/src/index.js";
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

describe("@litsx/ssr", () => {
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
      __litsxScopedTemplate(
        html`<product-card .product=${{
          name: "Trail Shoe",
          image: "/shoe.png",
        }}></product-card>`,
        {
          "product-card": ProductCard,
        },
      ),
      {
        assetResolver(moduleId) {
          return `/assets/${moduleId.split("/").at(-1)}.js`;
        },
      },
    );

    assert.match(result.html, /<product-card\b/);
    assert.match(result.html, /<product-card[^>]*data-litsx-root="litsx-root-0"/);
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
    assert.strictEqual(
      result.renderClientImportsData(),
      '<script type="application/json" id="__LITSX_CLIENT_IMPORTS__">["/assets/ProductCard.litsx.js","/assets/ProductImage.litsx.js"]</script>',
    );
    assert.strictEqual(
      result.renderHydrationData(),
      '<script type="application/json" id="__LITSX_HYDRATION__">{"version":1,"roots":[{"id":"litsx-root-0","tagName":"product-card","moduleId":"/src/ProductCard.litsx"}]}</script>',
    );
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
    assert.match(result.html, /<product-card[^>]*data-litsx-root="litsx-root-0"/);
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
    assert.match(result.html, /<product-card[^>]*data-litsx-root="litsx-root-1"/);
    assert.match(result.html, /<slot name="actions"><\/slot>/);
    assert.match(result.html, /<slot><\/slot>/);
    assert.match(result.html, /<action-chip[^>]*data-litsx-root="litsx-root-0"[^>]*slot="actions"|<action-chip[^>]*slot="actions"[^>]*data-litsx-root="litsx-root-0"/);
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
    assert.match(result.html, /<action-chip[^>]*data-litsx-root="litsx-root-0"/);
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
    assert.match(result.html, /<product-card[^>]*data-litsx-root="litsx-root-0"/);
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
});
