import assert from "assert";
import { render } from "@lit-labs/ssr";
import { html, LitElement } from "lit";
import { describe, it } from "vitest";
import { jsxSpreadElement } from "../packages/core/src/jsx-spread.js";

function renderToString(value) {
  return Array.from(render(value)).join("");
}

describe("jsxSpreadElement SSR", () => {
  it("serializes inferred native bindings and ordered overrides", () => {
    const output = renderToString(
      jsxSpreadElement(
        "button",
        [
          { title: "first", disabled: true, onClick: () => {}, style: { color: "red" } },
          { title: "last", "data-id": "ready" },
        ],
        {},
        "Continue"
      )
    );

    assert.match(output, /<button[^>]*title="last"/);
    assert.match(output, /<button[^>]*disabled(?:\s|>)/);
    assert.match(output, /<button[^>]*style="color:red;"/);
    assert.match(output, /<button[^>]*data-id="ready"/);
    assert.doesNotMatch(output, /onClick|onclick|@click/);
    assert.match(output, /Continue/);
  });

  it("passes inferred custom-element properties into SSR rendering", () => {
    const tagName = "litsx-jsx-spread-ssr-element";
    if (!customElements.get(tagName)) {
      customElements.define(tagName, class extends LitElement {
        static properties = {
          payload: { attribute: false },
          active: { type: Boolean },
        };

        render() {
          return html`<strong>${this.payload?.label}:${this.active}</strong>`;
        }
      });
    }

    const output = renderToString(
      jsxSpreadElement(tagName, [{
        payload: { label: "server" },
        active: true,
        "aria-label": "status",
      }])
    );

    assert.match(output, /<litsx-jsx-spread-ssr-element[^>]*aria-label="status"/);
    assert.match(output, /<template shadowroot="open"/);
    assert.match(output, /server/);
    assert.match(output, /true/);
    assert.doesNotMatch(output, /payload="/);
  });

  it("renders React inner HTML and keeps refs out of server markup", () => {
    const output = renderToString(
      jsxSpreadElement("section", [{
        ref: { current: null },
        dangerouslySetInnerHTML: { __html: "<em>trusted fixture</em>" },
      }])
    );

    assert.match(output, /<em>trusted fixture<\/em>/);
    assert.doesNotMatch(output, /dangerouslySetInnerHTML|\sref=/);
  });
});
