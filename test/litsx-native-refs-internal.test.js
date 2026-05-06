import assert from "assert";
import * as t from "@babel/types";
import babelTraverse from "@babel/traverse";
import parser from "../packages/babel-parser-litsx/src/index.js";
import {
  createComponentInstanceRefSyncStatement,
  hasRefProp,
  lowerForwardedElementRefs,
  setRefsBabelTypes,
} from "../packages/babel-preset-litsx/src/internal/transform-litsx-refs.js";

const traverse = babelTraverse.default || babelTraverse;

function getFunctionPath(source) {
  const ast = parser.parse(source, { sourceType: "module" });
  let functionPath;

  traverse(ast, {
    FunctionDeclaration(path) {
      if (!functionPath) {
        functionPath = path;
      }
    },
    VariableDeclarator(path) {
      if (!functionPath) {
        const initPath = path.get("init");
        if (initPath.isArrowFunctionExpression() || initPath.isFunctionExpression()) {
          functionPath = initPath;
        }
      }
    },
  });

  return functionPath;
}

describe("native refs internals", () => {
  beforeAll(() => {
    setRefsBabelTypes(t);
  });

  it("detects ref props across object, assignment, and identifier params", () => {
    const destructured = getFunctionPath(`
      const Card = ({ ref, title }) => <section>{title}</section>;
    `);
    assert.strictEqual(hasRefProp(destructured), true);

    const assignment = getFunctionPath(`
      const Card = ({ "ref": forwardedRef } = {}) => <input ref={forwardedRef} />;
    `);
    assert.strictEqual(hasRefProp(assignment), true);

    const identifier = getFunctionPath(`
      function Card(props) {
        return <Widget ref={props.ref} />;
      }
    `);
    assert.strictEqual(hasRefProp(identifier), true);

    const noRef = getFunctionPath(`
      function Card(props) {
        return <Widget ref={props.other} />;
      }
    `);
    assert.strictEqual(hasRefProp(noRef), false);
  });

  it("lowers only standard forwarded element refs and leaves other ref shapes untouched", () => {
    const functionPath = getFunctionPath(`
      function Card() {
        return (
          <section>
            <input ref={this.ref} />
            <textarea ref={this.ref} />
            <my-input ref={this.ref} />
            <FancyInput ref={this.ref} />
            <button ref={otherRef} />
          </section>
        );
      }
    `);

    const statements = lowerForwardedElementRefs(functionPath, "ref");
    assert.strictEqual(statements.length, 2);

    const callbackCalls = statements.map((statement) => statement.expression);
    assert.ok(
      callbackCalls.every(
        (call) =>
          call.callee.name === "useCallbackRef" &&
          call.arguments[0].type === "ThisExpression"
      )
    );

    const attributes = functionPath.node.body.body[0].argument.children
      .filter((child) => child.type === "JSXElement")
      .map((element) => ({
        name: element.openingElement.name.name,
        attrs: element.openingElement.attributes,
      }));

    const inputRef = attributes[0].attrs.find((attr) => attr.name.name === "data-ref");
    const textareaRef = attributes[1].attrs.find((attr) => attr.name.name === "data-ref");
    assert.ok(inputRef.value.value.startsWith("_refElement"));
    assert.ok(textareaRef.value.value.startsWith("_refElement"));
    assert.notStrictEqual(inputRef.value.value, textareaRef.value.value);

    assert.strictEqual(
      attributes[2].attrs.some((attr) => attr.name.name === "ref"),
      true
    );
    assert.strictEqual(
      attributes[3].attrs.some((attr) => attr.name.name === "ref"),
      true
    );
    assert.strictEqual(
      attributes[4].attrs.some((attr) => attr.name.name === "ref"),
      true
    );
  });

  it("returns no statements without a ref prop name and builds component-instance sync callbacks", () => {
    const functionPath = getFunctionPath(`
      function Card() {
        return <input ref={this.ref} />;
      }
    `);

    assert.deepStrictEqual(lowerForwardedElementRefs(functionPath, null), []);

    const statement = createComponentInstanceRefSyncStatement();
    const call = statement.expression;
    assert.strictEqual(call.callee.name, "useCallbackRef");
    assert.strictEqual(call.arguments[1].body.type, "ThisExpression");
    assert.strictEqual(call.arguments[2].body.body[0].declarations[0].init.property.name, "ref");
    assert.strictEqual(call.arguments[3].elements[0].property.name, "ref");
  });
});
