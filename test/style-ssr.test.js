import assert from "node:assert";
import { render } from "@lit-labs/ssr";
import { html } from "lit";
import { describe, it } from "vitest";
import { resolveStyle } from "../packages/core/src/style.js";

function renderToString(value) {
  return Array.from(render(value)).join("");
}

describe("native JSX style bindings in SSR", () => {
  it("serializes style maps through Lit styleMap", () => {
    const output = renderToString(html`<div style=${resolveStyle({
      backgroundColor: "tomato",
      "border-top": "1px solid black",
      "--accent": "gold",
      opacity: 0.5,
      color: null,
      width: undefined,
    })}></div>`);

    assert.match(output, /style="[^"]*background-color:tomato;/);
    assert.match(output, /style="[^"]*border-top:1px solid black;/);
    assert.match(output, /style="[^"]*--accent:gold;/);
    assert.match(output, /style="[^"]*opacity:0.5;/);
    assert.doesNotMatch(output, /color:null|width:undefined/);
  });

  it("keeps CSS text as an ordinary inline style value", () => {
    const output = renderToString(
      html`<div style=${resolveStyle("color: red; width: 20px")}></div>`,
    );
    assert.match(output, /style="color: red; width: 20px"/);
  });
});
