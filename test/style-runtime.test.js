// @vitest-environment jsdom

import assert from "node:assert";
import { html, render } from "lit";
import { styleMap } from "lit/directives/style-map.js";
import { describe, it } from "vitest";
import { resolveStyle } from "../packages/core/src/style.js";

describe("native JSX style bindings", () => {
  it("passes strings and nullish values through and preserves existing directives", () => {
    assert.strictEqual(resolveStyle("color: red"), "color: red");
    assert.strictEqual(resolveStyle(null), null);
    assert.strictEqual(resolveStyle(undefined), undefined);

    const directive = styleMap({ color: "red" });
    assert.strictEqual(resolveStyle(directive), directive);
  });

  it("applies style maps with Lit semantics and removes stale or nullish properties", () => {
    const container = document.createElement("div");
    const view = (style) => html`<div style=${resolveStyle(style)}></div>`;

    render(view({
      backgroundColor: "tomato",
      "border-top": "2px solid black",
      "--accent": "gold",
      opacity: 0.5,
      color: null,
    }), container);

    const element = container.querySelector("div");
    assert.strictEqual(element.style.backgroundColor, "tomato");
    assert.strictEqual(element.style.getPropertyValue("border-top"), "2px solid black");
    assert.strictEqual(element.style.getPropertyValue("--accent"), "gold");
    assert.strictEqual(element.style.opacity, "0.5");
    assert.strictEqual(element.style.color, "");

    render(view({ backgroundColor: undefined, color: "blue" }), container);
    assert.strictEqual(container.querySelector("div"), element);
    assert.strictEqual(element.style.backgroundColor, "");
    assert.strictEqual(element.style.getPropertyValue("border-top"), "");
    assert.strictEqual(element.style.getPropertyValue("--accent"), "");
    assert.strictEqual(element.style.opacity, "");
    assert.strictEqual(element.style.color, "blue");

    render(view("display: block; color: green"), container);
    assert.strictEqual(element.style.display, "block");
    assert.strictEqual(element.style.color, "green");
  });
});
