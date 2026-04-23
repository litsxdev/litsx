// @vitest-environment happy-dom

import assert from "assert";
import { css, html, LitElement } from "lit";
import { describe, it } from "vitest";
import {
  LightDomElementsMixin,
  LightDomMixin,
} from "../packages/litsx/src/runtime-infrastructure/index.js";

let tagCounter = 0;

function nextTag(prefix = "litsx-light-style-test") {
  tagCounter += 1;
  return `${prefix}-${tagCounter}`;
}

describe("LightDomElementsMixin styles", () => {
  it("injects static styles for plain light DOM hosts without elements metadata", async () => {
    const tagName = nextTag();

    class LightStyledPanel extends LightDomMixin(LitElement) {
      static styles = css`
        :host {
          display: block;
        }

        .panel {
          color: rgb(10, 20, 30);
        }
      `;

      createRenderRoot() {
        return this;
      }

      render() {
        return html`<div class="panel">plain</div>`;
      }
    }

    customElements.define(tagName, LightStyledPanel);

    const element = document.createElement(tagName);
    document.body.appendChild(element);
    await element.updateComplete;

    const styleElement = element.querySelector("style[data-litsx-light-dom-style]");
    assert(styleElement, "expected a light DOM style element to be injected");
    assert.match(styleElement.textContent, /\.panel\s*\{/);
  });

  it("injects static styles into light DOM hosts", async () => {
    const tagName = nextTag();

    class LightStyledCard extends LightDomElementsMixin(LitElement) {
      static styles = css`
        :host {
          display: block;
          color: rgb(12, 34, 56);
        }

        .panel {
          border-radius: 12px;
        }
      `;

      createRenderRoot() {
        return this;
      }

      render() {
        return html`<div class="panel">ready</div>`;
      }
    }

    customElements.define(tagName, LightStyledCard);

    const element = document.createElement(tagName);
    document.body.appendChild(element);
    await element.updateComplete;

    const styleElement = element.querySelector("style[data-litsx-light-dom-style]");
    assert(styleElement, "expected a light DOM style element to be injected");
    assert.match(styleElement.textContent, /:host\s*\{/);
    assert.match(styleElement.textContent, /\.panel\s*\{/);
    assert.strictEqual(
      element.querySelectorAll("style[data-litsx-light-dom-style]").length,
      1
    );
  });
});
