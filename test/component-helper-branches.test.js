import assert from "node:assert/strict";
import babelTraverse from "@babel/traverse";
import * as t from "@babel/types";
import { describe, it } from "vitest";
import parser from "./helpers/litsx-parser.js";
import {
  collectNoscriptOnlyElementCandidates,
  containsTypeResolutionSyntax,
  ensureClassIdentifier,
  fileLikelyNeedsTypeResolver,
  functionNeedsTypeResolver,
  getEventMapNames,
  isCapitalizedComponentName,
  isInsideComponentFunctionOrClass,
  isUseEmitCall,
  readExplicitEventMetadata,
  setComponentBabelTypes,
} from "../packages/babel-preset-litsx/src/internal/transform-litsx-components.js";

const traverse = babelTraverse.default || babelTraverse;
setComponentBabelTypes(t);

function inspect(source) {
  const ast = parser.parse(source, { sourceType: "module", plugins: ["jsx", "typescript"] });
  let program;
  const functions = [];
  const calls = [];
  traverse(ast, {
    Program(path) { program = path; },
    Function(path) { functions.push(path); },
    CallExpression(path) { calls.push(path); },
  });
  return { program, functions, calls };
}

describe("component transform helper branch behavior", () => {
  it("classifies component names and nested scopes", () => {
    for (const name of ["View", "A", "Élément"]) assert.equal(isCapitalizedComponentName(name), true);
    for (const name of [null, "", "view", "1View"]) assert.equal(isCapitalizedComponentName(name), false);
    const sample = inspect("const top = 1; function outer() { const arrow = () => 1; } class Box { method() {} }");
    assert.ok(isInsideComponentFunctionOrClass(sample.functions[1]));
    assert.equal(isInsideComponentFunctionOrClass(sample.program.get("body.0")), null);
  });

  it("detects files and parameter shapes needing type resolution", () => {
    assert.equal(fileLikelyNeedsTypeResolver({ file: { opts: { filename: "view.tsx" }, code: "" } }), true);
    assert.equal(fileLikelyNeedsTypeResolver({ file: { opts: { filename: "view.js" }, code: "interface Props {}" } }), true);
    assert.equal(fileLikelyNeedsTypeResolver({ file: { opts: { filename: "view.js" }, code: "const value = 1" } }), false);
    assert.equal(fileLikelyNeedsTypeResolver(null), false);

    const sample = inspect(`
      function none() {}
      function plain(value) {}
      function typed(value: string) {}
      function assigned(value: string = "x") {}
      function object({ plain, typed }: { plain: string; typed: number }) {}
      function nested({ value: inner }: any) {}
      function rest({ ...rest }: any) {}
      function array([first, , third]: [string, number, boolean]) {}
    `);
    const jsState = { file: { opts: { filename: "view.js" }, code: "const x = 1" } };
    const tsState = { file: { opts: { filename: "view.ts" }, code: "" } };
    assert.equal(functionNeedsTypeResolver(sample.functions[0], jsState), false);
    assert.equal(functionNeedsTypeResolver(sample.functions[1], jsState), false);
    assert.equal(functionNeedsTypeResolver(sample.functions[1], tsState), true);
    for (const fn of sample.functions.slice(2)) assert.equal(functionNeedsTypeResolver(fn, jsState), true);
    assert.equal(containsTypeResolutionSyntax(null), false);
    assert.equal(containsTypeResolutionSyntax(sample.functions[1].get("params.0")), false);
    assert.equal(containsTypeResolutionSyntax(sample.functions[2].get("params.0")), true);
    assert.equal(containsTypeResolutionSyntax(sample.functions[3].get("params.0")), true);
    assert.equal(containsTypeResolutionSyntax(sample.functions[5].get("params.0")), true);
    assert.equal(containsTypeResolutionSyntax(sample.functions[6].get("params.0")), true);
    assert.equal(containsTypeResolutionSyntax(sample.functions[7].get("params.0")), true);
  });

  it("recognizes useEmit across free, named, namespace, and shadowed calls", () => {
    const sample = inspect(`
      import { useEmit as emit } from "@litsx/core";
      import * as core from "@litsx/core";
      import * as other from "other";
      emit(); core.useEmit(); other.useEmit(); useEmit();
      function local(useEmit) { useEmit(); }
      core["useEmit"]();
    `);
    assert.equal(isUseEmitCall(sample.calls[0]), true);
    assert.equal(isUseEmitCall(sample.calls[1]), true);
    assert.equal(isUseEmitCall(sample.calls[2]), false);
    assert.equal(isUseEmitCall(sample.calls[3]), true);
    assert.equal(isUseEmitCall(sample.calls[4]), false);
    assert.equal(isUseEmitCall(sample.calls[5]), false);
  });

  it("extracts event names from literals, aliases, interfaces, exports, and cycles", () => {
    const sample = inspect(`
      type Events = { ready: Event; "value-change": CustomEvent; method(): void; [key: string]: Event };
      interface MoreEvents { open: Event; 1: Event }
      export type Exported = Events;
      type Cycle = Cycle;
    `);
    const declarations = new Map(sample.program.node.body.map((node) => {
      const declaration = node.type === "ExportNamedDeclaration" ? node.declaration : node;
      return [declaration?.id?.name, declaration];
    }));
    assert.deepEqual(getEventMapNames(null, sample.program), []);
    assert.deepEqual(getEventMapNames(declarations.get("Events").typeAnnotation, sample.program), ["ready", "value-change"]);
    assert.deepEqual(getEventMapNames(t.tsTypeReference(t.identifier("Events")), sample.program), ["ready", "value-change"]);
    assert.deepEqual(getEventMapNames(t.tsTypeReference(t.identifier("MoreEvents")), sample.program), ["open", 1].filter((name) => typeof name === "string"));
    assert.deepEqual(getEventMapNames(t.tsTypeReference(t.identifier("Exported")), sample.program), ["ready", "value-change"]);
    assert.deepEqual(getEventMapNames(t.tsTypeReference(t.identifier("Cycle")), sample.program), []);
    assert.deepEqual(getEventMapNames(t.tsTypeReference(t.identifier("Missing")), sample.program), []);
    assert.deepEqual(getEventMapNames(t.tsStringKeyword(), sample.program), []);
  });

  it("reads complete explicit event metadata through supported wrappers", () => {
    const valid = t.objectExpression([
      t.objectProperty(t.identifier("events"), t.arrayExpression([t.stringLiteral("z"), t.numericLiteral(1), t.stringLiteral("a")])),
      t.objectProperty(t.stringLiteral("complete"), t.booleanLiteral(false)),
      t.spreadElement(t.identifier("extra")),
    ]);
    assert.deepEqual(readExplicitEventMetadata(valid), { events: ["a", "z"], complete: false, explicit: true });
    assert.deepEqual(readExplicitEventMetadata(t.tsAsExpression(valid, t.tsAnyKeyword())), { events: ["a", "z"], complete: false, explicit: true });
    assert.deepEqual(readExplicitEventMetadata(t.tsTypeAssertion(t.tsAnyKeyword(), valid)), { events: ["a", "z"], complete: false, explicit: true });
    assert.equal(readExplicitEventMetadata(t.identifier("x")), null);
    assert.equal(readExplicitEventMetadata(t.objectExpression([t.objectProperty(t.identifier("events"), t.arrayExpression([]))])), null);
    assert.equal(readExplicitEventMetadata(t.objectExpression([t.objectProperty(t.identifier("complete"), t.booleanLiteral(true))])), null);
    assert.equal(readExplicitEventMetadata(t.objectExpression([t.objectProperty(t.identifier("events"), t.stringLiteral("ready")), t.objectProperty(t.identifier("complete"), t.stringLiteral("yes"))])), null);
  });

  it("collects candidates used exclusively inside noscript", () => {
    const sample = inspect(`function View() {
      return <><noscript><Only /><Shared /><div /></noscript><Shared /><Regular /><ns.Member /></>;
    }`);
    assert.deepEqual([...collectNoscriptOnlyElementCandidates(sample.functions[0])], ["Only"]);
    const noNoscript = inspect("function Plain() { return <Regular />; }");
    assert.deepEqual([...collectNoscriptOnlyElementCandidates(noNoscript.functions[0])], []);
  });

  it("preserves or creates safe class identifiers", () => {
    const named = t.classDeclaration(t.identifier("Named"), null, t.classBody([]));
    assert.equal(ensureClassIdentifier(named, "Fallback").name, "Named");
    const anonymous = t.classExpression(null, null, t.classBody([]));
    assert.equal(ensureClassIdentifier(anonymous, "Fallback").name, "Fallback");
    const defaulted = t.classExpression(null, null, t.classBody([]));
    assert.equal(ensureClassIdentifier(defaulted, "").name, "AnonymousComponent");
    const nonString = t.classExpression(null, null, t.classBody([]));
    assert.equal(ensureClassIdentifier(nonString, null).name, "AnonymousComponent");
  });
});
