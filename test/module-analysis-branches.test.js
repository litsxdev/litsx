import assert from "node:assert/strict";
import { describe, it } from "vitest";
import { analyzeLitsxModule } from "../packages/compiler/src/module-analysis.js";

const id = (name) => ({ type: "Identifier", name });
const object = () => ({ type: "ObjectExpression", properties: [] });

describe("module analysis branch coverage", () => {
  it("returns empty analysis for absent and non-program ASTs", () => {
    for (const ast of [null, {}, { type: "File", program: null }]) {
      assert.deepEqual(analyzeLitsxModule(ast), {
        imports: [], exports: [], declarations: [], jsxReferences: [],
      });
    }
  });

  it("classifies all declaration, import, export, and JSX reference shapes", () => {
    const program = {
      type: "Program",
      body: [
        {
          type: "ImportDeclaration",
          source: { value: "./card-view.tsx" },
          specifiers: [
            { type: "ImportSpecifier", imported: id("CardView"), local: id("ImportedCard"), importKind: "value" },
            { type: "ImportSpecifier", imported: { type: "StringLiteral", value: "NamedThing" }, local: id("NamedThing"), importKind: "type" },
            { type: "ImportDefaultSpecifier", local: id("DefaultCard") },
            { type: "ImportNamespaceSpecifier", local: id("CardNamespace") },
          ],
        },
        {
          type: "ImportDeclaration",
          importKind: "type",
          source: { value: "types-package" },
          specifiers: [{ type: "ImportSpecifier", imported: id("TypeOnly"), local: id("TypeOnly") }],
        },
        {
          type: "ImportDeclaration",
          source: null,
          specifiers: [],
        },
        { type: "FunctionDeclaration", id: id("LocalPanel"), params: [], body: { type: "BlockStatement", body: [] } },
        { type: "ClassDeclaration", id: id("LocalDialog"), body: { type: "ClassBody", body: [] } },
        { type: "FunctionDeclaration", id: null, params: [], body: { type: "BlockStatement", body: [] } },
        {
          type: "VariableDeclaration",
          declarations: [
            { type: "VariableDeclarator", id: id("MetaObject"), init: object() },
            { type: "VariableDeclarator", id: id("FunctionValue"), init: { type: "FunctionExpression", id: null, params: [], body: { type: "BlockStatement", body: [] } } },
            { type: "VariableDeclarator", id: id("ArrowValue"), init: { type: "ArrowFunctionExpression", params: [], body: object() } },
            { type: "VariableDeclarator", id: id("UnknownValue"), init: null },
            { type: "VariableDeclarator", id: { type: "ObjectPattern", properties: [] }, init: object() },
          ],
        },
        { type: "ExportDefaultDeclaration", declaration: id("MetaObject") },
        { type: "ExportDefaultDeclaration", declaration: object() },
        { type: "ExportDefaultDeclaration", declaration: { type: "FunctionDeclaration", id: null, params: [], body: { type: "BlockStatement", body: [] } } },
        {
          type: "ExportNamedDeclaration",
          declaration: { type: "FunctionDeclaration", id: id("ExportedPanel"), params: [], body: { type: "BlockStatement", body: [] } },
          specifiers: [],
          source: null,
        },
        {
          type: "ExportNamedDeclaration",
          declaration: {
            type: "VariableDeclaration",
            declarations: [
              { type: "VariableDeclarator", id: id("StoryObject"), init: object() },
              { type: "VariableDeclarator", id: id("PlainValue"), init: { type: "NumericLiteral", value: 1 } },
              { type: "VariableDeclarator", id: { type: "ArrayPattern", elements: [] }, init: object() },
            ],
          },
          specifiers: [],
          source: null,
        },
        {
          type: "ExportNamedDeclaration",
          declaration: null,
          source: null,
          specifiers: [
            { type: "ExportSpecifier", local: id("MetaObject"), exported: id("Meta") },
            { type: "ExportSpecifier", local: id("UnknownValue"), exported: { type: "StringLiteral", value: "unknown-export" } },
            { type: "ExportSpecifier", local: null, exported: null },
          ],
        },
        {
          type: "ExportNamedDeclaration",
          declaration: null,
          source: { value: "./other.js" },
          specifiers: [{ type: "ExportSpecifier", local: id("Thing"), exported: id("OtherThing") }],
        },
        {
          type: "ExpressionStatement",
          expression: {
            type: "ArrayExpression",
            elements: [
              { type: "JSXElement", openingElement: { type: "JSXOpeningElement", name: { type: "JSXIdentifier", name: "ImportedCard" }, attributes: [], selfClosing: true }, closingElement: null, children: [] },
              { type: "JSXElement", openingElement: { type: "JSXOpeningElement", name: { type: "JSXIdentifier", name: "DefaultCard" }, attributes: [], selfClosing: true }, closingElement: null, children: [] },
              { type: "JSXElement", openingElement: { type: "JSXOpeningElement", name: { type: "JSXIdentifier", name: "LocalPanel" }, attributes: [], selfClosing: true }, closingElement: null, children: [] },
              { type: "JSXElement", openingElement: { type: "JSXOpeningElement", name: { type: "JSXIdentifier", name: "UnknownWidget" }, attributes: [], selfClosing: true }, closingElement: null, children: [] },
              { type: "JSXElement", openingElement: { type: "JSXOpeningElement", name: { type: "JSXIdentifier", name: "ImportedCard" }, attributes: [], selfClosing: true }, closingElement: null, children: [] },
              { type: "JSXElement", openingElement: { type: "JSXOpeningElement", name: { type: "JSXIdentifier", name: "div" }, attributes: [], selfClosing: true }, closingElement: null, children: [] },
            ],
          },
        },
      ],
    };

    const result = analyzeLitsxModule({ program });
    assert.deepEqual(result.imports.map(({ kind }) => kind), ["mixed", "type", "value"]);
    assert.deepEqual(result.imports[0].specifiers.map(({ importedName }) => importedName), ["CardView", "NamedThing", "default", "*"]);
    assert.ok(result.declarations.some(({ localName, kind }) => localName === "MetaObject" && kind === "const-object"));
    assert.ok(result.declarations.some(({ localName, kind }) => localName === "FunctionValue" && kind === "const-function"));
    assert.ok(result.declarations.some(({ localName, kind }) => localName === "ArrowValue" && kind === "const-arrow-function"));
    assert.ok(result.declarations.some(({ localName, kind }) => localName === "UnknownValue" && kind === "unknown"));
    assert.ok(result.exports.some(({ exportName, kind }) => exportName === "default" && kind === "default-object"));
    assert.ok(result.exports.some(({ exportName, kind }) => exportName === "OtherThing" && kind === "re-export"));
    assert.ok(result.exports.some(({ exportName, kind }) => exportName === "Meta" && kind === "named-object"));
    assert.deepEqual(result.jsxReferences.map(({ localName, source }) => [localName, source]), [
      ["ImportedCard", "imported-authored-module"],
      ["DefaultCard", "imported-authored-module"],
      ["LocalPanel", "local-declaration"],
      ["UnknownWidget", "unknown"],
    ]);
  });
});
