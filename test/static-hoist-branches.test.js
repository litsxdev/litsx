import assert from "node:assert/strict";
import babelTraverse from "@babel/traverse";
import * as t from "@babel/types";
import { describe, it } from "vitest";
import parser from "./helpers/litsx-parser.js";
import {
  containsUnsafeCssCall,
  createExposeHoistMembers,
  createPropertiesExpression,
  getGeneratedPropertiesExpression,
  getGeneratedStylesExpression,
  getStaticHoistExpression,
  isLightDomHoist,
  isStaticStylesExpression,
  normalizeAuthoredProperty,
  normalizeExposeHoistExpression,
  normalizeExposePropertyToClassMethod,
  setStaticHoistsBabelTypes,
} from "../packages/babel-preset-litsx/src/internal/transform-litsx-static-hoists.js";

const traverse = babelTraverse.default || babelTraverse;
setStaticHoistsBabelTypes(t);

const callStatement = (name, args = []) => t.expressionStatement(t.callExpression(t.identifier(name), args));

function functionContext() {
  const ast = parser.parse(`
    import { css } from "lit";
    const outside = css\`:host{}\`;
    const recursive = recursive;
    function Helper() {}
    class StaticClass {}
    function DemoComponent() {
      const inside = outside;
      let mutable = outside;
      return null;
    }
  `, { sourceType: "module" });
  let fn;
  traverse(ast, { FunctionDeclaration(path) { if (path.node.id.name === "DemoComponent") fn = path; } });
  return fn;
}

