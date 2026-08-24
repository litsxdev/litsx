import assert from "node:assert/strict";
import { parse } from "@babel/parser";
import { describe, it } from "vitest";
import {
  collectComponentLikeFunctions,
  collectNativeClassNameWarnings,
  collectReactMemoWarnings,
} from "../packages/authoring/src/authored-semantics.js";
import { collectImplicitChildrenProjectionIssues } from "../packages/authoring/src/implicit-children.js";
import { collectHookDiagnostics } from "../packages/authoring/src/hook-diagnostics.js";
import {
  componentFunctionName,
  jsxComponentNameParts,
  walk,
} from "../packages/authoring/src/component-names.js";

const id = (name, extra = {}) => ({ type: "Identifier", name, ...extra });

describe("component name helper branches", () => {
  it("classifies sparse functions and JSX member chains", () => {
    assert.strictEqual(componentFunctionName(null, null), null);
    assert.strictEqual(componentFunctionName({ type: "FunctionExpression", id: id("Card") }), "Card");
    assert.strictEqual(componentFunctionName({ type: "FunctionExpression", id: null }), null);
    assert.strictEqual(componentFunctionName({ type: "ArrowFunctionExpression" }, null), null);
    assert.deepStrictEqual(jsxComponentNameParts({ type: "JSXIdentifier", name: "Card" }), ["Card"]);
    assert.strictEqual(jsxComponentNameParts({ type: "JSXIdentifier", name: "div" }), null);
    assert.strictEqual(jsxComponentNameParts({ type: "Other" }), null);
    assert.strictEqual(jsxComponentNameParts({
      type: "JSXMemberExpression",
      object: { type: "JSXIdentifier", name: "UI" },
      property: null,
    }), null);

    const visited = [];
    walk(null, null, () => {});
    walk({ type: "Program", body: [{ type: "Identifier", name: "x" }], loc: { type: "Ignored" } }, null, (node) => visited.push(node.type));
    assert.deepStrictEqual(visited, ["Program", "Identifier"]);
  });
});

describe("authoring branch edge cases", () => {
  it("discovers every supported component function shape in sparse ASTs", () => {
    const arrow = { type: "ArrowFunctionExpression", params: [], body: id("value") };
    const assignedArrow = { type: "ArrowFunctionExpression", params: [], body: id("value") };
    const ast = {
      type: "Program",
      body: [
        { type: "FunctionDeclaration", id: id("Card"), params: [], body: { type: "BlockStatement", body: [] } },
        { type: "FunctionExpression", id: id("Dialog"), params: [], body: { type: "BlockStatement", body: [] } },
        { type: "FunctionDeclaration", id: id("helper"), params: [], body: { type: "BlockStatement", body: [] } },
        { type: "VariableDeclarator", id: id("Panel"), init: arrow },
        { type: "AssignmentExpression", left: id("Widget"), right: assignedArrow },
        { type: "VariableDeclarator", id: { type: "ObjectPattern", properties: [] }, init: { type: "ArrowFunctionExpression", params: [], body: id("x") } },
        null,
      ],
      loc: { ignored: true },
      leadingComments: [{ type: "CommentLine" }],
    };

    const found = collectComponentLikeFunctions({ program: ast });
    assert.deepEqual(found.map(({ parent }) => parent?.type), [
      "Program",
      "Program",
      "VariableDeclarator",
      "AssignmentExpression",
    ]);
  });

  it("reports native className across identifier and namespaced JSX while preserving sparse locations", () => {
    const className = { type: "JSXIdentifier", name: "className" };
    const ast = {
      type: "Program",
      body: [
        {
          type: "JSXElement",
          openingElement: {
            type: "JSXOpeningElement",
            name: { type: "JSXIdentifier", name: "div" },
            attributes: [{ type: "JSXAttribute", name: className }],
          },
        },
        {
          type: "JSXElement",
          openingElement: {
            type: "JSXOpeningElement",
            name: {
              type: "JSXNamespacedName",
              namespace: id("svg"),
              name: id("path"),
            },
            attributes: [{ type: "JSXAttribute", name: { ...className, start: 5, end: 14, loc: { start: { line: 2, column: 3 } } } }],
          },
        },
        {
          type: "JSXElement",
          openingElement: {
            type: "JSXOpeningElement",
            name: { type: "JSXMemberExpression", object: id("UI"), property: null },
            attributes: [{ type: "JSXAttribute", name: className }],
          },
        },
        { type: "JSXOpeningElement", name: { type: "Unknown" }, attributes: [] },
      ],
    };

    const warnings = collectNativeClassNameWarnings({ program: ast });
    assert.equal(warnings.length, 2);
    assert.deepEqual(warnings.map(({ tagName }) => tagName), ["div", "svg:path"]);
    assert.deepEqual(warnings[0], {
      code: 91008,
      message: warnings[0].message,
      attributeName: "className",
      tagName: "div",
      start: 0,
      length: 0,
      line: null,
      column: null,
    });
  });

  it("handles aliased, default, and namespace memo imports plus malformed lookalikes", () => {
    const ast = {
      type: "Program",
      body: [
        {
          type: "ImportDeclaration",
          source: { value: "react" },
          specifiers: [
            { type: "ImportSpecifier", imported: id("memo"), local: id("cache") },
            { type: "ImportSpecifier", imported: id("other"), local: id("memo") },
            { type: "ImportDefaultSpecifier", local: id("React") },
            { type: "ImportNamespaceSpecifier", local: id("ReactNS") },
            { type: "ImportNamespaceSpecifier", local: null },
            null,
          ],
        },
        { type: "ImportDeclaration", source: { value: "other" }, specifiers: [] },
        { type: "CallExpression", callee: id("cache"), arguments: [id("Card"), id("compare")] },
        {
          type: "CallExpression",
          callee: { type: "MemberExpression", computed: false, object: id("ReactNS"), property: id("memo") },
          arguments: [id("Card")],
          start: 10,
          end: 20,
          loc: { start: { line: 4, column: 2 } },
        },
        { type: "CallExpression", callee: { type: "MemberExpression", computed: true, object: id("React"), property: id("memo") }, arguments: [] },
        { type: "CallExpression", callee: id("memo"), arguments: [] },
      ],
    };

    const warnings = collectReactMemoWarnings(ast);
    assert.equal(warnings.length, 3);
    assert.deepEqual(warnings.map(({ code }) => code), [91016, 91017, 91016]);
    assert.equal(warnings[0].start, 0);
    assert.equal(warnings[0].length, 0);
    assert.equal(warnings[1].line, null);
    assert.equal(warnings[2].line, 4);
  });
});

