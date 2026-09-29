import { describe, expect, it } from "vitest";
import { createSpreadDigestRewriter, rewriteSpreadRenderResult } from "../packages/ssr/src/spread-template-digests.js";

describe("spread digest rewriting branches", () => {
  it("handles split markers, mapped and unmapped digests, and flushes tails", () => {
    const rewriter = createSpreadDigestRewriter(new Map([["old", "new"]]));
    expect(rewriter.write("before<!--lit-pa")).toBe("before");
    expect(rewriter.write("rt old-->after<!--lit-part unknown-->tail")).toBe(
      "<!--lit-part new-->after<!--lit-part unknown-->tail",
    );
    expect(rewriter.end()).toBe("");
    expect(rewriter.end()).toBe("");
  });

  it("uses late global mappings and preserves incomplete markers", () => {
    const key = Symbol.for("@litsx/ssr/spread-digest-mappings");
    const previous = globalThis[key];
    try {
      const rewriter = createSpreadDigestRewriter(null);
      globalThis[key] = new Map([["late", "mapped"]]);
      expect(rewriter.write("<!--lit-part late-->x<!--lit-part ")).toBe("<!--lit-part mapped-->x");
      expect(rewriter.end()).toBe("<!--lit-part ");
    } finally {
      globalThis[key] = previous;
    }
  });

  it("rewrites nested promised render iterables and only flushes the root", async () => {
    const key = Symbol.for("@litsx/ssr/spread-digest-mappings");
    const previous = globalThis[key];
    globalThis[key] = new Map([["a", "b"]]);
    try {
      const chunks = [...rewriteSpreadRenderResult([
        "x<!--lit-pa",
        Promise.resolve(["rt a-->", 4]),
        "z",
      ])];
      expect(chunks[0]).toBe("x");
      const nested = await chunks[1];
      expect([...nested]).toHaveLength(2);
      expect(chunks.at(-1)).toBe("<!--lit-paz");
    } finally {
      globalThis[key] = previous;
    }
  });
});
