import assert from "node:assert/strict";
import babelTraverse from "@babel/traverse";
import * as t from "@babel/types";
import { describe, it } from "vitest";
import parser from "./helpers/litsx-parser.js";
import {
  HOST_TYPE_CUSTOM,
  HOST_TYPE_RENDER,
  findCurrentCallPath,
  getFunctionName,
  isCustomHookFunction,
  resolveHostInfo,
} from "../packages/babel-plugin-shared-hooks/src/custom-hook-host.js";

const traverse = babelTraverse.default || babelTraverse;

function inspect(source) {
  const ast = parser.parse(source, { sourceType: "module", plugins: ["jsx"] });
  let programPath;
  const functions = [];
  const calls = [];
  traverse(ast, {
    Program(path) { programPath = path; },
    Function(path) { functions.push(path); },
    CallExpression(path) { calls.push(path); },
  });
  return { ast, programPath, functions, calls };
}

describe("custom hook host branch behavior", () => {
  it("derives function names from declarations and variable-bound callbacks", () => {
    const sample = inspect("function useDeclared() {} const useArrow = () => {}; const useExpression = function () {}; ({ method() {} });");
    assert.equal(getFunctionName(sample.functions[0], t), "useDeclared");
    assert.equal(getFunctionName(sample.functions[1], t), "useArrow");
    assert.equal(getFunctionName(sample.functions[2], t), "useExpression");
    assert.equal(getFunctionName(sample.functions[3], t), null);
    assert.equal(getFunctionName({
      isFunctionDeclaration: () => true,
      isFunctionExpression: () => false,
      isArrowFunctionExpression: () => false,
      node: { id: null },
    }, t), null);
    assert.equal(isCustomHookFunction(sample.functions[0], t), true);
    assert.equal(isCustomHookFunction(inspect("function user() {}").functions[0], t), false);
    assert.equal(isCustomHookFunction(inspect("function use2() {}").functions[0], t), true);
  });

  it("resolves direct render, custom-hook, ordinary, and top-level calls", () => {
    const render = inspect("class View { render() { return useState(0); } other() { return useState(1); } }");
    const renderInfo = resolveHostInfo(render.calls[0], t);
    assert.equal(renderInfo.type, HOST_TYPE_RENDER);
    assert.equal(renderInfo.expression.type, "ThisExpression");
    assert.equal(resolveHostInfo(render.calls[1], t), null);

    const custom = inspect("function useFeature() { return useState(0); } function ordinary() { return useState(1); } useState(2);");
    const customInfo = resolveHostInfo(custom.calls[0], t);
    assert.equal(customInfo.type, HOST_TYPE_CUSTOM);
    assert.equal(customInfo.expression, null);
    assert.equal(resolveHostInfo(custom.calls[1], t), null);
    assert.equal(resolveHostInfo(custom.calls[2], t), null);
  });

  it("recognizes only the canonical soft-suspense render wrapper", () => {
    const valid = inspect("class View { render() { return renderWithHooks(this, () => useState(0)); } }");
    const info = resolveHostInfo(valid.calls.find((path) => path.get("callee").isIdentifier({ name: "useState" })), t);
    assert.equal(info.type, HOST_TYPE_RENDER);

    for (const source of [
      "class View { other() { return renderWithHooks(this, () => useState(0)); } }",
      "class View { render() { return renderWithHooks(host, () => useState(0)); } }",
      "class View { render() { return other(this, () => useState(0)); } }",
      "class View { render() { return renderWithHooks(this, function () { return useState(0); }); } }",
    ]) {
      const sample = inspect(source);
      const call = sample.calls.find((path) => path.get("callee").isIdentifier({ name: "useState" }));
      assert.equal(resolveHostInfo(call, t), null);
    }
  });

  it("recovers current call paths by identity or stable source positions", () => {
    const sample = inspect("function run() { first(); second(); }");
    const first = sample.calls[0];
    assert.equal(findCurrentCallPath(null, first), first);
    assert.equal(findCurrentCallPath(sample.programPath, null), null);
    assert.equal(findCurrentCallPath(sample.programPath, first), first);

    const clone = t.cloneNode(first.node, true);
    clone.start = first.node.start;
    clone.end = first.node.end;
    assert.equal(findCurrentCallPath(sample.programPath, { node: clone }).node, first.node);

    const missing = t.callExpression(t.identifier("missing"), []);
    missing.start = 9999;
    missing.end = 10006;
    assert.equal(findCurrentCallPath(sample.programPath, { node: missing }), null);

    const withoutLocations = t.cloneNode(first.node, true);
    withoutLocations.start = null;
    withoutLocations.end = null;
    assert.equal(findCurrentCallPath(sample.programPath, { node: withoutLocations }), null);
  });
});