describe("implicit children branch edge cases", () => {
  it("tracks destructuring defaults, aliases, duplicates, and unsupported references", () => {
    const child = (expression) => ({
      type: "JSXExpressionContainer",
      expression,
      start: expression.start,
      end: expression.end,
    });
    const member = (objectName, extra = {}) => ({
      type: "MemberExpression",
      computed: false,
      object: id(objectName),
      property: id("children"),
      ...extra,
    });
    const component = {
      type: "FunctionDeclaration",
      id: id("Card"),
      params: [
        {
          type: "AssignmentPattern",
          left: {
            type: "ObjectPattern",
            properties: [
              {
                type: "ObjectProperty",
                key: { type: "StringLiteral", value: "children" },
                value: { type: "AssignmentPattern", left: id("content"), right: { type: "NullLiteral" } },
              },
              { type: "RestElement", argument: id("rest") },
            ],
          },
          right: { type: "ObjectExpression", properties: [] },
        },
      ],
      body: {
        type: "BlockStatement",
        body: [
          { type: "VariableDeclaration", declarations: [{ type: "VariableDeclarator", id: id("alias"), init: id("content") }] },
          {
            type: "ReturnStatement",
            argument: {
              type: "JSXFragment",
              children: [
                child(id("content", { start: 5, end: 12 })),
                child(id("alias")),
                { type: "JSXElement", children: [id("content")] },
              ],
            },
          },
          {
            type: "VariableDeclaration",
            declarations: [{ type: "VariableDeclarator", id: id("later"), init: id("content") }],
          },
          {
            type: "FunctionDeclaration",
            id: id("Nested"),
            params: [],
            body: { type: "BlockStatement", body: [{ type: "ReturnStatement", argument: id("content") }] },
          },
        ],
      },
    };
    const propsComponent = {
      type: "ArrowFunctionExpression",
      params: [{ type: "AssignmentPattern", left: id("props"), right: { type: "ObjectExpression", properties: [] } }],
      body: {
        type: "BlockStatement",
        body: [
          {
            type: "VariableDeclaration",
            declarations: [
              { type: "VariableDeclarator", id: id("copy"), init: id("props") },
              { type: "VariableDeclarator", id: id("picked"), init: member("copy") },
              {
                type: "VariableDeclarator",
                id: { type: "ObjectPattern", properties: [{ type: "ObjectProperty", key: id("children"), value: id("nested") }] },
                init: id("copy"),
              },
            ],
          },
          { type: "ReturnStatement", argument: { type: "JSXElement", children: [child(member("props")), child(id("picked")), child(id("nested"))] } },
        ],
      },
    };
    const ast = {
      type: "Program",
      body: [
        component,
        { type: "VariableDeclarator", id: id("Panel"), init: propsComponent },
        { type: "FunctionDeclaration", id: id("NoProps"), params: [], body: { type: "BlockStatement", body: [] } },
      ],
    };

    const issues = collectImplicitChildrenProjectionIssues(ast);
    assert.ok(issues.some(({ kind }) => kind === "implicit-children-unsupported"));
    assert.ok(issues.filter(({ kind }) => kind === "implicit-children-duplicate").length >= 3);
    assert.ok(issues.some(({ start, length }) => start === 0 && length === 0));
  });
});

