import assert from "assert";
import { createHighlighter } from "shiki";
import jsxLanguage from "shiki/dist/langs/jsx.mjs";
import tsxLanguage from "shiki/dist/langs/tsx.mjs";
import { describe, it } from "vitest";
import {
  litsxCodeLanguages,
  litsxJsxLanguage,
  litsxTsxLanguage,
} from "../packages/shiki-languages/src/index.js";

describe("@litsx/shiki-languages", () => {
  it("exports the LitSX-aware TSX and JSX registrations", () => {
    const languages = litsxCodeLanguages();

    assert.deepStrictEqual(languages, [litsxTsxLanguage, litsxJsxLanguage]);
    assert.strictEqual(litsxTsxLanguage.name, "tsx");
    assert.strictEqual(litsxJsxLanguage.name, "jsx");
  });

  it("augments the base grammars with LitSX-specific attributes, hoists, and CSS embedding", () => {
    const tagAttributes = litsxTsxLanguage.repository["jsx-tag-attributes"].patterns;
    const hoistRule = litsxTsxLanguage.repository["litsx-hoists"].patterns[0];
    const boolAttribute = litsxTsxLanguage.repository["litsx-jsx-tag-bool-attribute"];
    const stylesRule = litsxTsxLanguage.repository["litsx-styles-css"].patterns[0];

    assert.deepStrictEqual(tagAttributes[0], { include: "#litsx-jsx-tag-attribute" });
    assert.match(hoistRule.match, /\\\^/);
    assert.strictEqual(
      hoistRule.captures[2].name,
      "markup.italic.litsx entity.name.hoist.litsx",
    );
    assert.strictEqual(
      boolAttribute.beginCaptures[2].name,
      "entity.other.attribute-name.boolean.litsx",
    );
    assert.strictEqual(stylesRule.contentName, "meta.embedded.block.css");
    assert.deepStrictEqual(stylesRule.patterns, [{ include: "#litsx-css-root" }]);
    assert.ok(litsxTsxLanguage.repository["litsx-css-root"]);
    assert.ok(litsxJsxLanguage.repository["litsx-css-root"]);
  });

  it("does not mutate the base Shiki registrations when building LitSX-aware variants", () => {
    const baseTsx = tsxLanguage[0];
    const baseJsx = jsxLanguage[0];

    assert.ok(!baseTsx.repository["litsx-hoists"]);
    assert.ok(!baseJsx.repository["litsx-hoists"]);
    assert.ok(
      !baseTsx.repository["jsx-tag-attributes"].patterns.some(
        (pattern) => pattern?.include === "#litsx-jsx-tag-attribute",
      ),
    );
    assert.ok(
      !baseJsx.repository["jsx-tag-attributes"].patterns.some(
        (pattern) => pattern?.include === "#litsx-jsx-tag-attribute",
      ),
    );
  });

  it("highlights LitSX operators and hoists through Shiki", async () => {
    const highlighter = await createHighlighter({
      themes: ["github-dark"],
      langs: litsxCodeLanguages(),
    });

    try {
      const html = highlighter.codeToHtml(
        [
          "export function Card() {",
          "  ^styles(`button { color: red; }`);",
          "  return <button .value={count} ?disabled={busy} @click={save}>Save</button>;",
          "}",
        ].join("\n"),
        { lang: "tsx", theme: "github-dark" },
      );

      assert.match(html, /vp-code|shiki/);
      assert.match(html, /\^(?:<\/span><span[^>]*>)?styles/);
      assert.match(html, /\.(?:<\/span><span[^>]*>)?value/);
      assert.match(html, /\?(?:<\/span><span[^>]*>)?disabled/);
      assert.match(html, /@(?:<\/span><span[^>]*>)?click/);
    } finally {
      highlighter.dispose();
    }
  });
});
