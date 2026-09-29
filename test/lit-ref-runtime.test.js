// @vitest-environment happy-dom

import assert from "assert";
import { html, nothing, render } from "lit";
import { createRef, ref } from "../packages/core/src/index.js";
import { describe, it } from "vitest";

describe("Lit-native JSX ref runtime", () => {
  it("assigns object refs directly and clears them with undefined", () => {
    const container = document.createElement("div");
    const inputRef = createRef();

    render(html`<input ${ref(inputRef)}>`, container);
    assert.strictEqual(inputRef.value, container.querySelector("input"));

    render(nothing, container);
    assert.strictEqual(inputRef.value, undefined);
  });

  it("moves stable callback refs with Lit's disconnect-before-connect order", () => {
    const container = document.createElement("div");
    const calls = [];
    const callback = (node) => calls.push(node);

    render(html`<input ${ref(callback)}>`, container);
    const input = container.querySelector("input");
    render(html`<button ${ref(callback)}></button>`, container);
    const button = container.querySelector("button");

    assert.strictEqual(calls[0], input);
    assert.strictEqual(calls.at(-1), button);
    assert.ok(calls.slice(1, -1).every((value) => value === undefined));
  });
});
