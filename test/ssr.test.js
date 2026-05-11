import assert from "assert";
import { describe, it } from "vitest";
import { LitElement, html } from "lit";
import {
  LITSX_MODULE_ID,
  __litsxScopedTemplate,
} from "../packages/core/src/elements/index.js";
import { renderToString } from "../packages/ssr/src/index.js";
import { css } from "lit";
import { prepareEffects, useMemoValue } from "../packages/core/src/effect-hooks.js";
import { useId, useRef, useState, useExternalStore } from "../packages/core/src/state-hooks.js";

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

    assert.match(result.html, /<product-card\s*>/);
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
  });

  it("passes through unknown custom elements and plain template results", async () => {
    const result = await renderToString(
      html`<main><external-card data-kind=${"promo"}></external-card></main>`,
    );

    assert.match(result.html, /<main>/);
    assert.match(result.html, /<external-card data-kind="promo"><\/external-card>/);
    assert.deepStrictEqual(result.clientImports, []);
    assert.strictEqual(result.renderClientImports(), "");
    assert.strictEqual(result.renderModulePreloads(), "");
  });
});
