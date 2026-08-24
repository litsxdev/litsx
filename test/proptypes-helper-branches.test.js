import assert from "node:assert/strict";
import * as t from "@babel/types";
import babelTraverse from "@babel/traverse";
import parser from "./helpers/litsx-parser.js";
import {
  ensureBlockBody,
  extractPropTypeComponents,
  findExistingPropertiesAssignment,
  findExistingPropertiesHoist,
  getImportSource,
  getOrCreateRuntimeImport,
  getPropertyKeyName,
  inferOneOfType,
  isPropTypesReference,
  mergePropertiesObjects,
  unwrapComponentFunction,
} from "../packages/babel-plugin-litsx-proptypes/src/index.js";

const traverse = babelTraverse.default || babelTraverse;

function inspect(source) {
  const ast = parser.parse(source, { sourceType: "module", plugins: ["jsx"] });
  let program;
  const functions = [];
  traverse(ast, {
    Program(path) { program = path; },
    Function(path) { functions.push(path); },
  });
  return { program, functions };
}

describe("prop-types helper branches", () => {
  it("unwraps required chains and static property keys", () => {
    const required = t.memberExpression(
      t.memberExpression(t.identifier("PropTypes"), t.identifier("string")),
      t.identifier("isRequired")
    );
    assert.equal(extractPropTypeComponents(required, t).required, true);
    assert.equal(extractPropTypeComponents(t.identifier("validator"), t).required, false);
    assert.equal(getPropertyKeyName(t.identifier("title"), t), "title");
    assert.equal(getPropertyKeyName(t.stringLiteral("aria-label"), t), "aria-label");
    assert.equal(getPropertyKeyName(t.numericLiteral(2), t), "2");
    assert.equal(getPropertyKeyName(t.booleanLiteral(true), t), null);
  });

  it("infers homogeneous and mixed oneOf constructor families", () => {
    assert.equal(inferOneOfType(t.identifier("values"), t), "Object");
    assert.equal(inferOneOfType(t.arrayExpression([]), t), "Object");
    assert.equal(inferOneOfType(t.arrayExpression([t.stringLiteral("a"), null, t.stringLiteral("b")]), t), "String");
    assert.equal(inferOneOfType(t.arrayExpression([t.numericLiteral(1)]), t), "Number");
    assert.equal(inferOneOfType(t.arrayExpression([t.booleanLiteral(true)]), t), "Boolean");
    assert.equal(inferOneOfType(t.arrayExpression([t.stringLiteral("a"), t.numericLiteral(1)]), t), "Object");
    assert.equal(inferOneOfType(t.arrayExpression([t.identifier("value")]), t), "Object");
  });

  it("recognizes only bound prop-types imports", () => {
    const { program } = inspect(`import PropTypes from "prop-types"; import Other from "other"; PropTypes.string; Other.string; local.string;`);
    const bindings = program.scope.getAllBindings();
    assert.equal(getImportSource(bindings.PropTypes.path), "prop-types");
    assert.equal(getImportSource(null), null);
    assert.equal(isPropTypesReference(t.identifier("PropTypes"), program.scope, t), true);
    assert.equal(isPropTypesReference(t.identifier("Other"), program.scope, t), false);
    assert.equal(isPropTypesReference(t.stringLiteral("PropTypes"), program.scope, t), false);
    assert.equal(isPropTypesReference(t.identifier("Missing"), program.scope, t), false);
  });

  it("creates and reuses runtime helper imports with and without existing imports", () => {
    const first = inspect(`import value from "other"; const x = 1;`).program;
    const oneOf = getOrCreateRuntimeImport(first, "oneOf", t);
    assert.strictEqual(getOrCreateRuntimeImport(first, "oneOf", t), oneOf);
    const required = getOrCreateRuntimeImport(first, "required", t);
    assert.notEqual(required.name, oneOf.name);
    assert.equal(first.node.body.filter((node) => node.type === "ImportDeclaration").length, 2);

    const empty = inspect(`const x = 1;`).program;
    getOrCreateRuntimeImport(empty, "shape", t);
    assert.equal(empty.node.body[0].source.value, "@litsx/prop-types/runtime");
  });

  it("normalizes concise functions and unwraps declarations and variables", () => {
    const sample = inspect(`function Card() { return null; } const Panel = () => <div />; const value = 1;`);
    const card = sample.program.get("body.0");
    const panel = sample.program.get("body.1.declarations.0");
    const value = sample.program.get("body.2.declarations.0");
    assert.strictEqual(unwrapComponentFunction(card), card);
    assert.ok(unwrapComponentFunction(panel).isArrowFunctionExpression());
    assert.equal(unwrapComponentFunction(value), null);
    assert.equal(unwrapComponentFunction(null), null);
    const arrow = unwrapComponentFunction(panel);
    ensureBlockBody(arrow, t);
    assert.ok(arrow.get("body").isBlockStatement());
    ensureBlockBody(arrow, t);
  });

  it("merges descriptor objects and finds existing property declarations", () => {
    const generated = t.objectExpression([
      t.objectProperty(t.identifier("title"), t.objectExpression([])),
      t.objectProperty(t.identifier("count"), t.objectExpression([])),
    ]);
    const explicit = t.objectExpression([
      t.objectProperty(t.identifier("title"), t.objectExpression([t.objectProperty(t.identifier("attribute"), t.booleanLiteral(false))])),
      t.spreadElement(t.identifier("base")),
    ]);
    const merged = mergePropertiesObjects(generated, explicit, t);
    assert.equal(merged.properties.length, 3);
    const sample = inspect(`
      function Card() { __litsx_static_properties({ title: { type: String } }); return null; }
      Card.properties = { title: { type: String } };
      const properties = { count: { type: Number } };
    `);
    assert.ok(findExistingPropertiesAssignment(sample.program, "Card", t));
    assert.equal(findExistingPropertiesAssignment(sample.program, "Missing", t), null);
    assert.ok(findExistingPropertiesHoist(sample.program.get("body.0.body"), t));
  });
});
