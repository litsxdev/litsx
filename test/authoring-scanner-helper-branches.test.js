import assert from "node:assert/strict";
import { describe, it } from "vitest";
import {
  createVirtualLitsxJsxSource,
  encodeEditorVirtualAttributeName,
  findReplacementByVirtualPosition,
  isLikelyJsxTagStart,
  isReservedVirtualAttributeName,
  isWhitespace,
  previousSignificantIndex,
  readJsxTagName,
  readPreviousWord,
  sanitizeIdentifierTailChar,
  scanBalancedBraces,
  scanBalancedBracesWithJsx,
  scanBlockComment,
  scanJsxElement,
  scanJsxTag,
  scanLineComment,
  scanQuotedString,
  scanTemplateLiteral,
} from "../packages/authoring/src/index.js";

describe("authoring scanner helper branches", () => {
  it("classifies whitespace, reserved names, and editor encodings", () => {
    assert.equal(isWhitespace(" "), true);
    assert.equal(isWhitespace("\n"), true);
    assert.equal(isWhitespace("x"), false);
    assert.equal(isReservedVirtualAttributeName("__litsx_event_click"), true);
    assert.equal(isReservedVirtualAttributeName("event_click"), false);
    assert.equal(sanitizeIdentifierTailChar("a"), "a");
    assert.equal(sanitizeIdentifierTailChar("-"), "_");
    assert.equal(encodeEditorVirtualAttributeName("@save-now"), "esave_now");
    assert.equal(encodeEditorVirtualAttributeName(".value"), "pvalue");
    assert.equal(encodeEditorVirtualAttributeName("?hidden"), "bhidden");
  });

  it("scans quoted strings and terminated or unterminated comments", () => {
    assert.equal(scanQuotedString('"a\\"b" tail', 0, '"'), 6);
    assert.equal(scanQuotedString("'unterminated", 0, "'"), 13);
    assert.equal(scanLineComment("// text\nnext", 0), 7);
    assert.equal(scanLineComment("// tail", 0), 7);
    assert.equal(scanBlockComment("/* text */next", 0), 10);
    assert.equal(scanBlockComment("/* tail", 0), 7);
  });

  it("scans templates and balanced braces containing strings, comments, and nested JSX", () => {
    const template = "`head ${ { value: `nested ${1}` } } tail` rest";
    assert.equal(scanTemplateLiteral(template, 0), template.indexOf(" rest"));
    assert.equal(scanTemplateLiteral("`unterminated", 0), 13);
    const braces = `{ "}", /* } */ { value: '}'} // }\n }tail`;
    assert.equal(scanBalancedBraces(braces, 0), braces.indexOf("tail"));
    const replacements = [];
    const jsxBraces = `{ condition ? <Card @save={value} /> : <div>{nested}</div> }tail`;
    assert.equal(scanBalancedBracesWithJsx(jsxBraces, 0, replacements, encodeEditorVirtualAttributeName), jsxBraces.indexOf("tail"));
    assert.equal(replacements[0].originalName, "@save");
  });

  it("recognizes likely JSX starts across punctuation and control words", () => {
    assert.equal(isLikelyJsxTagStart("<Card />", 0), true);
    assert.equal(isLikelyJsxTagStart("value < count", 6), false);
    assert.equal(isLikelyJsxTagStart("return <Card />", 7), true);
    assert.equal(isLikelyJsxTagStart("x = <Card />", 4), true);
    assert.equal(previousSignificantIndex("a   ", 3), 0);
    assert.equal(previousSignificantIndex("   ", 2), -1);
    assert.equal(readPreviousWord("return", 5), "return");
  });

  it("reads opening, closing, namespace, member, and invalid tag names", () => {
    assert.deepEqual(readJsxTagName("<Card.Header>", 0), { name: "Card.Header", isClosing: false, end: 12 });
    assert.deepEqual(readJsxTagName("</svg:path>", 0), { name: "svg:path", isClosing: true, end: 10 });
    assert.equal(readJsxTagName("<1bad>", 0), null);
  });

  it("scans tags with spreads, quoted, expression, bare, and virtual attributes", () => {
    const source = `<Card {...props} @save={fn} .value="x" ?ready bare=word strange='q' />tail`;
    const replacements = [];
    const result = scanJsxTag(source, 0, replacements, encodeEditorVirtualAttributeName);
    assert.equal(result.tagName, "Card");
    assert.equal(result.selfClosing, true);
    assert.deepEqual(replacements.map((entry) => entry.originalName), ["@save", ".value", "?ready"]);
    const closing = scanJsxTag("</Card>", 0, [], encodeEditorVirtualAttributeName);
    assert.equal(closing.isClosing, true);
    assert.equal(scanJsxTag("<1bad>", 0, [], encodeEditorVirtualAttributeName).tagName, null);
    assert.equal(scanJsxTag("<Card", 0, [], encodeEditorVirtualAttributeName).end, 5);
  });

  it("scans nested elements, fragments, expressions, comments, and mismatched endings", () => {
    const source = `<Root><Card @save={fn}><Child />{/* comment */}</Card><Other /></Root>`;
    const replacements = [];
    const result = scanJsxElement(source, 0, replacements, encodeEditorVirtualAttributeName);
    assert.equal(result, source.length);
    assert.equal(replacements.length, 1);
    const single = `<Card><Child /></Card>tail`;
    assert.equal(scanJsxElement(single, 0, [], encodeEditorVirtualAttributeName), single.indexOf("tail"));
    assert.ok(scanJsxElement("<Card><Child></Card>", 0, [], encodeEditorVirtualAttributeName) > 0);
  });

  it("locates replacements by virtual spans and misses outside positions", () => {
    const result = createVirtualLitsxJsxSource(`const view = <Card @save={fn} .value={x} />;`);
    const first = result.replacements[0];
    const located = findReplacementByVirtualPosition(first.start, result.replacements);
    assert.strictEqual(located.replacement, first);
    assert.strictEqual(findReplacementByVirtualPosition(located.virtualEnd - 1, result.replacements).replacement, first);
    assert.equal(findReplacementByVirtualPosition(-1, result.replacements), null);
    assert.equal(findReplacementByVirtualPosition(9999, result.replacements), null);
  });
});
