// @vitest-environment happy-dom

import assert from "assert";
import { LitElement, render } from "lit";
import { describe, it } from "vitest";
import { jsxSpreadElement } from "../packages/core/src/jsx-spread.js";

describe("jsxSpreadElement", () => {
  it("merges sources in order and removes stale keys", () => {
    const container = document.createElement("div");
    let firstCalls = 0;
    let secondCalls = 0;
    const onFirst = () => { firstCalls += 1; };
    const onSecond = () => { secondCalls += 1; };
    const view = (sources) => jsxSpreadElement("button", sources);

    render(
      view([
        { title: "first", "on:click": onFirst, disabled: true },
        { title: "second", "on:click": onSecond },
      ]),
      container
    );

    let button = container.querySelector("button");
    assert.strictEqual(button.title, "second");
    assert.strictEqual(button.disabled, true);
    button.dispatchEvent(new Event("click"));
    assert.strictEqual(firstCalls, 0);
    assert.strictEqual(secondCalls, 1);

    render(
      view([{ title: "next" }]),
      container
    );

    button = container.querySelector("button");
    assert.strictEqual(button.title, "next");
    assert.strictEqual(button.disabled, false);
  });

  it("uses properties for component props and supports style, ref, and inner HTML", () => {
    const container = document.createElement("div");
    const ref = { value: undefined };

    render(
      jsxSpreadElement("article", [{
        payload: { ready: true },
        style: { color: "red" },
        ref,
        dangerouslySetInnerHTML: { __html: "<strong>ready</strong>" },
      }], { component: true }),
      container
    );

    const article = container.querySelector("article");
    assert.deepStrictEqual(article.payload, { ready: true });
    assert.strictEqual(article.style.color, "red");
    assert.strictEqual(ref.value, article);
    assert.strictEqual(article.querySelector("strong").textContent, "ready");
  });

  it("inspects a custom element reactive API for lowercase custom-element tags", () => {
    const tag = "jsx-spread-reactive-api";
    if (!customElements.get(tag)) {
      customElements.define(tag, class extends LitElement {
        static properties = {
          payload: { attribute: false },
          active: { type: Boolean },
        };
      });
    }
    const container = document.createElement("div");
    const payload = { id: 1 };

    render(jsxSpreadElement("jsx-spread-reactive-api", [{
      payload,
      active: true,
      "data-id": "ready",
    }]), container);

    const element = container.querySelector(tag);
    assert.strictEqual(element.payload, payload);
    assert.strictEqual(element.active, true);
    assert.strictEqual(element.getAttribute("data-id"), "ready");
  });

  it("finalizes imported constructors and distinguishes property names from declared attribute aliases", () => {
    class ImportedButtonApi extends LitElement {
      static properties = {
        iconOnly: { type: Boolean, attribute: "icon-only" },
        ariaLabel: { type: String, attribute: "aria-label" },
        formAction: { type: String, attribute: "formaction" },
        formNoValidate: { type: Boolean, attribute: "formnovalidate" },
      };
    }

    assert.strictEqual(
      Object.prototype.hasOwnProperty.call(ImportedButtonApi, "elementProperties"),
      false,
    );

    const container = document.createElement("div");
    render(jsxSpreadElement("section", [{
      iconOnly: true,
      ariaLabel: "Property label",
    }], { component: ImportedButtonApi }), container);

    let element = container.querySelector("section");
    assert.strictEqual(
      Object.prototype.hasOwnProperty.call(ImportedButtonApi, "elementProperties"),
      true,
    );
    assert.strictEqual(element.iconOnly, true);
    assert.strictEqual(element.ariaLabel, "Property label");
    assert.strictEqual(element.hasAttribute("icon-only"), false);
    assert.strictEqual(element.hasAttribute("aria-label"), false);

    render(jsxSpreadElement("section", [{
      "icon-only": "",
      "aria-label": "Attribute label",
      formaction: "/save",
      formnovalidate: "",
    }], { component: ImportedButtonApi }), container);
    element = container.querySelector("section");
    assert.strictEqual(element.getAttribute("icon-only"), "");
    assert.strictEqual(element.getAttribute("aria-label"), "Attribute label");
    assert.strictEqual(element.getAttribute("formaction"), "/save");
    assert.strictEqual(element.getAttribute("formnovalidate"), "");

    render(jsxSpreadElement("section", [{
      "icon-only": false,
      "aria-label": null,
      formaction: null,
      formnovalidate: false,
    }], { component: ImportedButtonApi }), container);
    element = container.querySelector("section");
    assert.strictEqual(element.hasAttribute("icon-only"), false);
    assert.strictEqual(element.hasAttribute("aria-label"), false);
    assert.strictEqual(element.hasAttribute("formaction"), false);
    assert.strictEqual(element.hasAttribute("formnovalidate"), false);
  });

  it("routes undeclared component inputs into a reactive rest-props bag", async () => {
    const tag = "jsx-spread-rest-props";
    if (!customElements.get(tag)) {
      customElements.define(tag, class extends LitElement {
        static [Symbol.for("litsx.restProps")] = { property: "__litsxRestProps" };
        static properties = {
          variant: { type: String },
          __litsxRestProps: { type: Object, attribute: false },
        };

        render() {
          return jsxSpreadElement("button", [this.__litsxRestProps], { reactCompatEvents: true }, this.variant);
        }
      });
    }
    const container = document.createElement("div");
    document.body.append(container);
    const onClick = () => {};
    const onclick = () => {};
    const payload = { id: 1 };

    render(jsxSpreadElement(tag, [{
      variant: "primary",
      "aria-label": "Save",
      ".payload": payload,
      "?disabled": true,
      onClick,
      ".onclick": onclick,
    }], { component: customElements.get(tag), reactCompatEvents: true }), container);

    let host = container.querySelector(tag);
    await host.updateComplete;
    let button = host.shadowRoot.querySelector("button");
    assert.strictEqual(host.variant, "primary");
    assert.strictEqual(host.onclick, onclick);
    assert.strictEqual(host.hasAttribute("aria-label"), false);
    assert.deepStrictEqual(host.__litsxRestProps, {
      "aria-label": "Save",
      payload: { id: 1 },
      disabled: true,
      onClick,
    });
    assert.strictEqual(button.getAttribute("aria-label"), "Save");
    assert.deepStrictEqual(button.payload, { id: 1 });
    assert.strictEqual(button.disabled, true);

    render(jsxSpreadElement(tag, [{ variant: "secondary", title: "Next" }], {
      component: customElements.get(tag),
      reactCompatEvents: true,
    }), container);
    host = container.querySelector(tag);
    await host.updateComplete;
    assert.deepStrictEqual(host.__litsxRestProps, { title: "Next" });
    button = host.shadowRoot.querySelector("button");
    assert.strictEqual(button.getAttribute("aria-label"), null);
    assert.strictEqual(button.disabled, false);
    assert.strictEqual(button.title, "Next");
  });

  it("keeps standard host attributes outside native component rest props", () => {
    const tag = "jsx-spread-host-attributes";
    if (!customElements.get(tag)) {
      customElements.define(tag, class extends HTMLElement {
        static [Symbol.for("litsx.restProps")] = { property: "__litsxRestProps" };
        static elementProperties = new Map([
          ["payload", { attribute: false }],
          ["__litsxRestProps", { type: Object, attribute: false }],
        ]);
        static finalize() {}
      });
    }

    const container = document.createElement("div");
    const payload = { id: 1 };
    const component = customElements.get(tag);

    render(jsxSpreadElement(tag, [
      { class: "first", title: "before" },
      {
        class: "middle",
        id: "host-id",
        style: "color: red",
        slot: "indicator",
        part: "icon",
        exportparts: "glyph",
        role: "img",
        tabindex: -1,
        "aria-label": "Host label",
        "data-state": "open",
        hidden: true,
        payload,
        forwarded: "inner",
      },
      { class: "last", title: undefined },
    ], { component }), container);

    const host = container.querySelector(tag);
    assert.strictEqual(host.getAttribute("class"), "last");
    assert.strictEqual(host.id, "host-id");
    assert.strictEqual(host.getAttribute("style"), "color: red");
    assert.strictEqual(host.getAttribute("slot"), "indicator");
    assert.strictEqual(host.getAttribute("part"), "icon");
    assert.strictEqual(host.getAttribute("exportparts"), "glyph");
    assert.strictEqual(host.getAttribute("role"), "img");
    assert.strictEqual(host.getAttribute("tabindex"), "-1");
    assert.strictEqual(host.getAttribute("aria-label"), "Host label");
    assert.strictEqual(host.dataset.state, "open");
    assert.strictEqual(host.hidden, true);
    assert.strictEqual(host.hasAttribute("title"), false);
    assert.strictEqual(host.payload, payload);
    assert.deepStrictEqual(host.__litsxRestProps, { forwarded: "inner" });

  });

  it("distinguishes onX callback props from explicit custom events", () => {
    const tag = "jsx-spread-custom-events";
    if (!customElements.get(tag)) {
      customElements.define(tag, class extends LitElement {
        static properties = {
          onCallback: { attribute: false },
        };
      });
    }
    const container = document.createElement("div");
    const onCallback = () => {};
    let primaryActions = 0;
    let urlChanges = 0;
    let animations = 0;
    let nativeClicks = 0;

    render(jsxSpreadElement(tag, [{
      onCallback,
      onclick: () => { nativeClicks += 1; },
      "on:primary-action": () => { primaryActions += 1; },
      "on:url-change": () => { urlChanges += 1; },
      "on:animationend": () => { animations += 1; },
    }]), container);

    const element = container.querySelector(tag);
    assert.strictEqual(element.onCallback, onCallback);
    assert.strictEqual(element.hasAttribute("onclick"), false);
    element.dispatchEvent(new Event("click"));
    element.dispatchEvent(new CustomEvent("primary-action"));
    element.dispatchEvent(new CustomEvent("url-change"));
    element.dispatchEvent(new Event("animationend"));
    assert.strictEqual(nativeClicks, 1);
    assert.strictEqual(primaryActions, 1);
    assert.strictEqual(urlChanges, 1);
    assert.strictEqual(animations, 1);
  });

  it("supports listener objects and event options through on:event spreads", () => {
    const container = document.createElement("div");
    let calls = 0;
    const listener = {
      capture: true,
      once: true,
      passive: true,
      handleEvent() { calls += 1; },
    };

    render(jsxSpreadElement("button", [{ "on:click": listener }]), container);
    const button = container.querySelector("button");
    button.click();
    button.click();
    assert.strictEqual(calls, 1);
    assert.throws(
      () => render(jsxSpreadElement("button", [{ "on:menuOpen": listener }]), container),
      /must use lowercase kebab-case/,
    );
  });

  it("keeps normalized aliases and stable refs correct across updates", () => {
    const container = document.createElement("div");
    const refValues = [];
    const ref = (value) => refValues.push(value);
    const view = (sources) => jsxSpreadElement("div", sources);

    render(view([{ className: "first", ref }]), container);
    const element = container.querySelector("div");
    render(view([{ class: "second", ref }]), container);

    assert.strictEqual(element.className, "second");
    assert.deepStrictEqual(refValues, [element]);
  });

  it("serializes boolean-valued HTML attributes instead of toggling their presence", () => {
    const container = document.createElement("div");
    const view = (value) => jsxSpreadElement("div", [{
      draggable: value,
      spellCheck: value,
      contentEditable: value,
    }]);

    render(view(false), container);
    const element = container.querySelector("div");
    assert.strictEqual(element.getAttribute("draggable"), "false");
    assert.strictEqual(element.getAttribute("spellcheck"), "false");
    assert.strictEqual(element.getAttribute("contenteditable"), "false");

    render(view(true), container);
    assert.strictEqual(element.getAttribute("draggable"), "true");
    assert.strictEqual(element.getAttribute("spellcheck"), "true");
    assert.strictEqual(element.getAttribute("contenteditable"), "true");
  });
});
