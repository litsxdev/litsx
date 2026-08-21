import assert from "assert";
import { render } from "@lit-labs/ssr";
import { html, LitElement } from "lit";
import { describe, it } from "vitest";
import { jsxSpreadElement } from "../packages/core/src/jsx-spread.js";
import { toLitRef } from "../packages/core/src/react-compat.js";

function renderToString(value) {
  return Array.from(render(value)).join("");
}

describe("jsxSpreadElement SSR", () => {
  it("honors an explicit server template after client hydration state was loaded", () => {
    const clientRuntime = Symbol.for("@litsx/ssr/client-runtime");
    const previous = globalThis[clientRuntime];
    globalThis[clientRuntime] = true;
    try {
      const output = renderToString(jsxSpreadElement(
        "button",
        [{ "data-case": "server", disabled: true }],
        { server: true },
      ));
      assert.match(output, /data-case="server"/);
      assert.match(output, /disabled(?:=""|\s|>)/);
    } finally {
      if (previous === undefined) delete globalThis[clientRuntime];
      else globalThis[clientRuntime] = previous;
    }
  });

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

  it("keeps declared property names and attribute aliases coherent during SSR", () => {
    const tagName = "litsx-jsx-spread-ssr-alias";
    if (!customElements.get(tagName)) {
      customElements.define(tagName, class extends LitElement {
        static properties = {
          iconOnly: {
            type: Boolean,
            reflect: true,
            attribute: "icon-only",
          },
          ariaLabel: {
            type: String,
            reflect: true,
            attribute: "aria-label",
          },
        };

        render() {
          return this.iconOnly
            ? html`<span data-branch="icon">${this.ariaLabel}</span>`
            : html`<span data-branch="label">Label</span>`;
        }
      });
    }
    const component = customElements.get(tagName);

    const propertyOutput = renderToString(jsxSpreadElement(tagName, [{
      iconOnly: true,
      ariaLabel: "Open menu",
    }], { component }));
    assert.match(propertyOutput, /icon-only(?:=""|\s|>)/);
    assert.match(propertyOutput, /aria-label="Open menu"/);
    assert.match(propertyOutput, /data-branch="icon"/);
    assert.doesNotMatch(propertyOutput, /icononly|arialabel/);

    const attributeOutput = renderToString(jsxSpreadElement(tagName, [{
      "icon-only": false,
      "aria-label": "Text label",
    }], { component }));
    assert.doesNotMatch(attributeOutput, /\sicon-only(?:=|\s|>)/);
    assert.match(attributeOutput, /aria-label="Text label"/);
    assert.match(attributeOutput, /data-branch="label"/);
  });

  it("routes undeclared SSR component inputs through rest props", () => {
    const tagName = "litsx-jsx-spread-ssr-rest";
    if (!customElements.get(tagName)) {
      customElements.define(tagName, class extends LitElement {
        static [Symbol.for("litsx.restProps")] = { property: "__litsxRestProps" };
        static properties = {
          label: { type: String },
          __litsxRestProps: { type: Object, attribute: false },
        };

        render() {
          return jsxSpreadElement("button", [this.__litsxRestProps], {}, this.label);
        }
      });
    }

    const output = renderToString(jsxSpreadElement(tagName, [{
      label: "Save",
      "aria-label": "Save action",
      disabled: true,
    }], { component: customElements.get(tagName) }));

    assert.match(output, /<button[^>]*aria-label="Save action"/);
    assert.match(output, /<button[^>]*disabled(?:\s|>)/);
    assert.match(output, />Save</);
    assert.doesNotMatch(output, new RegExp(`<${tagName}[^>]*aria-label=`));
  });

  it("keeps declared callback props and custom-event listeners out of SSR markup", () => {
    const tagName = "litsx-jsx-spread-ssr-events";
    if (!customElements.get(tagName)) {
      customElements.define(tagName, class extends LitElement {
        static properties = {
          onCallback: { attribute: false },
        };

        render() {
          return html`<strong>${typeof this.onCallback}</strong>`;
        }
      });
    }

    const output = renderToString(jsxSpreadElement(tagName, [{
      onCallback: () => {},
      onclick: () => {},
      "on:primary-action": () => {},
    }]));

    assert.match(output, /<strong[^>]*>[\s\S]*function/);
    assert.doesNotMatch(output, /onCallback|onPrimaryAction|onclick|primary-action/);
  });

  it("renders React inner HTML and keeps refs out of server markup", () => {
    const output = renderToString(
      jsxSpreadElement("section", [{
        ref: { current: null },
        dangerouslySetInnerHTML: { __html: "<em>trusted fixture</em>" },
      }], { refAdapter: toLitRef })
    );

    assert.match(output, /<em>trusted fixture<\/em>/);
    assert.doesNotMatch(output, /dangerouslySetInnerHTML|\sref=/);
  });

  it("serializes false for boolean-valued enumerated HTML attributes", () => {
    const output = renderToString(jsxSpreadElement("div", [{
      draggable: false,
      spellCheck: false,
      contentEditable: false,
    }]));

    assert.match(output, /draggable="false"/);
    assert.match(output, /spellcheck="false"/);
    assert.match(output, /contenteditable="false"/);

    const svgOutput = renderToString(jsxSpreadElement(
      "circle",
      [{ focusable: false }],
      { namespace: "svg" },
    ));
    assert.match(svgOutput, /focusable="false"/);
  });
});
