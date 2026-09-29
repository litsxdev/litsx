import assert from "node:assert/strict";
import babelTraverse from "@babel/traverse";
import * as t from "@babel/types";
import { describe, it } from "vitest";
import parser from "./helpers/litsx-parser.js";
import {
  analyzeRefUsage,
  createRefAssignmentCallback,
  createGetter,
  ensureGetter,
  ensureRuntimeImport,
  getFunctionRefBindingPath,
  getFunctionRefCallbackNode,
  getComponentRefAttributeName,
  getSupportedHookImportLocal,
  hasBareRefAttributeSuffix,
  hasQuotedRefAttributeSuffix,
  hasTemplateRef,
  isComponentJsxName,
  isComponentRefAttribute,
  isHtmlTemplateRefExpression,
  isSoftSuspenseRenderScope,
  insertAfterFunctionRefBinding,
  insertBeforeRefRender,
  replaceTemplateCallbackRef,
  replaceTemplateRefWithName,
  setUseRefBabelTypes,
} from "../packages/babel-plugin-shared-hooks/src/create-use-ref-transform.js";

const traverse = babelTraverse.default || babelTraverse;
setUseRefBabelTypes(t);

function paths(source) {
  const ast = parser.parse(source, { sourceType: "module", plugins: ["jsx"] });
  let programPath;
  const tagged = [];
  const classes = [];
  traverse(ast, {
    Program(path) { programPath = path; },
    TaggedTemplateExpression(path) { tagged.push(path); },
    ClassDeclaration(path) { classes.push(path); },
  });
  return { ast, programPath, tagged, classes };
}

