import assert from "assert";
import * as t from "@babel/types";
import babelTraverse from "@babel/traverse";
import parser from "./helpers/litsx-parser.js";
import {
  replaceParamReferences,
  setParamRewriteBabelTypes,
  transformJSXExpressions,
} from "../packages/babel-preset-litsx/src/internal/transform-litsx-param-rewrites.js";

const traverse = babelTraverse.default || babelTraverse;

function getPaths(source) {
  const ast = parser.parse(source, { sourceType: "module" });
  let programPath;
  let functionPath;
  let jsxPath;

  traverse(ast, {
    Program(path) {
      programPath = path;
    },
    FunctionDeclaration(path) {
      if (!functionPath) {
        functionPath = path;
      }
    },
    JSXElement(path) {
      if (!jsxPath) {
        jsxPath = path;
      }
    },
  });

  return { ast, programPath, functionPath, jsxPath };
}

describe("native param rewrite internals", () => {
  beforeAll(() => {
    setParamRewriteBabelTypes(t);
  });

  it("rewrites JSX expression identifiers bound to props and leaves others intact", () => {
    const { jsxPath } = getPaths(`
      function Card() {
        return <section>{title}{count}{localOnly}</section>;
      }
    `);

    const bindings = new Map([
      ["title", "title"],
      ["count", "count"],
    ]);

    transformJSXExpressions(jsxPath, bindings);

    const expressions = jsxPath.node.children
      .filter((child) => child.type === "JSXExpressionContainer")
      .map((child) => child.expression);

    assert.strictEqual(expressions[0].object.type, "ThisExpression");
    assert.strictEqual(expressions[0].property.name, "title");
    assert.strictEqual(expressions[1].object.type, "ThisExpression");
    assert.strictEqual(expressions[1].property.name, "count");
    assert.strictEqual(expressions[2].type, "Identifier");
    assert.strictEqual(expressions[2].name, "localOnly");
  });

  it("lowers direct children expressions to a default slot", () => {
    const directChildren = getPaths(`
      function Panel({ children }) {
        return <section>{children}</section>;
      }
    `);

    transformJSXExpressions(directChildren.jsxPath, new Map([["children", "children"]]));

    assert.strictEqual(directChildren.jsxPath.node.children[0].type, "JSXElement");
    assert.strictEqual(directChildren.jsxPath.node.children[0].openingElement.name.name, "slot");

    const propsChildren = getPaths(`
      function Panel(props) {
        return <section>{props.children}</section>;
      }
    `);

    transformJSXExpressions(
      propsChildren.jsxPath,
      new Map([
        [
          "props",
          {
            kind: "alias",
            properties: new Map([
              ["children", "children"],
            ]),
          },
        ],
      ])
    );

    assert.strictEqual(propsChildren.jsxPath.node.children[0].type, "JSXElement");
    assert.strictEqual(propsChildren.jsxPath.node.children[0].openingElement.name.name, "slot");
  });

  it("does not validate duplicate implicit children projection during raw JSX slot lowering", () => {
    const { jsxPath } = getPaths(`
      function Panel({ children, props }) {
        return <section>{children}{props.children}</section>;
      }
    `);

    const bindings = new Map([
      ["children", "children"],
      [
        "props",
        {
          kind: "alias",
          properties: new Map([
            ["children", "children"],
          ]),
        },
      ],
    ]);

    transformJSXExpressions(jsxPath, bindings);

    assert.strictEqual(jsxPath.node.children[0].openingElement.name.name, "slot");
    assert.strictEqual(jsxPath.node.children[1].openingElement.name.name, "slot");
  });

  it("captures nested non-arrow references and rewrites alias members, shorthand objects, and JSX attributes", () => {
    const { functionPath } = getPaths(`
      function Card(props) {
        const alias = props;
        const { title: heading = "Untitled", count } = alias;
        const meta = { heading, count };
        const direct = title;
        function project() {
          return heading + count + props.title;
        }
        const arrowProject = () => heading + props.count;
        return <Widget label={heading} amount={count} summary={direct} total={props.count} />;
      }
    `);

    const bindings = new Map([
      [
        "props",
        {
          kind: "alias",
          properties: new Map([
            ["title", "title"],
            ["count", "count"],
          ]),
        },
      ],
      ["title", "title"],
      ["count", "count"],
    ]);

    const captured = replaceParamReferences(
      functionPath,
      bindings,
      new Map([
        ["title", true],
        ["count", true],
      ])
    );

    assert.strictEqual(captured.length, 2);
    const declarations = captured.map((entry) => entry.declarations[0]);
    const capturedNames = declarations.map((entry) => entry.id.name).sort();
    assert.strictEqual(capturedNames.length, 2);
    assert.ok(capturedNames.every((name) => name.startsWith("_")));
    assert.deepStrictEqual(
      declarations.map((entry) => entry.init.property.name).sort(),
      ["count", "title"]
    );

    const body = functionPath.node.body.body;
    const metaDeclaration = body.find(
      (statement) =>
        statement.type === "VariableDeclaration" &&
        statement.declarations[0].id.name === "meta"
    );
    const metaProperties = metaDeclaration.declarations[0].init.properties;
    assert.strictEqual(metaProperties[0].shorthand, false);
    assert.strictEqual(metaProperties[0].value.object.type, "ThisExpression");
    assert.strictEqual(metaProperties[0].value.property.name, "title");
    assert.strictEqual(metaProperties[1].shorthand, false);
    assert.strictEqual(metaProperties[1].value.object.type, "ThisExpression");
    assert.strictEqual(metaProperties[1].value.property.name, "count");

    const directDeclaration = body.find(
      (statement) =>
        statement.type === "VariableDeclaration" &&
        statement.declarations[0].id.name === "direct"
    );
    assert.strictEqual(directDeclaration.declarations[0].init.type, "Identifier");
    assert.strictEqual(directDeclaration.declarations[0].init.name, "title");

    const projectFunction = body.find(
      (statement) => statement.type === "FunctionDeclaration" && statement.id.name === "project"
    );
    const projectReturn = projectFunction.body.body[0].argument;
    assert.strictEqual(projectReturn.left.left.name.startsWith("_"), true);
    assert.strictEqual(projectReturn.left.right.name.startsWith("_"), true);
    assert.strictEqual(projectReturn.right.name.startsWith("_"), true);

    const arrowDeclaration = body.find(
      (statement) =>
        statement.type === "VariableDeclaration" &&
        statement.declarations[0].id.name === "arrowProject"
    );
    const arrowReturn = arrowDeclaration.declarations[0].init.body;
    assert.strictEqual(arrowReturn.left.object.type, "ThisExpression");
    assert.strictEqual(arrowReturn.left.property.name, "title");
    assert.strictEqual(arrowReturn.right.object.type, "ThisExpression");
    assert.strictEqual(arrowReturn.right.property.name, "count");

    const returnElement = body[body.length - 1].argument.openingElement.attributes;
    const labels = Object.fromEntries(
      returnElement.map((attribute) => [
        attribute.name.name,
        attribute.value.expression,
      ])
    );
    assert.strictEqual(labels.label.object.type, "ThisExpression");
    assert.strictEqual(labels.label.property.name, "title");
    assert.strictEqual(labels.amount.object.type, "ThisExpression");
    assert.strictEqual(labels.amount.property.name, "count");
    assert.strictEqual(labels.summary.object.type, "ThisExpression");
    assert.strictEqual(labels.summary.property.name, "title");
    assert.strictEqual(labels.total.object.type, "ThisExpression");
    assert.strictEqual(labels.total.property.name, "count");
  });

  it("materializes bare props alias references as prop snapshots", () => {
    const { functionPath } = getPaths(`
      function Card(props) {
        console.log("Card props:", props);
        return props.title;
      }
    `);

    const bindings = new Map([
      [
        "props",
        {
          kind: "alias",
          properties: new Map([
            ["title", "title"],
            ["count", "count"],
          ]),
        },
      ],
    ]);

    const captured = replaceParamReferences(
      functionPath,
      bindings,
      new Map([
        ["title", true],
        ["count", true],
      ])
    );
    assert.deepStrictEqual(captured, []);

    const consoleArg = functionPath.node.body.body[0].expression.arguments[1];
    assert.strictEqual(consoleArg.type, "ObjectExpression");
    assert.deepStrictEqual(
      consoleArg.properties.map((property) => property.key.name),
      ["count", "title"]
    );
    assert.strictEqual(consoleArg.properties[0].value.object.type, "ThisExpression");
    assert.strictEqual(consoleArg.properties[0].value.property.name, "count");
    assert.strictEqual(consoleArg.properties[1].value.object.type, "ThisExpression");
    assert.strictEqual(consoleArg.properties[1].value.property.name, "title");

    const returnArgument = functionPath.node.body.body[1].argument;
    assert.strictEqual(returnArgument.object.type, "ThisExpression");
    assert.strictEqual(returnArgument.property.name, "title");
  });

  it("skips computed member properties and unsupported alias member reads", () => {
    const { functionPath } = getPaths(`
      function Card(props) {
        const alias = props;
        const name = alias[dynamicKey];
        const untouched = alias.missing;
        return name + untouched;
      }
    `);

    const bindings = new Map([
      [
        "props",
        {
          kind: "alias",
          properties: new Map([["title", "title"]]),
        },
      ],
      [
        "alias",
        {
          kind: "alias",
          properties: new Map([["title", "title"]]),
        },
      ],
    ]);

    const captured = replaceParamReferences(functionPath, bindings);
    assert.deepStrictEqual(captured, []);

    const body = functionPath.node.body.body;
    const nameInit = body[1].declarations[0].init;
    const untouchedInit = body[2].declarations[0].init;

    assert.strictEqual(nameInit.object.object.type, "ThisExpression");
    assert.strictEqual(nameInit.object.property.name, "alias");
    assert.strictEqual(nameInit.computed, true);
    assert.strictEqual(untouchedInit.object.object.type, "ThisExpression");
    assert.strictEqual(untouchedInit.object.property.name, "alias");
    assert.strictEqual(untouchedInit.property.name, "missing");
  });
});
