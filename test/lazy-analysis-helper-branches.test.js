import assert from "node:assert/strict";
import babelTraverse from "@babel/traverse";
import * as t from "@babel/types";
import { describe, it } from "vitest";
import parser from "./helpers/litsx-parser.js";
import {
  collectIfReturns,
  collectSwitchReturns,
  createExpressionFromJSXName,
  getExpressionKey,
  getJsxNameParts,
  getLazyComponentReference,
  getRenderedTagName,
  getReturnedExpression,
  getSpecialMemberAttribute,
  isImportCall,
  isLoaderLike,
  isReactControlComponent,
  resolveFunctionReturnNode,
  resolveObjectProperty,
  resolveObjectPropertyEntry,
  rewriteJSXName,
  setLitsxLazyAnalysisBabelTypes,
  toKebab,
} from "../packages/babel-preset-litsx/src/internal/transform-litsx-lazy-analysis.js";

const traverse = babelTraverse.default || babelTraverse;
setLitsxLazyAnalysisBabelTypes(t);

function inspect(source) {
  const ast = parser.parse(source, { sourceType: "module", plugins: ["jsx"] });
  let program;
  const jsx = [];
  const calls = [];
  traverse(ast, {
    Program(path) { program = path; },
    JSXElement(path) { jsx.push(path); },
    CallExpression(path) { calls.push(path); },
  });
  return { ast, program, jsx, calls };
}