describe("static hoist branch behavior", () => {
  it("recognizes light DOM and generated property macros", () => {
    assert.equal(isLightDomHoist(t.emptyStatement()), false);
    assert.equal(isLightDomHoist(callStatement("other")), false);
    assert.equal(isLightDomHoist(callStatement("__litsx_static_lightDom")), true);
    assert.equal(isLightDomHoist(callStatement("__litsx_static_lightDom", [t.booleanLiteral(true)])), true);
    assert.throws(() => isLightDomHoist(callStatement("__litsx_static_lightDom", [t.booleanLiteral(false)])), /literal value true/);

    assert.equal(getGeneratedPropertiesExpression(t.emptyStatement()), null);
    assert.equal(getGeneratedPropertiesExpression(callStatement("other", [t.objectExpression([])])), null);
    assert.equal(getGeneratedPropertiesExpression(callStatement("__litsx_static_properties")), null);
    assert.equal(getGeneratedPropertiesExpression(callStatement("__litsx_static_properties", [t.objectExpression([])])).type, "ObjectExpression");
    assert.throws(() => getGeneratedPropertiesExpression(callStatement("__litsx_static_properties", [t.arrowFunctionExpression([], t.objectExpression([]))])), /object literal/);
    assert.throws(() => getGeneratedPropertiesExpression(callStatement("__litsx_static_properties", [t.stringLiteral("x")])), /object literal/);
  });

  it("normalizes and composes authored property declarations", () => {
    const shorthandType = t.objectProperty(t.identifier("count"), t.identifier("Number"));
    const normalized = normalizeAuthoredProperty(shorthandType);
    assert.equal(normalized.value.type, "ObjectExpression");
    const untouched = normalizeAuthoredProperty(t.objectProperty(t.identifier("value"), t.stringLiteral("x")));
    assert.equal(untouched.value.type, "StringLiteral");

    const inferred = [t.objectProperty(t.identifier("count"), t.objectExpression([
      t.objectProperty(t.identifier("type"), t.identifier("String")),
    ]))];
    assert.equal(createPropertiesExpression(inferred, null).needsMergeHelper, false);
    const known = createPropertiesExpression(inferred, t.objectExpression([
      t.objectProperty(t.identifier("count"), t.objectExpression([
        t.objectProperty(t.identifier("reflect"), t.booleanLiteral(true)),
      ])),
      t.objectProperty(t.stringLiteral("title"), t.identifier("String")),
      t.objectProperty(t.numericLiteral(7), t.identifier("Boolean")),
      t.objectMethod("method", t.identifier("ignored"), [], t.blockStatement([])),
    ]));
    assert.equal(known.needsMergeHelper, false);
    assert.equal(known.expression.properties.length, 4);
    const spread = createPropertiesExpression(inferred, t.objectExpression([t.spreadElement(t.identifier("authored"))]));
    assert.equal(spread.needsMergeHelper, true);
  });

  it("classifies generated styles and generic static metadata macros", () => {
    const fn = functionContext();
    assert.equal(getGeneratedStylesExpression(t.emptyStatement()), null);
    assert.equal(getGeneratedStylesExpression(callStatement("other", [t.identifier("x")])), null);
    assert.equal(getGeneratedStylesExpression(callStatement("__litsx_static_styles_value")), null);
    assert.throws(() => getGeneratedStylesExpression(callStatement("__litsx_static_styles_value", [t.stringLiteral("x")])), /CSSResultGroup/);
    assert.throws(() => getGeneratedStylesExpression(callStatement("__litsx_static_styles_replace_value", [t.templateLiteral([t.templateElement({ raw: "x" }, true)], [])])), /CSSResultGroup/);
    assert.equal(getGeneratedStylesExpression(callStatement("__litsx_static_styles_value", [t.identifier("outside")])).inherit, true);
    assert.equal(getGeneratedStylesExpression(callStatement("__litsx_static_styles_replace_value", [t.identifier("outside")])).inherit, false);

    assert.equal(getStaticHoistExpression(t.emptyStatement(), fn), null);
    assert.equal(getStaticHoistExpression(callStatement("ordinary", []), fn), null);
    assert.equal(getStaticHoistExpression(callStatement("__litsx_static_properties", [t.objectExpression([])]), fn), null);
    assert.throws(() => getStaticHoistExpression(callStatement("__litsx_static_tagName", []), fn), /exactly one/);
    assert.throws(() => getStaticHoistExpression(callStatement("__litsx_static_expose", [t.stringLiteral("x")]), fn), /object literal/);
    assert.throws(() => getStaticHoistExpression(callStatement("__litsx_static_tagName", [t.arrowFunctionExpression([], t.stringLiteral("x"))]), fn), /direct static value/);
    assert.equal(getStaticHoistExpression(callStatement("__litsx_static_tagName", [t.stringLiteral("demo-card")]), fn).name, "tagName");
    assert.equal(getStaticHoistExpression(callStatement("__litsx_static_expose", [t.objectExpression([])]), fn).name, "expose");
  });

  it("validates expose methods in every accepted and rejected form", () => {
    const method = t.objectMethod("method", t.identifier("focus"), [], t.blockStatement([]));
    const computed = t.objectProperty(
      t.stringLiteral("value"),
      t.arrowFunctionExpression([], t.numericLiteral(1)),
      true,
    );
    const block = t.objectProperty(t.identifier("run"), t.functionExpression(null, [], t.blockStatement([]), true, true));
    assert.equal(normalizeExposeHoistExpression(t.objectExpression([])).methodsExpression.type, "ObjectExpression");
    assert.throws(() => normalizeExposeHoistExpression(t.identifier("x")), /object literal/);
    assert.equal(normalizeExposePropertyToClassMethod(method).type, "ClassMethod");
    assert.equal(normalizeExposePropertyToClassMethod(computed).body.body[0].type, "ReturnStatement");
    const blockMethod = normalizeExposePropertyToClassMethod(block);
    assert.equal(blockMethod.async, true);
    assert.equal(blockMethod.generator, true);
    assert.throws(() => normalizeExposePropertyToClassMethod(t.spreadElement(t.identifier("x"))), /spread/);
    const getter = t.objectMethod("get", t.identifier("x"), [], t.blockStatement([]));
    assert.throws(() => normalizeExposePropertyToClassMethod(getter), /plain methods/);
    assert.throws(() => normalizeExposePropertyToClassMethod(t.objectProperty(t.identifier("x"), t.numericLiteral(1))), /must be functions/);
    assert.equal(createExposeHoistMembers(t.objectExpression([method, computed])).every((entry) => entry.static), true);
  });

  it("evaluates nested static expressions and rejects dynamic bindings", () => {
    const fn = functionContext();
    const staticNodes = [
      t.classExpression(null, null, t.classBody([])), t.stringLiteral("x"), t.numericLiteral(1), t.booleanLiteral(true),
      t.nullLiteral(), t.bigIntLiteral(1n), t.unaryExpression("-", t.numericLiteral(1)),
      t.binaryExpression("+", t.stringLiteral("a"), t.stringLiteral("b")),
      t.logicalExpression("||", t.booleanLiteral(false), t.booleanLiteral(true)),
      t.conditionalExpression(t.booleanLiteral(true), t.stringLiteral("a"), t.stringLiteral("b")),
      t.arrayExpression([null, t.stringLiteral("x")]),
      t.objectExpression([t.objectProperty(t.stringLiteral("x"), t.numericLiteral(1), true)]),
      t.memberExpression(t.identifier("outside"), t.identifier("value"), false),
      t.callExpression(t.identifier("Helper"), [t.stringLiteral("x")]),
      t.taggedTemplateExpression(t.identifier("css"), t.templateLiteral([t.templateElement({ raw: "x" }, true)], [])),
      t.identifier("outside"), t.identifier("recursive"), t.identifier("Helper"), t.identifier("StaticClass"),
    ];
    for (const node of staticNodes) assert.equal(isStaticStylesExpression(node, fn), true, node.type);
    const dynamicNodes = [
      t.identifier("missing"), t.identifier("inside"), t.identifier("mutable"),
      t.arrayExpression([t.identifier("missing")]),
      t.objectExpression([t.spreadElement(t.identifier("outside"))]),
      t.callExpression(t.identifier("outside"), [t.spreadElement(t.identifier("args"))]),
      t.memberExpression(t.identifier("outside"), t.identifier("missing"), true),
      t.conditionalExpression(t.identifier("missing"), t.stringLiteral("a"), t.stringLiteral("b")),
    ];
    for (const node of dynamicNodes) assert.equal(isStaticStylesExpression(node, fn), false, node.type);
    assert.equal(containsUnsafeCssCall(null), false);
    assert.equal(containsUnsafeCssCall(t.callExpression(t.identifier("unsafeCSS"), [])), true);
    assert.equal(containsUnsafeCssCall(t.arrayExpression([t.callExpression(t.identifier("unsafeCSS"), [])])), true);
    assert.equal(containsUnsafeCssCall(t.stringLiteral("safe")), false);
  });
});
