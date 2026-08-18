import assert from "node:assert";
import { html } from "lit";
import { describe, it } from "vitest";
import { jsxSpreadElement } from "../packages/core/src/jsx-spread.js";
import { renderToStream, renderToString } from "../packages/ssr/src/index.js";
import { createSpreadDigestRewriter } from "../packages/ssr/src/spread-template-digests.js";

async function readStream(stream) {
  const reader = stream.getReader();
  let output = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) return output;
    output += value;
  }
}

describe("@litsx/ssr JSX spread integration", () => {
  it("rewrites spread template digests through renderToString", async () => {
    const result = await renderToString(
      html`<main>${jsxSpreadElement("button", [{ title: "ready" }])}</main>`,
    );
    assert.match(result.html, /<main>/);
    assert.match(result.html, /<button[^>]*title="ready"/);
    assert.doesNotMatch(result.html, /@__litsx_spread/);
  });

  it("rewrites markers split at every possible streaming boundary", () => {
    const source = "before<!--lit-part server-digest-->inside<!--/lit-part-->after";
    const expected = "before<!--lit-part client-digest-->inside<!--/lit-part-->after";
    for (let size = 1; size <= source.length; size += 1) {
      const rewriter = createSpreadDigestRewriter(
        new Map([["server-digest", "client-digest"]]),
      );
      let output = "";
      for (let offset = 0; offset < source.length; offset += size) {
        output += rewriter.write(source.slice(offset, offset + size));
      }
      output += rewriter.end();
      assert.strictEqual(output, expected, `chunk size ${size}`);
    }
  });

  it("applies the same reconciliation through renderToStream", async () => {
    const value = html`<div>${jsxSpreadElement("span", [{ title: "stream" }], {}, "ready")}</div>`;
    const stringResult = await renderToString(value);
    const { stream, allReady } = await renderToStream(value);
    const streamed = await readStream(stream);
    await allReady;
    assert.strictEqual(streamed, stringResult.html);
  });
});
