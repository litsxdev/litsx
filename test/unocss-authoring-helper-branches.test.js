import assert from "node:assert/strict";
import * as t from "@babel/types";
import babelTraverse from "@babel/traverse";
import parser from "./helpers/litsx-parser.js";
import {
  classPatternValues,
  combineStringParts,
  composeStyleReferences,
  containsLightDomMixin,
  findImportedCssIdentifier,
  findStaticStylesMember,
  finiteStringValues,
  getStaticRuntimeMetadataString,
  guardTemplate,
  inheritedStylesExpression,
  inlineConstantBindings,
  isLitsxComponentClass,
  isSymbolFor,
  unwrapStringExpression,
} from "../packages/unocss/src/index.js";

const traverse = babelTraverse.default || babelTraverse;

function inspect(source) {
  const ast = parser.parse(source, { sourceType: "module", plugins: ["jsx"] });
  let program;
  const classes = [];
  traverse(ast, {
    Program(path) { program = path; },
    Class(path) { classes.push(path); },
  });
  return { program, classes };
}

describe("UnoCSS authoring helper branches", () => {
  it("recognizes symbols, component classes, metadata, styles, and mixins", () => {
    const sample = inspect(`
      class Card {
        static [Symbol.for("litsx.component")] = true;
        static [Symbol.for("litsx.lightDomStyleScope")] = "scope";
        static styles = base;
      }
      class Plain {}
    `);
    const card = sample.classes[0];
    assert.equal(isLitsxComponentClass(card, t), true);
    assert.equal(isLitsxComponentClass(sample.classes[1], t), false);
    assert.equal(getStaticRuntimeMetadataString(card, "litsx.lightDomStyleScope", t), "scope");
    assert.equal(getStaticRuntimeMetadataString(card, "missing", t), null);
    assert.ok(findStaticStylesMember(card, t));
    assert.equal(findStaticStylesMember(sample.classes[1], t), null);
    const symbol = t.callExpression(t.memberExpression(t.identifier("Symbol"), t.identifier("for")), [t.stringLiteral("key")]);
    assert.equal(isSymbolFor(symbol, "key", t), true);
    assert.equal(isSymbolFor(t.identifier("x"), "key", t), false);
    assert.equal(containsLightDomMixin(t.callExpression(t.identifier("LightDomMixin"), []), t), true);
    assert.equal(containsLightDomMixin(t.callExpression(t.identifier("wrap"), [t.callExpression(t.identifier("LightDomMixin"), [])]), t), true);
    assert.equal(containsLightDomMixin(t.callExpression(t.identifier("wrap"), []), t), false);
    assert.equal(containsLightDomMixin(t.identifier("x"), t), false);
  });

  it("composes style references with scalar, array, inherited, and preflight values", () => {
    const style = t.identifier("style");
    assert.equal(composeStyleReferences(null, style, null, t).elements.length, 1);
    assert.equal(composeStyleReferences(t.identifier("base"), style, t.identifier("preflight"), t).elements.length, 3);
    assert.equal(composeStyleReferences(t.arrayExpression([t.identifier("a"), t.identifier("b")]), style, null, t).elements.length, 3);
    assert.equal(inheritedStylesExpression(t).operator, "??");
  });

  it("unwraps nested TypeScript string wrappers", () => {
    const wrapped = t.tsAsExpression(
      t.tsNonNullExpression(t.parenthesizedExpression(t.stringLiteral("value"))),
      t.tsStringKeyword()
    );
    assert.equal(unwrapStringExpression(wrapped, t).value, "value");
    assert.equal(unwrapStringExpression(null, t), null);
  });

  it("combines finite products and stops over the configured limit", () => {
    assert.deepEqual(combineStringParts([["a", "b"], ["1", "2"]]), ["a1", "a2", "b1", "b2"]);
    assert.deepEqual(combineStringParts([]), [""]);
    assert.equal(combineStringParts([["a", "b"], ["1", "2"]], 2), null);
  });

  it("enumerates finite strings across templates, conditionals, logicals, and concatenation", () => {
    assert.equal(finiteStringValues(null, t), null);
    assert.deepEqual(finiteStringValues(t.stringLiteral("x"), t), ["x"]);
    const template = t.templateLiteral(
      [t.templateElement({ raw: "p-", cooked: "p-" }), t.templateElement({ raw: "", cooked: "" }, true)],
      [t.conditionalExpression(t.identifier("ok"), t.stringLiteral("1"), t.stringLiteral("2"))]
    );
    assert.deepEqual(finiteStringValues(template, t), ["p-1", "p-2"]);
    assert.deepEqual(finiteStringValues(t.logicalExpression("||", t.stringLiteral("a"), t.stringLiteral("b")), t), ["a", "b"]);
    assert.deepEqual(finiteStringValues(t.binaryExpression("+", t.stringLiteral("a"), t.stringLiteral("b")), t), ["ab"]);
    assert.equal(finiteStringValues(t.binaryExpression("+", t.identifier("a"), t.stringLiteral("b")), t), null);
    assert.equal(finiteStringValues(t.numericLiteral(1), t), null);
  });

  it("creates dynamic patterns and accepts static resolver fallbacks", () => {
    assert.deepEqual(classPatternValues(t.stringLiteral("static"), t), ["static"]);
    assert.deepEqual(classPatternValues(t.identifier("token"), t, () => ["resolved"]), ["resolved"]);
    assert.deepEqual(classPatternValues(t.identifier("token"), t), ["\u0000"]);
    const conditional = t.conditionalExpression(t.identifier("ok"), t.stringLiteral("a"), t.identifier("dynamic"));
    assert.deepEqual(classPatternValues(conditional, t), ["a", "\u0000"]);
    const template = t.templateLiteral(
      [t.templateElement({ raw: "bg-", cooked: "bg-" }), t.templateElement({ raw: "", cooked: "" }, true)],
      [t.identifier("color")]
    );
    assert.deepEqual(classPatternValues(template, t), ["bg-\u0000"]);
    assert.deepEqual(classPatternValues(t.binaryExpression("+", t.stringLiteral("x"), t.identifier("y")), t), ["x\u0000"]);
  });

  it("inlines constant bindings while preserving unresolved and cyclic identifiers", () => {
    const sample = inspect(`const base = "a"; const alias = base; let mutable = "b"; mutable = "c"; const value = alias + mutable;`);
    const expression = sample.program.get("body.4.declarations.0.init");
    const inlined = inlineConstantBindings(expression.node, expression.scope, t);
    assert.equal(inlined.left.value, "a");
    assert.equal(inlined.right.name, "mutable");
    assert.equal(inlineConstantBindings(null, expression.scope, t), null);
  });

  it("finds imported css aliases and creates encoded guard templates", () => {
    const first = inspect(`import { css as litCss } from "@litsx/core";`).program;
    assert.equal(findImportedCssIdentifier(first, t).name, "litCss");
    assert.equal(findImportedCssIdentifier(inspect(`import { css } from "other";`).program, t), null);
    const guarded = guardTemplate({ candidates: ["p-2"] }, t.identifier("css"), t);
    assert.equal(guarded.tag.name, "css");
    assert.match(guarded.quasi.quasis[0].value.raw, /__LITSX_UNOCSS_GUARD_/);
  });
});