describe("useRef analysis branch behavior", () => {
  it("classifies component JSX names and function-ref bindings", () => {
    assert.equal(isComponentJsxName(t.jsxMemberExpression(t.jsxIdentifier("UI"), t.jsxIdentifier("Button"))), true);
    assert.equal(isComponentJsxName(t.identifier("Button")), false);
    assert.equal(isComponentJsxName(t.jsxIdentifier("Button")), true);
    assert.equal(isComponentJsxName(t.jsxIdentifier("my-button")), true);
    assert.equal(isComponentJsxName(t.jsxIdentifier("button")), false);
    assert.equal(isComponentJsxName(t.jsxIdentifier("")), false);

    const { programPath } = paths("function callback() {} const arrow = () => {}; const expression = function () {}; const value = 1;");
    const callback = programPath.scope.getBinding("callback");
    const arrow = programPath.scope.getBinding("arrow");
    const expression = programPath.scope.getBinding("expression");
    const value = programPath.scope.getBinding("value");
    assert.equal(getFunctionRefBindingPath(null), null);
    assert.equal(getFunctionRefBindingPath(callback), callback.path);
    assert.equal(getFunctionRefBindingPath(arrow), arrow.path);
    assert.equal(getFunctionRefBindingPath(expression), expression.path);
    assert.equal(getFunctionRefBindingPath(value), null);
    assert.equal(getFunctionRefCallbackNode(callback.path).name, "callback");
    assert.equal(getFunctionRefCallbackNode(arrow.path).name, "arrow");
    assert.equal(getFunctionRefCallbackNode({ isFunctionDeclaration: () => true, node: { id: null } }), null);
    assert.equal(getFunctionRefCallbackNode(null), null);
  });

  it("builds callback-ref assignment semantics and detects suffix forms", () => {
    const callback = createRefAssignmentCallback(t.identifier("externalRef"));
    assert.equal(callback.type, "ArrowFunctionExpression");
    assert.equal(callback.body.body[1].consequent.body[0].expression.type, "CallExpression");
    assert.equal(callback.body.body[1].alternate.consequent.body[0].expression.left.property.name, "current");

    for (const value of [' ref="', '<ref="', 'ref="']) assert.equal(hasQuotedRefAttributeSuffix(value), true);
    for (const value of [" ref=", "<ref=", "ref="]) assert.equal(hasBareRefAttributeSuffix(value), true);
    assert.equal(hasQuotedRefAttributeSuffix("href=\""), false);
    assert.equal(hasBareRefAttributeSuffix("preferred="), false);
  });

  it("rewrites quoted and bare template callback refs", () => {
    const quoted = paths('html`<div ref="${callback}"></div>`').tagged[0];
    assert.equal(replaceTemplateCallbackRef(quoted, 0, "node"), true);
    assert.equal(quoted.node.quasi.expressions.length, 0);
    assert.match(quoted.node.quasi.quasis[0].value.raw, /data-ref="node"/);

    const bare = paths("html`<div ref=${callback}></div>`").tagged[0];
    assert.equal(replaceTemplateCallbackRef(bare, 0, "bare"), true);
    assert.match(bare.node.quasi.quasis[0].value.raw, /data-ref="bare"/);

    const invalid = paths("html`<div title=${callback}></div>`").tagged[0];
    assert.equal(replaceTemplateCallbackRef(invalid, 0, "nope"), false);
    assert.equal(replaceTemplateCallbackRef(invalid, 9, "nope"), false);
  });

  it("finds and replaces identifier and this-member template refs", () => {
    const sample = paths(`
      class View {
        render() {
          const local = 1;
          return html\`<div ref="\${local}"><span ref=\${this.member}></span><i title=\${local}></i></div>\`;
        }
      }
    `);
    const classPath = sample.classes[0];
    assert.equal(hasTemplateRef(classPath, "local"), true);
    assert.equal(hasTemplateRef(classPath, "member"), true);
    assert.equal(hasTemplateRef(classPath, "missing"), false);
    assert.equal(replaceTemplateRefWithName(classPath, "missing", "none"), false);
    assert.equal(replaceTemplateRefWithName(classPath, "local", "local-node"), true);
    assert.equal(replaceTemplateRefWithName(classPath, "member", "member-node"), true);
    const raw = sample.tagged[0].node.quasi.quasis.map((part) => part.value.raw).join("");
    assert.match(raw, /data-ref="local-node"/);
    assert.match(raw, /data-ref="member-node"/);

    const refs = paths('const ref = {}; html`<div ref="${ref}"></div>`; other`<div ref=${ref}></div>`; ref;');
    const binding = refs.programPath.scope.getBinding("ref");
    assert.equal(isHtmlTemplateRefExpression(binding.referencePaths[0]), true);
    assert.equal(isHtmlTemplateRefExpression(binding.referencePaths[1]), false);
    assert.equal(isHtmlTemplateRefExpression(binding.referencePaths[2]), false);
  });

  it("distinguishes current writes from transparent and opaque ref uses", () => {
    const sample = paths(`
      const ref = {};
      const read = ref.current;
      ref.current = node;
      ref.current++;
      delete ref.current;
      consume(ref);
      const view = <div ref={ref} />;
      html\`<span ref=\${ref}></span>\`;
    `);
    const binding = sample.programPath.scope.getBinding("ref");
    assert.deepEqual(analyzeRefUsage(binding.referencePaths, "ref"), {
      hasCurrentWrite: true,
      hasOpaqueUsage: true,
    });
    assert.deepEqual(analyzeRefUsage([{ node: null }, { node: {}, removed: true }], "ref"), {
      hasCurrentWrite: false,
      hasOpaqueUsage: false,
    });
  });

  it("creates and deduplicates getters around render methods", () => {
    const sample = paths(`
      class WithRender { render() { return null; } }
      class WithoutRender {}
      class Existing { get node() { return null; } render() {} }
    `);
    assert.equal(createGetter("node").kind, "get");
    ensureGetter(sample.classes[0], "node");
    ensureGetter(sample.classes[1], "node");
    const before = sample.classes[2].node.body.body.length;
    ensureGetter(sample.classes[2], "node");
    assert.equal(sample.classes[2].node.body.body.length, before);
    assert.equal(sample.classes[0].node.body.body[0].kind, "get");
    assert.equal(sample.classes[1].node.body.body[0].kind, "get");
  });

  it("ensures runtime imports across empty, ordinary, namespace, and existing imports", () => {
    const empty = paths("const x = 1;").programPath;
    ensureRuntimeImport(empty, "useRef", "useRef", t);
    ensureRuntimeImport(empty, "useRef", "useRef", t);
    assert.equal(empty.node.body[0].specifiers.length, 1);

    const ordinary = paths('import x from "other";').programPath;
    ensureRuntimeImport(ordinary, "useRef", "localRef", t);
    assert.equal(ordinary.node.body[0].source.value, "@litsx/core");

    const namespace = paths('import * as core from "@litsx/core";').programPath;
    ensureRuntimeImport(namespace, "useRef", "useRef", t);
    assert.equal(namespace.node.body.length, 2);

    const mixed = paths('import * as core from "@litsx/core"; import { useMemo } from "@litsx/core";').programPath;
    ensureRuntimeImport(mixed, "useRef", "useRef", t);
    assert.equal(mixed.node.body[1].specifiers.length, 2);
  });

  it("classifies component ref attributes and supported hook imports", () => {
    const sample = paths(`
      import React, { useRef as refHook, useMemo } from "react";
      import * as Other from "other";
      refHook(); useMemo(); React.useRef(); React.useOther(); Other.useRef(); missing(); obj[key]();
      const view = <><MyButton ref={value} /><button ref={value} /></>;
    `);
    const attrs = [];
    const calls = [];
    traverse(sample.ast, {
      JSXAttribute(path) { attrs.push(path); },
      CallExpression(path) { calls.push(path); },
    });
    assert.equal(isComponentRefAttribute(attrs[0]), true);
    assert.equal(isComponentRefAttribute(attrs[1]), false);
    assert.equal(isComponentRefAttribute({ parentPath: null }), false);
    assert.equal(getComponentRefAttributeName(attrs[0]), ".ref");
    const supported = ["useRef"];
    const sources = ["react"];
    assert.equal(getSupportedHookImportLocal(calls[0].get("callee"), sample.programPath.scope, sources, supported, t), "refHook");
    assert.equal(getSupportedHookImportLocal(calls[1].get("callee"), sample.programPath.scope, sources, supported, t), null);
    assert.equal(getSupportedHookImportLocal(calls[2].get("callee"), sample.programPath.scope, sources, supported, t), "useRef");
    assert.equal(getSupportedHookImportLocal(calls[3].get("callee"), sample.programPath.scope, sources, supported, t), null);
    assert.equal(getSupportedHookImportLocal(calls[4].get("callee"), sample.programPath.scope, sources, supported, t), null);
    assert.equal(getSupportedHookImportLocal(calls[5].get("callee"), sample.programPath.scope, sources, supported, t), null);
    assert.equal(getSupportedHookImportLocal(calls[6].get("callee"), sample.programPath.scope, sources, supported, t), null);
  });

  it("inserts ref setup after bindings or before render sites", () => {
    const sample = paths(`
      function callback() {}
      const arrow = () => {};
      class View {
        render() {
          const direct = <div ref={callback} />;
          if (flag) return <span ref={arrow} />;
          return direct;
        }
      }
      const soft = renderWithHooks(this, () => <div ref={arrow} />);
    `);
    const bindings = sample.programPath.scope.getAllBindings();
    const statement = t.expressionStatement(t.stringLiteral("setup"));
    assert.equal(insertAfterFunctionRefBinding(bindings.callback.path, t.cloneNode(statement), null), true);
    assert.equal(insertAfterFunctionRefBinding(bindings.arrow.path, t.cloneNode(statement), null), true);
    assert.equal(insertAfterFunctionRefBinding(null, t.cloneNode(statement), sample.classes[0].get("body.body.0.body")), true);
    assert.equal(insertAfterFunctionRefBinding(null, t.cloneNode(statement), null), false);

    const attrs = [];
    const arrows = [];
    traverse(sample.ast, {
      JSXAttribute(path) { attrs.push(path); },
      ArrowFunctionExpression(path) { arrows.push(path); },
    });
    const renderMethod = sample.classes[0].get("body.body").find((path) => path.isClassMethod({ kind: "method" }));
    assert.equal(insertBeforeRefRender(attrs[1], renderMethod, [t.cloneNode(statement)]), true);
    assert.equal(insertBeforeRefRender(attrs[0], renderMethod, [t.cloneNode(statement)]), true);
    assert.equal(isSoftSuspenseRenderScope(arrows.at(-1)), true);
    assert.equal(isSoftSuspenseRenderScope(null), false);
    assert.equal(insertBeforeRefRender(attrs.at(-1), renderMethod, [t.cloneNode(statement)]), false);
  });
});
