import assert from "node:assert/strict";
import * as t from "@babel/types";
import { describe, it } from "vitest";
import {
  addNamedImport,
  attributeValueToExpression,
  buildChildrenExpression,
  createComponentElement,
  createRendererAttribute,
  registerCompatPascalName,
  setReactCompatSharedBabelTypes,
} from "../packages/babel-preset-react-compat/src/internal/react-compat-shared.js";

setReactCompatSharedBabelTypes(t);

describe("React compatibility shared helper branches", () => {
  it("registers valid compatibility names and ignores malformed requests", () => {
    const data = new Map();
    const program = {
      getData: (key) => data.get(key),
      setData: (key, value) => data.set(key, value),
    };
    registerCompatPascalName(null, "Panel");
    registerCompatPascalName(program, null);
    registerCompatPascalName(program, "");
    registerCompatPascalName(program, "Panel");
    registerCompatPascalName(program, "Boundary");
    assert.deepEqual([...data.get("__litsxCompatPascalNames")], ["Panel", "Boundary"]);
  });

  it("normalizes every authored attribute and child shape", () => {
    assert.equal(attributeValueToExpression(null).value, true);
    assert.equal(attributeValueToExpression(t.jsxExpressionContainer(t.jsxEmptyExpression())).value, true);
    assert.equal(attributeValueToExpression(t.jsxExpressionContainer(t.identifier("value"))).name, "value");
    assert.equal(attributeValueToExpression(t.stringLiteral("text")).value, "text");
    assert.equal(attributeValueToExpression(t.numericLiteral(2)).value, 2);
    assert.equal(attributeValueToExpression(t.booleanLiteral(false)).value, false);

    assert.equal(buildChildrenExpression([]), null);
    assert.equal(buildChildrenExpression([t.jsxText("   "), t.jsxExpressionContainer(t.jsxEmptyExpression())]), null);
    assert.equal(buildChildrenExpression([t.jsxExpressionContainer(t.identifier("value"))]).name, "value");
    assert.equal(buildChildrenExpression([t.jsxElement(t.jsxOpeningElement(t.jsxIdentifier("div"), [], true), null, [], true)]).type, "JSXElement");
    assert.equal(buildChildrenExpression([t.jsxFragment(t.jsxOpeningFragment(), t.jsxClosingFragment(), [])]).type, "JSXFragment");
    assert.equal(buildChildrenExpression([t.jsxText("text")]).value, "text");
    assert.equal(buildChildrenExpression([t.identifier("raw")]).name, "raw");
    assert.equal(buildChildrenExpression([t.jsxText("one"), t.jsxText("two")]).type, "JSXFragment");
    assert.equal(createRendererAttribute("render", t.identifier("fn")).name.name, ".render");
    assert.equal(createComponentElement("Panel", [], [])._marker, undefined);
    assert.equal(createComponentElement("Panel", [], [], "_marker")._marker, true);
  });

  it("adds, extends, and deduplicates named imports", () => {
    const makeProgram = (body) => ({
      get: () => body.map((node) => ({
        node,
        isImportDeclaration: () => node.type === "ImportDeclaration",
        pushContainer: (_key, value) => node.specifiers.push(value),
      })),
      unshiftContainer: (_key, value) => body.unshift(value),
    });
    const existingBody = [t.importDeclaration([], t.stringLiteral("runtime")), t.expressionStatement(t.numericLiteral(1))];
    const existing = makeProgram(existingBody);
    addNamedImport(existing, "runtime", "helper");
    addNamedImport(existing, "runtime", "helper");
    assert.equal(existingBody[0].specifiers.length, 1);
    const freshBody = [];
    addNamedImport(makeProgram(freshBody), "runtime", "helper");
    assert.equal(freshBody[0].source.value, "runtime");
  });
});
