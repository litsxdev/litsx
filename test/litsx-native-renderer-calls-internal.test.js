import assert from "assert";
import * as t from "@babel/types";
import babelTraverse from "@babel/traverse";
import parser from "../packages/babel-parser-litsx/src/index.js";
import {
  setRendererCallsBabelTypes,
  transformJSXRendererCalls,
} from "../packages/babel-preset-litsx/src/internal/transform-litsx-renderer-calls.js";

const traverse = babelTraverse.default || babelTraverse;

function getJSXPath(source) {
  const ast = parser.parse(source, { sourceType: "module" });
  let jsxPath;

  traverse(ast, {
    JSXElement(path) {
      if (!jsxPath) {
        jsxPath = path;
      }
    },
  });

  return jsxPath;
}

describe("native renderer-call internals", () => {
  beforeAll(() => {
    setRendererCallsBabelTypes(t);
  });

  it("rewrites prop-backed identifier and props member calls inside JSX", () => {
    const jsxPath = getJSXPath(`
      function Card() {
        return (
          <section>
            {header()}
            {contentRenderer(label)}
            {localOnly()}
            {props.header()}
            {props["header"]()}
            {slotRenderer()}
          </section>
        );
      }
    `);

    const bindings = new Map([
      ["header", "header"],
      ["contentRenderer", { bindKey: "contentRenderer" }],
      ["props", { bindKey: "props" }],
      ["slotRenderer", {}],
    ]);
    const state = {};

    transformJSXRendererCalls(jsxPath, bindings, state);

    const expressions = jsxPath.node.children
      .filter((child) => child.type === "JSXExpressionContainer")
      .map((child) => child.expression);

    assert.strictEqual(state.__litsxNeedsRendererCallImport, true);

    assert.strictEqual(expressions[0].callee.name, "renderRendererCall");
    assert.strictEqual(expressions[0].arguments[0].object.type, "ThisExpression");
    assert.strictEqual(expressions[0].arguments[0].property.name, "header");

    assert.strictEqual(expressions[1].callee.name, "renderRendererCall");
    assert.strictEqual(expressions[1].arguments[0].object.type, "ThisExpression");
    assert.strictEqual(expressions[1].arguments[0].property.name, "contentRenderer");
    assert.strictEqual(expressions[1].arguments[1].name, "label");

    assert.strictEqual(expressions[2].callee.name, "localOnly");

    assert.strictEqual(expressions[3].callee.name, "renderRendererCall");
    assert.strictEqual(expressions[3].arguments[0].object.object.type, "ThisExpression");
    assert.strictEqual(expressions[3].arguments[0].object.property.name, "props");
    assert.strictEqual(expressions[3].arguments[0].property.name, "header");

    assert.strictEqual(expressions[4].callee.type, "MemberExpression");
    assert.strictEqual(expressions[4].callee.computed, true);

    assert.strictEqual(expressions[5].callee.name, "renderRendererCall");
    assert.strictEqual(expressions[5].arguments[0].type, "Identifier");
    assert.strictEqual(expressions[5].arguments[0].name, "slotRenderer");
  });

  it("leaves non-call JSX expressions untouched when no state bucket is provided", () => {
    const jsxPath = getJSXPath(`
      function Card() {
        return <section>{title}{count + 1}</section>;
      }
    `);

    transformJSXRendererCalls(jsxPath, new Map([["title", "title"]]));

    const expressions = jsxPath.node.children
      .filter((child) => child.type === "JSXExpressionContainer")
      .map((child) => child.expression);

    assert.strictEqual(expressions[0].type, "Identifier");
    assert.strictEqual(expressions[0].name, "title");
    assert.strictEqual(expressions[1].type, "BinaryExpression");
  });
});
