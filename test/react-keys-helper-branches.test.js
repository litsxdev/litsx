import assert from "node:assert/strict";
import * as t from "@babel/types";
import babelTraverse from "@babel/traverse";
import parser from "./helpers/litsx-parser.js";
import {
  addDirectiveImport,
  attributeValueToExpression,
  chooseLocalName,
  findExistingImport,
  getKeyAttribute,
  getMapParts,
  getReturnedElement,
  isInsideMapCallback,
  isMapCall,
  lowerMapParts,
  removeAttribute,
  wrapForJsxParent,
} from "../packages/babel-preset-react-compat/src/internal/react-keys.js";

const traverse = babelTraverse.default || babelTraverse;

function paths(source) {
  const ast = parser.parse(source, { sourceType: "module" });
  let programPath;
  const elements = [];
  traverse(ast, {
    Program(path) { programPath = path; },
    JSXElement(path) { elements.push(path); },
  });
  return { ast, programPath, elements };
}

describe("React key helper branches", () => {
  it("finds, converts, and removes key attributes", () => {
    const element = t.jsxElement(
      t.jsxOpeningElement(t.jsxIdentifier("li"), [
        t.jsxAttribute(t.jsxIdentifier("title"), t.stringLiteral("x")),
        t.jsxAttribute(t.jsxIdentifier("key"), null),
      ], true), null, [], true
    );
    const key = getKeyAttribute(element, t);
    assert.equal(attributeValueToExpression(key, t).value, true);
    key.value = t.jsxExpressionContainer(t.jsxEmptyExpression());
    assert.equal(attributeValueToExpression(key, t).value, true);
    key.value = t.jsxExpressionContainer(t.identifier("id"));
    assert.equal(attributeValueToExpression(key, t).name, "id");
    key.value = t.stringLiteral("literal");
    assert.equal(attributeValueToExpression(key, t).value, "literal");
    removeAttribute(element, key);
    removeAttribute(element, key);
    assert.equal(getKeyAttribute(element, t), null);
    assert.equal(getKeyAttribute(t.identifier("x"), t), null);
  });

  it("recognizes only non-optional direct map calls", () => {
    const call = t.callExpression(t.memberExpression(t.identifier("items"), t.identifier("map")), []);
    assert.equal(isMapCall(call, t), true);
    call.optional = true;
    assert.equal(isMapCall(call, t), false);
    call.optional = false;
    call.callee.optional = true;
    assert.equal(isMapCall(call, t), false);
    call.callee.optional = false;
    call.callee.computed = true;
    assert.equal(isMapCall(call, t), false);
    assert.equal(isMapCall(t.identifier("map"), t), false);
  });

  it("extracts expression and terminal block returns", () => {
    const element = t.jsxElement(t.jsxOpeningElement(t.jsxIdentifier("li"), [], true), null, [], true);
    assert.equal(getReturnedElement(t.arrowFunctionExpression([], element), t).element, element);
    const onlyReturn = t.arrowFunctionExpression([], t.blockStatement([t.returnStatement(element)]));
    assert.equal(getReturnedElement(onlyReturn, t).returnStatement, null);
    const decorated = t.arrowFunctionExpression([], t.blockStatement([t.expressionStatement(t.stringLiteral("x")), t.returnStatement(element)]));
    assert.equal(getReturnedElement(decorated, t).returnStatement.type, "ReturnStatement");
    assert.equal(getReturnedElement(t.arrowFunctionExpression([], t.blockStatement([])), t), null);
    assert.equal(getReturnedElement(t.arrowFunctionExpression([], t.blockStatement([t.returnStatement(t.identifier("x"))])), t), null);
  });

  it("validates map callback shapes and lowers both return forms", () => {
    const parseExpression = (source) => parser.parseExpression(source, { plugins: ["jsx"] });
    const concise = getMapParts(parseExpression("items.map((item) => <li key={item.id}>{item.name}</li>)"), t);
    assert.ok(concise);
    const state = { repeatNeeded: false, repeatLocalName: "repeat" };
    const lowered = lowerMapParts(concise, state, t);
    assert.equal(lowered.callee.name, "repeat");
    assert.equal(state.repeatNeeded, true);
    assert.equal(getKeyAttribute(concise.element, t), null);

    const block = getMapParts(parseExpression("items.map(function (item, index) { const id = item.id; return <li key={id}>{index}</li>; })"), t);
    assert.equal(lowerMapParts(block, { repeatNeeded: false, repeatLocalName: "repeat" }, t).arguments[0].callee.property.name, "map");
    assert.equal(getMapParts(parseExpression("items.filter((item) => <li key={item.id} />)"), t), null);
    assert.equal(getMapParts(parseExpression("items.map(a, b)"), t), null);
    assert.equal(getMapParts(parseExpression("items.map(async (item) => <li key={item.id} />)"), t), null);
    assert.equal(getMapParts(parseExpression("items.map((a, b, c) => <li key={a} />)"), t), null);
    assert.equal(getMapParts(parseExpression("items.map((item) => <li />)"), t), null);
  });

  it("detects JSX elements inside map callbacks", () => {
    const { elements } = paths(`const view = items.map((item) => <li key={item.id} />); const other = <div />;`);
    assert.equal(isInsideMapCallback(elements.find((path) => path.node.openingElement.name.name === "li"), t), true);
    assert.equal(isInsideMapCallback(elements.find((path) => path.node.openingElement.name.name === "div"), t), false);
  });

  it("finds, chooses, and adds directive imports", () => {
    const { programPath } = paths(`import { repeat as existing } from "lit/directives/repeat.js"; const keyed = 1;`);
    assert.equal(findExistingImport(programPath, "lit/directives/repeat.js", "repeat", t), "existing");
    assert.equal(findExistingImport(programPath, "other", "repeat", t), null);
    assert.equal(chooseLocalName(programPath, "lit/directives/repeat.js", "repeat", t), "existing");
    assert.notEqual(chooseLocalName(programPath, "lit/directives/keyed.js", "keyed", t), "keyed");
    addDirectiveImport(programPath, "lit/directives/repeat.js", "repeat", "again", t);
    addDirectiveImport(programPath, "lit/directives/repeat.js", "other", "other", t);
    addDirectiveImport(programPath, "lit/directives/keyed.js", "keyed", "localKeyed", t);
    assert.equal(programPath.node.body.filter((node) => node.type === "ImportDeclaration").length, 2);
  });

  it("wraps expressions only for JSX parents", () => {
    const expression = t.identifier("value");
    assert.equal(wrapForJsxParent({ parentPath: { isJSXElement: () => true } }, expression, t).type, "JSXExpressionContainer");
    assert.equal(wrapForJsxParent({ parentPath: { isJSXElement: () => false, isJSXFragment: () => true } }, expression, t).type, "JSXExpressionContainer");
    assert.strictEqual(wrapForJsxParent({ parentPath: null }, expression, t), expression);
  });
});
