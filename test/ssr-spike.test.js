import assert from "assert";
import { describe, it } from "vitest";
import { LitElement, html } from "lit";
import { render } from "@lit-labs/ssr/lib/render-with-global-dom-shim.js";
import { __litsxScopedTemplate } from "../packages/core/src/elements/index.js";
import { renderScopedTemplateWithLitSsr } from "../packages/core/src/runtime-scoped-ssr.js";

async function collectRenderResult(result) {
  let output = "";
  for await (const chunk of result) {
    output += chunk;
  }
  return output;
}

describe("Lit SSR scoped-elements spike", () => {
  it("shows that plain Lit SSR does not resolve unregistered custom elements", async () => {
    class ProductCard extends LitElement {
      render() {
        return html`<p>${this.product?.name}</p>`;
      }
    }

    const output = await collectRenderResult(
      render(html`<product-card .product=${{ name: "Shoe" }}></product-card>`)
    );

    assert.strictEqual(customElements.get("product-card"), undefined);
    assert.match(output, /<product-card\s*><\/product-card>/);
    assert.doesNotMatch(output, /Trail Shoe|Shoe|shadowroot/);
  });

  it("can resolve scoped LitElement roots and nested scoped children without global registration", async () => {
    class ProductImage extends LitElement {
      render() {
        return html`<img alt=${this.alt} src=${this.src}>`;
      }
    }

    class ProductCard extends LitElement {
      static elements = {
        "product-image": ProductImage,
      };

      render() {
        return html`
          <section>
            <h2>${this.product?.name}</h2>
            <product-image
              .alt=${this.product?.name}
              .src=${this.product?.image}
            ></product-image>
          </section>
        `;
      }
    }

    const output = await renderScopedTemplateWithLitSsr(
      __litsxScopedTemplate(
        html`<product-card .product=${{
          name: "Trail Shoe",
          image: "/shoe.png",
        }}></product-card>`,
        {
          "product-card": ProductCard,
        },
      ),
    );

    assert.strictEqual(customElements.get("product-card"), undefined);
    assert.strictEqual(customElements.get("product-image"), undefined);
    assert.match(output, /<product-card\s*>/);
    assert.match(output, /<template shadowroot="open" shadowrootmode="open">/);
    assert.match(output, /<h2><!--lit-part-->Trail Shoe<!--\/lit-part--><\/h2>/);
    assert.match(output, /<product-image[\s\S]*defer-hydration>/);
    assert.match(output, /<img alt="Trail Shoe" src="\/shoe\.png">/);
  });

  it("resolves the most local scoped constructor first", async () => {
    class ButtonA extends LitElement {
      render() {
        return html`<span>A</span>`;
      }
    }

    class ButtonB extends LitElement {
      render() {
        return html`<span>B</span>`;
      }
    }

    class FeatureB extends LitElement {
      static elements = {
        "ui-button": ButtonB,
      };

      render() {
        return html`<ui-button></ui-button>`;
      }
    }

    class FeatureA extends LitElement {
      static elements = {
        "ui-button": ButtonA,
        "feature-b": FeatureB,
      };

      render() {
        return html`<feature-b></feature-b><ui-button></ui-button>`;
      }
    }

    const output = await renderScopedTemplateWithLitSsr(
      __litsxScopedTemplate(html`<feature-a></feature-a>`, {
        "feature-a": FeatureA,
      }),
    );

    assert.match(output, /<feature-b[\s\S]*<span>B<\/span>/);
    assert.match(output, /<ui-button[\s\S]*<span>A<\/span>/);
  });
});
