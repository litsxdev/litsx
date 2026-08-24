import assert from "assert";
import * as t from "@babel/types";
import babelTraverse from "@babel/traverse";
import parser from "./helpers/litsx-parser.js";
import {
  bindingFunctionReferencesThisProp,
  createComponentInstanceRefSyncStatement,
  createForwardedTargetRefSyncStatement,
  createManagedRefLookupExpression,
  createThisMemberExpression,
  hasExplicitRefForwarding,
  hasRefProp,
  isComponentJsxName,
  isRefAttributeOnStandardElement,
  isStandardElementJsxName,
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

  it("leaves native refs for the Lit directive and routes component refs as properties", () => {
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
    assert.strictEqual(statements.length, 0);

    const attributes = functionPath.node.body.body[0].argument.children
      .filter((child) => child.type === "JSXElement")
      .map((element) => ({
        name: element.openingElement.name.name,
        attrs: element.openingElement.attributes,
      }));

    assert.strictEqual(
      attributes[0].attrs.some((attr) => attr.name.name === "ref"),
      true
    );
    assert.strictEqual(
      attributes[1].attrs.some((attr) => attr.name.name === "ref"),
      true
    );
    assert.strictEqual(
      attributes[2].attrs.some((attr) => attr.name.name === ".ref"),
      true
    );
    assert.strictEqual(
      attributes[3].attrs.some((attr) => attr.name.name === ".ref"),
      true
    );
    assert.strictEqual(
      attributes[4].attrs.some((attr) => attr.name.name === "ref"),
      true
    );
  });

  it("detects direct, composed, and component ref forwarding to avoid host ref sync", () => {
    const direct = getFunctionPath(`
      function Card() {
        return <form ref={this.ref} />;
      }
    `);
    assert.strictEqual(hasExplicitRefForwarding(direct, "ref"), true);

    const composed = getFunctionPath(`
      function Card() {
        const setFormNode = (node) => {
          this.formNode = node;
          if (typeof this.ref === "function") {
            this.ref(node);
          } else if (this.ref) {
            this.ref.value = node;
          }
        };
        return <form ref={setFormNode} />;
      }
    `);
    assert.strictEqual(hasExplicitRefForwarding(composed, "ref"), true);

    const childComponent = getFunctionPath(`
      function Card() {
        return <ChildField ref={this.ref} />;
      }
    `);
    assert.strictEqual(hasExplicitRefForwarding(childComponent, "ref"), true);

    const localOnly = getFunctionPath(`
      function Card() {
        const setFormNode = (node) => {
          this.formNode = node;
        };
        return <form ref={setFormNode} />;
      }
    `);
    assert.strictEqual(hasExplicitRefForwarding(localOnly, "ref"), false);
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
    assert.strictEqual(call.arguments[0].body.type, "ThisExpression");
    assert.strictEqual(call.arguments[1].body.body[0].declarations[0].init.property.name, "ref");
    assert.strictEqual(call.arguments[2].elements[0].property.name, "ref");
  });

  it("classifies standard, component, and ref attribute node shapes", () => {
    assert.strictEqual(isStandardElementJsxName(t.jsxIdentifier("input")), true);
    assert.strictEqual(isStandardElementJsxName(t.jsxIdentifier("Input")), false);
    assert.strictEqual(isStandardElementJsxName(t.jsxIdentifier("my-input")), false);
    assert.strictEqual(isStandardElementJsxName(t.jsxIdentifier("")), false);
    assert.strictEqual(isStandardElementJsxName(t.stringLiteral("input")), false);
    assert.strictEqual(isComponentJsxName(t.jsxIdentifier("Input")), true);
    assert.strictEqual(isComponentJsxName(t.jsxIdentifier("my-input")), true);
    assert.strictEqual(isComponentJsxName(t.jsxIdentifier("input")), false);
    assert.strictEqual(isComponentJsxName(t.jsxMemberExpression(t.jsxIdentifier("UI"), t.jsxIdentifier("Input"))), true);
    assert.strictEqual(isComponentJsxName(t.stringLiteral("Input")), false);

    const functionPath = getFunctionPath(`function Card() { return <input ref={value} title="x" />; }`);
    let refPath;
    let titlePath;
    functionPath.traverse({ JSXAttribute(path) {
      if (path.node.name.name === "ref") refPath = path;
      if (path.node.name.name === "title") titlePath = path;
    } });
    assert.strictEqual(isRefAttributeOnStandardElement(refPath), true);
    assert.strictEqual(isRefAttributeOnStandardElement(titlePath), false);
    assert.strictEqual(isRefAttributeOnStandardElement(null), false);
  });

  it("builds computed ref expressions and handles unsupported binding shapes", () => {
    assert.strictEqual(createThisMemberExpression("ref").computed, false);
    assert.strictEqual(createThisMemberExpression("forwarded-ref").computed, true);
    const lookup = createManagedRefLookupExpression("target");
    assert.strictEqual(lookup.operator, "??");
    assert.match(lookup.left.arguments[0].value, /data-ref="target"/);
    const statement = createForwardedTargetRefSyncStatement("forwarded-ref", "target");
    assert.strictEqual(statement.expression.arguments[2].elements[0].computed, true);
    assert.strictEqual(bindingFunctionReferencesThisProp(null, "ref"), false);
    assert.strictEqual(bindingFunctionReferencesThisProp({ path: {} }, "ref"), false);
    assert.strictEqual(bindingFunctionReferencesThisProp({ path: {} }, null), false);
  });

  it("rejects unsupported ref parameter and forwarding shapes", () => {
    assert.strictEqual(hasRefProp(getFunctionPath(`function Card() { return null; }`)), false);
    assert.strictEqual(hasRefProp(getFunctionPath(`function Card([ref]) { return ref; }`)), false);
    assert.strictEqual(hasRefProp(getFunctionPath(`function Card({ value, ...rest }) { return value; }`)), false);
    assert.strictEqual(hasExplicitRefForwarding(getFunctionPath(`function Card() { return <input />; }`), null), false);
    assert.strictEqual(hasExplicitRefForwarding(getFunctionPath(`function Card() { return <input ref="literal" />; }`), "ref"), false);
    assert.strictEqual(hasExplicitRefForwarding(getFunctionPath(`function Card() { return <input ref={this["ref"]} />; }`), "ref"), false);
    assert.strictEqual(hasExplicitRefForwarding(getFunctionPath(`function Card() { return <Widget ref={callback} />; }`), "ref"), false);
  });
});