describe("hook diagnostic branch edge cases", () => {
  const parseModule = (source) => parse(source, {
    sourceType: "module",
    plugins: ["jsx", "typescript", "classPrivateMethods"],
  });

  it("reports async, try, switch, logical, ternary, and every loop family", () => {
    const diagnostics = collectHookDiagnostics(parseModule(`
      import Runtime, * as Hooks from "@litsx/core";
      import { useState as stateHook } from "react";
      async function AsyncPanel() { stateHook(0); return null; }
      function TryPanel() { try { Hooks.useHost(); } catch (error) { Hooks.useHost(); } }
      function SwitchPanel(value) { switch (value) { case 1: Hooks.useHost(); break; } }
      function LogicPanel(value) { value && Hooks.useHost(); value ? Hooks.useHost() : null; }
      function LoopPanel(items) {
        while (false) Hooks.useHost();
        do { Hooks.useHost(); } while (false);
        for (;;) { Hooks.useHost(); break; }
        for (const key in items) Hooks.useHost();
        for (const item of items) Hooks.useHost();
      }
    `));
    const codes = diagnostics.map(({ code }) => code);
    assert.ok(codes.includes("LITSX_HOOK_ASYNC_SCOPE"));
    assert.ok(codes.includes("LITSX_HOOK_TRY_BLOCK"));
    assert.ok(codes.filter((code) => code === "LITSX_HOOK_CONDITIONAL").length >= 3);
    assert.ok(codes.filter((code) => code === "LITSX_HOOK_LOOP").length >= 5);
  });

  it("allows namespace defineHook readers, renderWithHooks callbacks, methods, and assignments", () => {
    const diagnostics = collectHookDiagnostics(parseModule(`
      import * as Runtime from "@litsx/core";
      import ReactRuntime from "react";
      const useOne = Runtime.defineHook({ use() { return Runtime.useHost(); } });
      const useTwo = Runtime.defineHook({ "use": () => Runtime.useHost() });
      const WrappedPanel = renderWithHooks(host, function () { Runtime.useHost(); });
      AssignedPanel = () => Runtime.useHost();
      const ObjectPanel = { render() { Runtime.useHost(); } };
      class ClassPanel {
        render() { Runtime.useHost(); }
        #render() { Runtime.useHost(); }
      }
      function GoodPanel() { ReactRuntime.useState(0); useOne(); useTwo(); return null; }
    `));

    assert.deepEqual(diagnostics.map(({ code }) => code), [
      "LITSX_HOOK_INVALID_SCOPE",
      "LITSX_HOOK_INVALID_SCOPE",
    ]);
  });

  it("reports nested variable and assignment hooks with sparse diagnostic locations", () => {
    const nestedArrow = {
      type: "ArrowFunctionExpression",
      async: false,
      params: [],
      body: { type: "BlockStatement", body: [] },
    };
    const nestedAssignment = {
      type: "AssignmentExpression",
      left: id("useAssigned"),
      right: nestedArrow,
    };
    const ast = {
      type: "Program",
      body: [{
        type: "FunctionDeclaration",
        id: id("OuterPanel"),
        params: [],
        body: {
          type: "BlockStatement",
          body: [
            { type: "VariableDeclaration", declarations: [{ type: "VariableDeclarator", id: id("useNested"), init: nestedArrow }] },
            { type: "ExpressionStatement", expression: nestedAssignment },
          ],
        },
      }],
    };

    const diagnostics = collectHookDiagnostics(ast);
    assert.equal(diagnostics.length, 2);
    assert.ok(diagnostics.every(({ code }) => code === "LITSX_NESTED_HOOK_DEFINITION"));
    assert.ok(diagnostics.every(({ start, length, line, column }) => start === 0 && length === 0 && line === null && column === null));
  });
});
