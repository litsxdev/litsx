import assert from "node:assert";
import { html } from "lit";
import { describe, it } from "vitest";
import { jsxSpreadElement } from "../packages/core/src/jsx-spread.js";
import { createDigestRewriter, render, rewriteRenderResult } from "../packages/ssr/src/index.js";

async function collect(result) {
  let output = "";
  for (const chunk of result) {
    output += typeof chunk === "string" ? chunk : await collect(await chunk);
  }
  return output;
}

describe("@litsx/ssr", () => {
  it("rewrites spread template digests while retaining Lit SSR output", async () => {
    const output = await collect(render(html`<main>${jsxSpreadElement("button", [{ title: "ready" }])}</main>`));
    assert.match(output, /<main>/);
    assert.match(output, /<button[^>]*title="ready"/);
    assert.doesNotMatch(output, /@__litsx_spread/);
  });

  it("rewrites markers split at every possible streaming boundary", () => {
    const source = "before<!--lit-part server-digest-->inside<!--/lit-part-->after";
    const expected = "before<!--lit-part client-digest-->inside<!--/lit-part-->after";
    for (let size = 1; size <= source.length; size += 1) {
      const rewriter = createDigestRewriter(new Map([["server-digest", "client-digest"]]));
      let output = "";
      for (let offset = 0; offset < source.length; offset += size) output += rewriter.write(source.slice(offset, offset + size));
      output += rewriter.end();
      assert.strictEqual(output, expected, `chunk size ${size}`);
    }
  });

  it("preserves async RenderResult ordering", async () => {
    const mappings = globalThis[Symbol.for("@litsx/ssr/spread-digest-mappings")] ??= new Map();
    mappings.set("async-server", "async-client");
    const nested = ["<!--lit-part async-server-->inside<!--/lit-part-->"];
    const output = await collect(rewriteRenderResult([
      "before", Promise.resolve(nested), "after",
    ]));
    assert.strictEqual(output, "before<!--lit-part async-client-->inside<!--/lit-part-->after");
  });
});
