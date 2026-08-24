import assert from "assert";
import * as t from "@babel/types";
import babelTraverse from "@babel/traverse";
import ts from "typescript";
import parser from "./helpers/litsx-parser.js";
import {
  classifyDeclaredProperty,
  classifyLocalProperty,
  getAttributeName,
  getLocalComponentFunctionPath,
  getObjectPropertyName,
  getPropertyType,
  getReactBoundaryKind,
  getRootJsxIdentifier,
  getTagName,
  getTsNode,
  getTypeOfSymbol,
  hasExplicitPrimitiveAttributeValue,
  isAttributePrimitiveType,
  isBooleanType,
  isComponentName,
  isExternalComponentRequiringRuntimeRouting,
  isInsideSvg,
  isNamespaceComponentMember,
  isPascalCaseName,
  isReactContextMember,
  jsxNameToExpression,
  nonNullableParts,
  normalizeHtmlAttributeName,
  renameAttribute,
} from "../packages/babel-preset-litsx/src/internal/transform-litsx-jsx-bindings.js";

const traverse = babelTraverse.default || babelTraverse;

function openingPaths(source) {
  const ast = parser.parse(source, { sourceType: "module" });
  const paths = [];
  traverse(ast, {
    JSXOpeningElement(path) {
      paths.push(path);
    },
  });
  return paths;
}