describe("lazy analysis helper branch matrix", () => {
  it("normalizes JSX names and expression keys", () => {
    assert.equal(toKebab("FancyButton"), "fancy-button");
    const scoped = t.jsxIdentifier("Changed");
    scoped.__scopedOriginal = "OriginalName";
    assert.deepEqual(getJsxNameParts(scoped), ["OriginalName"]);
    assert.deepEqual(getJsxNameParts(t.jsxMemberExpression(t.jsxIdentifier("UI"), t.jsxIdentifier("Button"))), ["UI", "Button"]);
    assert.equal(getJsxNameParts(t.identifier("x")), null);
    assert.equal(getExpressionKey(t.identifier("x")), "x");
    assert.equal(getExpressionKey(t.memberExpression(t.identifier("x"), t.identifier("y"))), "x.y");
    assert.equal(getExpressionKey(t.memberExpression(t.identifier("x"), t.stringLiteral("y"), true)), null);
    assert.equal(getExpressionKey(t.memberExpression(t.identifier("x"), t.identifier("y"), true)), null);
    assert.equal(getExpressionKey(t.stringLiteral("x")), null);
  });

  it("extracts function returns and identifies loader forms", () => {
    const expressionArrow = t.arrowFunctionExpression([], t.identifier("x"));
    const blockArrow = t.arrowFunctionExpression([], t.blockStatement([t.returnStatement(t.identifier("y"))]));
    const empty = t.functionExpression(null, [], t.blockStatement([]));
    assert.equal(getReturnedExpression(expressionArrow).name, "x");
    assert.equal(getReturnedExpression(blockArrow).name, "y");
    assert.equal(getReturnedExpression(empty), null);
    assert.equal(getReturnedExpression(t.identifier("x")), null);
    const importCall = t.callExpression(t.import(), [t.stringLiteral("./x.js")]);
    assert.equal(isImportCall(importCall), true);
    assert.equal(isImportCall(t.callExpression(t.identifier("load"), [])), false);
    assert.equal(isLoaderLike(null), false);
    assert.equal(isLoaderLike(t.arrowFunctionExpression([], importCall)), true);
    assert.equal(isLoaderLike(t.functionExpression(null, [], t.blockStatement([]))), false);
    assert.equal(isLoaderLike(t.callExpression(t.memberExpression(importCall, t.identifier("then")), [])), true);
    assert.equal(isLoaderLike(t.conditionalExpression(t.identifier("x"), t.identifier("plain"), importCall)), true);
    assert.equal(isLoaderLike(t.conditionalExpression(t.identifier("x"), t.identifier("plain"), t.identifier("other"))), false);
  });

  it("finds object properties across identifier, string, computed, and non-property entries", () => {
    const object = t.objectExpression([
      t.objectProperty(t.identifier("one"), t.numericLiteral(1)),
      t.objectProperty(t.stringLiteral("two"), t.numericLiteral(2)),
      t.objectProperty(t.identifier("three"), t.numericLiteral(3), true),
      t.spreadElement(t.identifier("rest")),
    ]);
    assert.equal(resolveObjectPropertyEntry(object, "one").value.value, 1);
    assert.equal(resolveObjectPropertyEntry(object, "two").value.value, 2);
    assert.equal(resolveObjectPropertyEntry(object, "three"), undefined);
    assert.equal(resolveObjectPropertyEntry(object, "missing"), undefined);
  });

  it("collects nested if and switch returns including implicit undefined", () => {
    const returns = [];
    collectIfReturns(t.ifStatement(
      t.identifier("a"),
      t.blockStatement([t.returnStatement(null), t.ifStatement(t.identifier("b"), t.returnStatement(t.identifier("x")))]),
      t.returnStatement(t.identifier("y")),
    ), returns);
    assert.deepEqual(returns.map((node) => node.name), ["undefined", "x", "y"]);
    collectIfReturns(t.ifStatement(t.identifier("a"), t.emptyStatement(), null), returns);
    const switchReturns = [];
    collectSwitchReturns(t.switchStatement(t.identifier("x"), [
      t.switchCase(t.numericLiteral(1), [t.expressionStatement(t.numericLiteral(0)), t.returnStatement(null)]),
      t.switchCase(null, [t.returnStatement(t.identifier("fallback"))]),
    ]), switchReturns);
    assert.deepEqual(switchReturns.map((node) => node.name), ["undefined", "fallback"]);
  });

  it("resolves function and object return shapes through real bindings", () => {
    const sample = inspect(`
      const object = { item: Value, "label": Label };
      function none() {}
      function one() { return Value; }
      function many(flag) { if (flag) return Value; switch (flag) { default: return Other; } }
      const arrow = () => Value;
      const block = function () { return Value; };
      const invalid = 1;
      none(); one(); many(flag); arrow(); block(); missing(); obj.call(); invalid();
    `);
    const seen = new Set();
    const byName = (name) => sample.calls.find((path) => path.get("callee").isIdentifier({ name })).node;
    assert.equal(resolveFunctionReturnNode(sample.calls.find((path) => path.get("callee").isMemberExpression()).node, sample.program.scope, {}, new Set()), null);
    assert.equal(resolveFunctionReturnNode(byName("missing"), sample.program.scope, {}, new Set()), null);
    assert.equal(resolveFunctionReturnNode(byName("none"), sample.program.scope, {}, new Set()), null);
    assert.equal(resolveFunctionReturnNode(byName("one"), sample.program.scope, {}, new Set()).name, "Value");
    assert.equal(resolveFunctionReturnNode(byName("many"), sample.program.scope, {}, new Set()).length, 2);
    assert.equal(resolveFunctionReturnNode(byName("arrow"), sample.program.scope, {}, new Set()).name, "Value");
    assert.equal(resolveFunctionReturnNode(byName("block"), sample.program.scope, {}, new Set()).name, "Value");
    assert.equal(resolveFunctionReturnNode(byName("invalid"), sample.program.scope, {}, new Set()), null);
    const oneBinding = sample.program.scope.getBinding("one");
    seen.add(oneBinding.path.node);
    assert.equal(resolveFunctionReturnNode(byName("one"), sample.program.scope, {}, seen), null);
    assert.equal(resolveObjectProperty(t.identifier("object"), "item", sample.program.scope, {}, new Set()).name, "Value");
    assert.equal(resolveObjectProperty(t.identifier("object"), "missing", sample.program.scope, {}, new Set()), null);
    assert.equal(resolveObjectProperty(t.identifier("plain"), "item", sample.program.scope, {}, new Set()), null);
  });

  it("creates, rewrites, and validates JSX lazy references", () => {
    const invalidIdentifier = t.jsxIdentifier("not-valid-name");
    assert.equal(createExpressionFromJSXName(invalidIdentifier), null);
    assert.equal(createExpressionFromJSXName(t.jsxIdentifier("Valid")).name, "Valid");
    assert.equal(createExpressionFromJSXName(t.jsxMemberExpression(t.jsxIdentifier("UI"), t.jsxIdentifier("Button"))).type, "MemberExpression");
    assert.equal(createExpressionFromJSXName(t.identifier("x")), null);
    assert.equal(getRenderedTagName(t.jsxIdentifier("div")), null);
    assert.equal(getRenderedTagName(t.jsxIdentifier("FancyButton")), "fancy-button");
    assert.equal(getRenderedTagName(t.identifier("x")), null);
    const identifier = t.jsxIdentifier("Old");
    rewriteJSXName(identifier, "new-tag");
    assert.equal(identifier.name, "new-tag");
    const member = t.jsxMemberExpression(t.jsxIdentifier("UI"), t.jsxIdentifier("Button"));
    rewriteJSXName(member, "ui-button");
    assert.equal(member.type, "JSXIdentifier");

    assert.equal(getSpecialMemberAttribute({}), null);
    assert.equal(getSpecialMemberAttribute({ attributes: [t.jsxSpreadAttribute(t.identifier("x")), t.jsxAttribute(t.jsxIdentifier("plain"), null)] }), null);
    const sample = inspect(`
      const a = <div />;
      const b = <svg:path />;
      const c = <UI.Group .Button />;
      const d = <UI .Button />;
      const e = <FancyButton />;
      const f = <UI.Button></UI.Button>;
    `);
    assert.equal(getLazyComponentReference({ node: {} }), null);
    assert.equal(getLazyComponentReference(sample.jsx[0]), null);
    assert.equal(getLazyComponentReference(sample.jsx[1]), null);
    assert.equal(getLazyComponentReference(sample.jsx[2]), null);
    const originalSpecialName = sample.jsx[3].node.openingElement.attributes[0].name.name;
    sample.jsx[3].node.openingElement.attributes[0].name.name = ".";
    assert.equal(getLazyComponentReference(sample.jsx[3]), null);
    sample.jsx[3].node.openingElement.attributes[0].name.name = originalSpecialName;
    const special = getLazyComponentReference(sample.jsx[3]);
    assert.equal(special.tag, "ui-button");
    special.rewrite();
    assert.equal(sample.jsx[3].node.openingElement.name.name, "ui-button");
    const direct = getLazyComponentReference(sample.jsx[4]);
    assert.equal(direct.tag, "fancy-button");
    direct.rewrite();
    const memberRef = getLazyComponentReference(sample.jsx[5]);
    memberRef.rewrite();
    assert.equal(sample.jsx[5].node.closingElement.name.name, "ui-button");
  });

  it("recognizes React control imports and rejects lookalikes", () => {
    const sample = inspect(`
      import React, { Suspense as S, SuspenseList, useMemo } from "react";
      import * as Other from "other";
      S; SuspenseList; useMemo; React.Suspense; React.SuspenseList; React.Other; Other.Suspense; Unknown;
    `);
    const expressions = sample.program.get("body").filter((path) => path.isExpressionStatement()).map((path) => path.node.expression);
    assert.deepEqual(expressions.map((node) => isReactControlComponent(node, sample.program.scope)), [true, true, false, true, true, false, false, false]);
    assert.equal(isReactControlComponent(t.memberExpression(t.identifier("React"), t.identifier("Suspense"), true), sample.program.scope), false);
  });
});
