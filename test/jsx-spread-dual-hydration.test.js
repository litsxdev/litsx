// @vitest-environment happy-dom

import assert from "node:assert";
import { execFileSync } from "node:child_process";
import { LitElement, nothing, render } from "lit";
import { hydrate as hydrateLit } from "@lit-labs/ssr-client";
import { afterEach, describe, it } from "vitest";
import { jsxSpreadElement } from "../packages/core/src/jsx-spread.js";
import { withLitsxHydrationSync } from "../packages/ssr/src/hydration-state.js";

const workspace = process.cwd();
const serverScript = String.raw`
  import { jsxSpreadElement } from "./packages/core/src/jsx-spread.js";
  import { renderToString } from "./packages/ssr/src/index.js";
  import { nothing } from "lit";
  const spec = JSON.parse(process.argv[1]);
  const build = (node) => {
    if (node == null) return nothing;
    if (typeof node !== "object") return String(node);
    if (Array.isArray(node)) return node.map(build);
    if (node.root) return build(node.root);
    return node.children === undefined
      ? jsxSpreadElement(node.tag, node.sources, node.options)
      : jsxSpreadElement(node.tag, node.sources, node.options, build(node.children));
  };
  const result = await renderToString(build(spec));
  process.stdout.write(result.html);
`;

function hydrateTemplate(value, container) {
  return withLitsxHydrationSync(() => hydrateLit(value, container));
}

function serverMarkup(spec) {
  return execFileSync(process.execPath, ["--input-type=module", "-e", serverScript, JSON.stringify(spec)], {
    cwd: workspace,
    encoding: "utf8",
  });
}

function clientView(spec) {
  if (spec == null) return nothing;
  if (typeof spec !== "object") return String(spec);
  if (Array.isArray(spec)) return spec.map(clientView);
  if (spec.root) return clientView(spec.root);
  return spec.children === undefined
    ? jsxSpreadElement(spec.tag, spec.sources, spec.options)
    : jsxSpreadElement(spec.tag, spec.sources, spec.options, clientView(spec.children));
}

function hydrateSpec(serverSpec, clientSpec = serverSpec) {
  const container = document.createElement("div");
  container.innerHTML = serverMarkup(serverSpec);
  const originals = [...container.querySelectorAll("*")];
  hydrateTemplate(clientView(clientSpec), container);
  return { container, originals };
}

afterEach(() => document.body.replaceChildren());

describe("JSX spread dual SSR/client hydration", () => {
  it("hydrates ElementPart state onto the exact server node", () => {
    const spec = { tag: "button", sources: [{ title: "same", disabled: true }] };
    const { container, originals } = hydrateSpec(spec);
    const button = container.querySelector("button");
    assert.strictEqual(button, originals[0]);
    assert.strictEqual(button.title, "same");
    assert.strictEqual(button.disabled, true);
    assert.ok(container._$litPart$);
  });

  it("adopts matching SSR attributes without rewriting them", () => {
    const spec = { tag: "button", sources: [{ title: "adopted", "data-state": "ready" }] };
    const container = document.createElement("div");
    container.innerHTML = serverMarkup(spec);
    const button = container.querySelector("button");
    const originalSetAttribute = Element.prototype.setAttribute;
    let spreadAttributeWrites = 0;
    Element.prototype.setAttribute = function (name, value) {
      if (this === button && (name === "title" || name === "data-state")) spreadAttributeWrites += 1;
      return originalSetAttribute.call(this, name, value);
    };
    try {
      hydrateTemplate(clientView(spec), container);
    } finally {
      Element.prototype.setAttribute = originalSetAttribute;
    }
    assert.strictEqual(spreadAttributeWrites, 0);
    assert.strictEqual(button.title, "adopted");
    assert.strictEqual(button.dataset.state, "ready");
  });

  it("handles nested, repeated and void spread elements", () => {
    const items = [0, 1, 2].map((index) => ({
      tag: "li", sources: [{ "data-index": index, hidden: index === 1 }], children: String(index),
    }));
    const spec = { root: { tag: "section", sources: [{ id: "parent" }], children: [
      { tag: "input", options: { void: true }, sources: [{ value: "ready" }] },
      { tag: "ul", sources: [{}], children: items },
    ] } };
    const { container, originals } = hydrateSpec(spec);
    assert.deepStrictEqual([...container.querySelectorAll("li")].map((item) => item.textContent), ["0", "1", "2"]);
    assert.strictEqual(container.querySelectorAll("*").length, originals.length);
    assert.strictEqual(container.querySelector("input").value, "ready");
    assert.strictEqual(container.querySelectorAll("li")[1].hidden, true);
  });

  it("supports later key changes without replacing the hydrated node", () => {
    const { container } = hydrateSpec({ tag: "div", sources: [{ title: "initial" }] });
    const original = container.querySelector("div");
    render(jsxSpreadElement("div", [{ id: "next", hidden: true }]), container);
    assert.strictEqual(container.querySelector("div"), original);
    assert.strictEqual(original.id, "next");
    assert.strictEqual(original.hidden, true);
    assert.strictEqual(original.hasAttribute("title"), false);
  });

  it("preserves focus while applying controlled properties", () => {
    const spec = { tag: "input", options: { void: true }, sources: [{ value: "client" }] };
    const container = document.createElement("div");
    document.body.append(container);
    container.innerHTML = serverMarkup(spec);
    const original = container.querySelector("input");
    original.value = "typed-before-hydration";
    original.focus();
    hydrateTemplate(clientView(spec), container);
    assert.strictEqual(container.querySelector("input"), original);
    assert.strictEqual(document.activeElement, original);
    assert.strictEqual(original.value, "client");
  });

  it("attaches events and refs and renders dangerous HTML without extra topology", () => {
    let clicks = 0;
    const ref = { current: null };
    const server = { tag: "button", sources: [{ dangerouslySetInnerHTML: { __html: "<strong>ready</strong>" } }] };
    const client = { ...server, sources: [{ ...server.sources[0], "on:click": () => { clicks += 1; }, ref }] };
    const container = document.createElement("div");
    const markup = serverMarkup(server);
    assert.doesNotMatch(markup, /onclick=|onClick=|\sref=/);
    container.innerHTML = markup;
    const original = container.querySelector("button");
    hydrateTemplate(clientView(client), container);
    original.click();
    assert.strictEqual(container.querySelector("button"), original);
    assert.strictEqual(original.textContent, "ready");
    assert.strictEqual(clicks, 1);
    assert.strictEqual(ref.current, original);
  });

  it("infers third-party properties before boolean attributes", () => {
    const tag = "litsx-third-party-spread";
    class ThirdPartyElement extends LitElement {
      static properties = { enabled: { type: Boolean, attribute: false }, label: { attribute: "external-label" } };
    }
    if (!customElements.get(tag)) customElements.define(tag, ThirdPartyElement);
    const container = document.createElement("div");
    render(jsxSpreadElement(tag, [{ enabled: true, label: "ok", standalone: true }], { component: ThirdPartyElement }), container);
    const element = container.querySelector(tag);
    assert.strictEqual(element.enabled, true);
    assert.strictEqual(element.hasAttribute("enabled"), false);
    assert.strictEqual(element.label, "ok");
    assert.strictEqual(element.hasAttribute("standalone"), true);
  });
});