describe("JSX binding helper branches", () => {
  it("classifies JSX names and converts member names to expressions", () => {
    const simple = t.jsxIdentifier("Card");
    const lower = t.jsxIdentifier("div");
    const member = t.jsxMemberExpression(t.jsxIdentifier("UI"), t.jsxIdentifier("Card"));
    const nested = t.jsxMemberExpression(member, t.jsxIdentifier("Header"));

    assert.strictEqual(isPascalCaseName("Card"), true);
    assert.strictEqual(isPascalCaseName("card"), false);
    assert.strictEqual(isPascalCaseName(null), false);
    assert.strictEqual(isComponentName(simple, t), true);
    assert.strictEqual(isComponentName(lower, t), false);
    assert.strictEqual(isComponentName(member, t), true);
    assert.strictEqual(getRootJsxIdentifier(nested, t), "UI");
    assert.strictEqual(getRootJsxIdentifier(t.jsxNamespacedName(t.jsxIdentifier("x"), t.jsxIdentifier("y")), t), null);
    assert.strictEqual(jsxNameToExpression(simple, t).name, "Card");
    assert.strictEqual(jsxNameToExpression(nested, t).object.object.name, "UI");
    assert.strictEqual(jsxNameToExpression(t.stringLiteral("bad"), t), null);
    assert.strictEqual(getTagName(simple, t), "Card");
    assert.strictEqual(getTagName(member, t), null);
  });

  it("normalizes ordinary, namespaced, virtual, and invalid attributes", () => {
    const ordinary = t.jsxAttribute(t.jsxIdentifier("className"), t.stringLiteral("x"));
    const namespaced = t.jsxAttribute(
      t.jsxNamespacedName(t.jsxIdentifier("on"), t.jsxIdentifier("save")),
      null
    );
    assert.strictEqual(getAttributeName(ordinary, t), "className");
    assert.strictEqual(getAttributeName(namespaced, t), "on:save");
    assert.strictEqual(getAttributeName(t.stringLiteral("bad"), t), null);
    assert.strictEqual(
      getAttributeName({ type: "JSXAttribute", name: t.stringLiteral("bad") }, t),
      null
    );
    assert.strictEqual(normalizeHtmlAttributeName("htmlFor"), "for");
    assert.strictEqual(normalizeHtmlAttributeName("TITLE"), "title");
    renameAttribute(ordinary, ".value", t);
    assert.strictEqual(ordinary.name.name, ".value");
  });

  it("tracks SVG ancestry and foreignObject boundaries", () => {
    const paths = openingPaths(`
      const view = <div><svg><circle /><foreignObject><div /></foreignObject></svg></div>;
    `);
    const byName = new Map(paths.map((path) => [path.node.name.name, path]));
    assert.strictEqual(isInsideSvg(byName.get("circle"), t), true);
    assert.strictEqual(isInsideSvg(byName.get("foreignObject"), t), false);
    assert.strictEqual(isInsideSvg(byName.get("div"), t), false);
    assert.strictEqual(isInsideSvg({ parentPath: null }, t), false);
  });

  it("handles TypeScript spans and resilient symbol lookup", () => {
    const resolver = { getNodeAtSpan: (start, end) => ({ start, end }) };
    assert.deepStrictEqual(getTsNode(resolver, { start: 2, end: 5 }), { start: 2, end: 5 });
    assert.strictEqual(getTsNode(null, { start: 2, end: 5 }), null);
    assert.strictEqual(getTsNode(resolver, { start: "2", end: 5 }), null);

    const checker = {
      getTypeOfSymbolAtLocation: (symbol, location) => ({ symbol, location }),
    };
    const declaration = { kind: "value" };
    assert.strictEqual(getTypeOfSymbol(checker, null, {}), null);
    assert.strictEqual(getTypeOfSymbol(checker, { valueDeclaration: declaration }, {}).location, declaration);
    const fallback = { kind: "fallback" };
    assert.strictEqual(getTypeOfSymbol(checker, { declarations: [fallback] }, {}).location, fallback);
    assert.strictEqual(getTypeOfSymbol({ getTypeOfSymbolAtLocation() { throw new Error("no"); } }, {}, {}), null);
    assert.strictEqual(getPropertyType({ checker }, null, "x", {}), null);
    assert.strictEqual(
      getPropertyType({ checker: { ...checker, getPropertyOfType: () => ({}) } }, {}, "x", {}).symbol != null,
      true
    );
  });

  it("classifies nullable boolean and primitive TypeScript types", () => {
    const boolean = { flags: ts.TypeFlags.BooleanLike };
    const string = { flags: ts.TypeFlags.StringLike };
    const number = { flags: ts.TypeFlags.NumberLike };
    const object = { flags: ts.TypeFlags.Object };
    const nil = { flags: ts.TypeFlags.Null };
    const union = { isUnion: () => true, types: [string, nil, number] };
    const checker = { getNonNullableType: (type) => type };
    const throwingChecker = { getNonNullableType() { throw new Error("no"); } };

    assert.deepStrictEqual(nonNullableParts(union, checker, ts), [string, number]);
    assert.deepStrictEqual(nonNullableParts(boolean, throwingChecker, ts), [boolean]);
    assert.strictEqual(isBooleanType(null, checker), false);
    assert.strictEqual(isBooleanType(boolean, checker), true);
    assert.strictEqual(isBooleanType(union, checker), false);
    assert.strictEqual(isAttributePrimitiveType(null, checker), false);
    assert.strictEqual(isAttributePrimitiveType(union, checker), true);
    assert.strictEqual(isAttributePrimitiveType({ isUnion: () => true, types: [string, object] }, checker), false);
    assert.strictEqual(classifyDeclaredProperty(boolean, checker), "boolean");
    assert.strictEqual(classifyDeclaredProperty(string, checker), "attribute");
    assert.strictEqual(classifyDeclaredProperty(object, checker), "property");
  });

  it("recognizes explicit primitive JSX values and checker failures", () => {
    const literal = t.jsxAttribute(t.jsxIdentifier("value"), t.stringLiteral("x"));
    const bare = t.jsxAttribute(t.jsxIdentifier("disabled"), null);
    const expression = t.jsxAttribute(
      t.jsxIdentifier("value"),
      t.jsxExpressionContainer(Object.assign(t.identifier("value"), { start: 1, end: 6 }))
    );
    assert.strictEqual(hasExplicitPrimitiveAttributeValue(literal, null, t), true);
    assert.strictEqual(hasExplicitPrimitiveAttributeValue(bare, null, t), false);
    assert.strictEqual(hasExplicitPrimitiveAttributeValue(expression, null, t), false);
    const resolver = {
      getNodeAtSpan: () => ({}),
      checker: {
        getTypeAtLocation: () => ({ flags: ts.TypeFlags.StringLike }),
        getNonNullableType: (type) => type,
      },
    };
    assert.strictEqual(hasExplicitPrimitiveAttributeValue(expression, resolver, t), true);
    resolver.checker.getTypeAtLocation = () => { throw new Error("no"); };
    assert.strictEqual(hasExplicitPrimitiveAttributeValue(expression, resolver, t), false);
  });

  it("classifies local property declaration shapes", () => {
    const property = (name, value) => t.objectProperty(t.identifier(name), value);
    assert.strictEqual(getObjectPropertyName(property("title", t.identifier("String")), t), "title");
    assert.strictEqual(getObjectPropertyName(t.objectProperty(t.stringLiteral("aria-label"), t.identifier("String")), t), "aria-label");
    assert.strictEqual(getObjectPropertyName(t.spreadElement(t.identifier("rest")), t), null);
    assert.strictEqual(classifyLocalProperty(property("x", t.identifier("String")), t), "property");
    assert.strictEqual(
      classifyLocalProperty(property("x", t.objectExpression([property("attribute", t.booleanLiteral(false))])), t),
      "property"
    );
    assert.strictEqual(
      classifyLocalProperty(property("x", t.objectExpression([property("type", t.identifier("Boolean"))])), t),
      "boolean"
    );
    assert.strictEqual(
      classifyLocalProperty(property("x", t.objectExpression([property("type", t.identifier("Number"))])), t),
      "attribute"
    );
    assert.strictEqual(
      classifyLocalProperty(property("x", t.objectExpression([property("type", t.identifier("Object"))])), t),
      "property"
    );
  });

  it("resolves React boundaries, contexts, namespaces, and external imports", () => {
    const paths = openingPaths(`
      import { Suspense as Wait, SuspenseList as List } from "react";
      import React from "react";
      import * as UI from "./ui.js";
      import External from "external-package";
      import Core from "@litsx/core";
      const Local = () => <div />;
      const Ctx = {};
      const view = <><Wait /><List /><React.Suspense /><UI.Card /><External /><Core /><Local /><Ctx.Provider /></>;
    `);
    const find = (name) => paths.find((path) => {
      const node = path.node.name;
      return t.isJSXIdentifier(node) ? node.name === name : node.property.name === name;
    });

    assert.strictEqual(getReactBoundaryKind(find("Wait"), find("Wait").node.name, t), "Suspense");
    assert.strictEqual(getReactBoundaryKind(find("List"), find("List").node.name, t), "SuspenseList");
    assert.strictEqual(getReactBoundaryKind(find("Suspense"), find("Suspense").node.name, t), "Suspense");
    assert.strictEqual(getReactBoundaryKind(find("Card"), find("Card").node.name, t), null);
    assert.strictEqual(isNamespaceComponentMember(find("Card"), find("Card").node.name, t), true);
    assert.strictEqual(isNamespaceComponentMember(find("Wait"), find("Wait").node.name, t), false);
    assert.strictEqual(isReactContextMember(find("Provider"), find("Provider").node.name, t), true);
    assert.strictEqual(isReactContextMember(find("Card"), find("Card").node.name, t), false);
    assert.strictEqual(isExternalComponentRequiringRuntimeRouting(find("External"), find("External").node.name, t), true);
    assert.strictEqual(isExternalComponentRequiringRuntimeRouting(find("Core"), find("Core").node.name, t), false);
    assert.strictEqual(isExternalComponentRequiringRuntimeRouting(find("Local"), find("Local").node.name, t), false);
    assert.ok(getLocalComponentFunctionPath(find("Local"), find("Local").node.name, t));
    assert.strictEqual(getLocalComponentFunctionPath(find("Card"), find("Card").node.name, t), null);
  });
});
