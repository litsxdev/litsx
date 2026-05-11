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
    const staticHoistRule = litsxTsxLanguage.repository["litsx-hoists"].patterns[0];
    const boolAttribute = litsxTsxLanguage.repository["litsx-jsx-tag-bool-attribute"];
    const staticStylesRule = litsxTsxLanguage.repository["litsx-styles-css"].patterns[0];

    assert.deepStrictEqual(tagAttributes[0], { include: "#litsx-jsx-tag-attribute" });
    assert.match(staticHoistRule.match, /\\bstatic\\b/);
    assert.strictEqual(
      staticHoistRule.captures[1].name,
      "keyword.control.litsx",
    );
    assert.strictEqual(
      staticHoistRule.captures[3].name,
      "entity.name.hoist.litsx",
    );
    assert.strictEqual(litsxTsxLanguage.repository["litsx-hoists"].patterns.length, 1);
    assert.strictEqual(
      boolAttribute.beginCaptures[2].name,
      "entity.other.attribute-name.boolean.litsx",
    );
    assert.strictEqual(staticStylesRule.contentName, "meta.embedded.block.css");
    assert.deepStrictEqual(staticStylesRule.patterns, [{ include: "#litsx-css-root" }]);
    assert.match(staticStylesRule.begin, /\\bstatic\\b/);
    assert.strictEqual(litsxTsxLanguage.repository["litsx-styles-css"].patterns.length, 1);
    assert.ok(litsxTsxLanguage.repository["litsx-css-root"]);
    assert.ok(litsxJsxLanguage.repository["litsx-css-root"]);
    assert.ok(
      Object.keys(litsxTsxLanguage.repository).some((key) => key.startsWith("litsx-css-"))
    );
    assert.match(
      JSON.stringify(litsxTsxLanguage.repository["litsx-css-root"]),
      /#litsx-css-/
    );
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
          "  static styles = `button { color: red; }`;",
          "  return <button .value={count} ?disabled={busy} @click={save}>Save</button>;",
          "}",
        ].join("\n"),
        { lang: "tsx", theme: "github-dark" },
      );

      assert.match(html, /vp-code|shiki/);
      assert.match(html, /static(?:<\/span><span[^>]*>)?\s+(?:<\/span><span[^>]*>)?styles/);
      assert.match(html, /\.(?:<\/span><span[^>]*>)?value/);
      assert.match(html, /\?(?:<\/span><span[^>]*>)?disabled/);
      assert.match(html, /@(?:<\/span><span[^>]*>)?click/);
    } finally {
      highlighter.dispose();
    }
  });

  it("keeps question-mark JSX tags parsable and specializes embedded punctuation by language", () => {
    const tsxEvaluated = litsxTsxLanguage.repository["litsx-jsx-evaluated-code"];
    const jsxEvaluated = litsxJsxLanguage.repository["litsx-jsx-evaluated-code"];

    assert.ok(
      litsxTsxLanguage.repository["jsx-tag"].begin.includes(
        "(?=((<\\s*)|(\\s+))|\\/?>)"
      )
    );
    assert.ok(
      litsxTsxLanguage.repository["jsx-tag-in-expression"].begin.includes(
        "(?=((<\\s*)|(\\s+))|\\/?>)"
      )
    );
    assert.strictEqual(
      tsxEvaluated.beginCaptures[0].name,
      "punctuation.section.embedded.begin.tsx"
    );
    assert.strictEqual(
      jsxEvaluated.beginCaptures[0].name,
      "punctuation.section.embedded.begin.js.jsx"
    );
    assert.strictEqual(
      litsxTsxLanguage.repository["litsx-jsx-tag-event-attribute"].beginCaptures[2].name,
      "entity.other.attribute-name.event.litsx"
    );
    assert.strictEqual(
      litsxTsxLanguage.repository["litsx-jsx-tag-prop-attribute"].beginCaptures[2].name,
      "entity.other.attribute-name.property.litsx"
    );
  });
});
