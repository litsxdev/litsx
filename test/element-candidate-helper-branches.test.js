import assert from "node:assert/strict";
import babelTraverse from "@babel/traverse";
import * as t from "@babel/types";
import { describe, it } from "vitest";
import parser from "./helpers/litsx-parser.js";
import {
  getNamespaceMemberAliasInfo,
  getParserPluginsForModule,
  helperPathHasLightDomHoist,
  isCapitalizedName,
  isElementCandidateSymbolForMarker,
  isInsideFunctionOrClass,
  isInsideNoscriptFallback,
  isProgramLevelBinding,
  setElementCandidatesBabelTypes,
  unwrapNamespaceAliasExpression,
  validateComponentName,
} from "../packages/babel-preset-litsx/src/internal/transform-litsx-element-candidates.js";

const traverse = babelTraverse.default || babelTraverse;
setElementCandidatesBabelTypes(t);

function inspect(source, plugins = ["jsx", "typescript"]) {
  const ast = parser.parse(source, { sourceType: "module", plugins });
  let program;
  const identifiers = [];
  const functions = [];
  traverse(ast, {
    Program(path) { program = path; },
    JSXIdentifier(path) { identifiers.push(path); },
    Function(path) { functions.push(path); },
  });
  return { program, identifiers, functions };
}

describe("element candidate helper branch behavior", () => {
  it("detects noscript and function or class ancestry", () => {
    const sample = inspect("const top = <Top />; function View() { return <noscript><Fallback /></noscript>; } class Box { method() { return <Inside />; } }");
    const fallback = sample.identifiers.find((path) => path.node.name === "Fallback");
    const top = sample.identifiers.find((path) => path.node.name === "Top");
    const inside = sample.identifiers.find((path) => path.node.name === "Inside");
    assert.equal(isInsideNoscriptFallback(fallback), true);
    assert.equal(isInsideNoscriptFallback(top), false);
    assert.ok(isInsideFunctionOrClass(fallback));
    assert.ok(isInsideFunctionOrClass(inside));
    assert.equal(isInsideFunctionOrClass(top), null);
  });

  it("classifies component names and program-level bindings", () => {
    for (const name of ["View", "Élement", "A"]) assert.equal(isCapitalizedName(name), true);
    for (const name of [null, "", "view", "1Thing", "-Thing"]) assert.equal(isCapitalizedName(name), false);
    const sample = inspect("const Top = 1; function outer() { const Inner = 2; return <Inner />; }");
    assert.equal(isProgramLevelBinding(sample.program.scope.getBinding("Top")), true);
    const innerPath = sample.identifiers.find((path) => path.node.name === "Inner");
    assert.equal(isProgramLevelBinding(innerPath.scope.getBinding("Inner")), false);
    assert.equal(isProgramLevelBinding(null), false);
  });

  it("validates known, compatible, unknown, scoped-original, and local JSX names", () => {
    const sample = inspect("const Known = 1; function render() { const Local = 2; return <Local />; }");
    const knownNode = t.jsxIdentifier("Known");
    const localPath = sample.identifiers.find((path) => path.node.name === "Local");
    const context = { availableNames: new Set(), compatPascalNames: new Set(), options: {} };
    assert.equal(validateComponentName(null, sample.program, context), null);
    assert.equal(validateComponentName(t.identifier("Known"), sample.program, context), null);
    assert.equal(validateComponentName(t.jsxIdentifier("div"), sample.program, context), null);
    assert.equal(validateComponentName(knownNode, sample.program, context), "Known");
    assert.equal(validateComponentName(t.jsxIdentifier("Local"), localPath, context), null);
    context.availableNames.add("Available");
    assert.equal(validateComponentName(t.jsxIdentifier("Available"), sample.program, context), "Available");
    context.compatPascalNames.add("Compat");
    assert.equal(validateComponentName(t.jsxIdentifier("Compat"), sample.program, context), null);
    context.options.allowUnknownPascalCase = true;
    assert.equal(validateComponentName(t.jsxIdentifier("Allowed"), sample.program, context), null);
    context.options.allowUnknownPascalCase = false;
    assert.throws(() => validateComponentName(t.jsxIdentifier("Missing"), sample.program, context), /Unknown LitSX component/);
    const scoped = t.jsxIdentifier("generated-tag");
    scoped.__scopedOriginal = "Available";
    assert.equal(validateComponentName(scoped, sample.program, context), "Available");
  });

  it("selects parser plugins and recognizes Symbol.for markers", () => {
    for (const filename of ["a.ts", "a.mts", "a.cts", "a.tsx", "a.litsx"]) {
      assert.deepEqual(getParserPluginsForModule(filename, ""), ["jsx", "typescript"]);
    }
    assert.deepEqual(getParserPluginsForModule("a.js", "const value = input satisfies Shape"), ["jsx", "typescript"]);
    assert.deepEqual(getParserPluginsForModule("a.js", "const value = input as Shape"), ["jsx", "typescript"]);
    assert.deepEqual(getParserPluginsForModule("a.js", "const value = 1"), ["jsx"]);
    const marker = t.callExpression(t.memberExpression(t.identifier("Symbol"), t.identifier("for")), [t.stringLiteral("litsx.component")]);
    assert.equal(isElementCandidateSymbolForMarker(marker, "litsx.component"), true);
    assert.equal(isElementCandidateSymbolForMarker(marker, "other"), false);
    for (const invalid of [null, t.identifier("x"), t.callExpression(t.identifier("Symbol"), []), t.callExpression(t.memberExpression(t.identifier("Other"), t.identifier("for")), [t.stringLiteral("litsx.component")])]) {
      assert.equal(isElementCandidateSymbolForMarker(invalid, "litsx.component"), false);
    }
  });

  it("unwraps every TypeScript namespace alias wrapper", () => {
    const base = t.memberExpression(t.identifier("ns"), t.identifier("Button"));
    const wrapped = t.tsAsExpression(
      t.tsNonNullExpression(
        t.tsTypeAssertion(t.tsAnyKeyword(), t.tsSatisfiesExpression(base, t.tsAnyKeyword())),
      ),
      t.tsAnyKeyword(),
    );
    assert.equal(unwrapNamespaceAliasExpression(wrapped), base);
    assert.equal(unwrapNamespaceAliasExpression(base), base);
    assert.equal(unwrapNamespaceAliasExpression(null), null);
  });

  it("resolves valid namespace member aliases and rejects malformed bindings", () => {
    const sample = inspect(`
      import * as ns from "pkg";
      const Direct = ns.Button;
      const Wrapped = (ns.Card as any)!;
      const Computed = ns[key];
      const Nested = other.Button;
      let Missing;
      function local() { const Local = ns.Local; return Local; }
    `);
    const moduleAnalysis = {
      programPath: sample.program,
      importBindings: new Map([["ns", { importedName: "*", sourceValue: "pkg", resolvedSource: "/pkg/index.js" }]]),
    };
    assert.deepEqual(getNamespaceMemberAliasInfo("Direct", moduleAnalysis), {
      localName: "Direct", namespaceName: "ns", importedName: "Button", sourceValue: "pkg", resolvedSource: "/pkg/index.js",
    });
    assert.equal(getNamespaceMemberAliasInfo("Wrapped", moduleAnalysis).importedName, "Card");
    for (const name of ["Computed", "Nested", "Missing", "Local", "Unknown"]) {
      assert.equal(getNamespaceMemberAliasInfo(name, moduleAnalysis), null);
    }
    moduleAnalysis.importBindings.set("ns", { importedName: "Button", resolvedSource: "/pkg/index.js" });
    assert.equal(getNamespaceMemberAliasInfo("Direct", moduleAnalysis), null);
    moduleAnalysis.importBindings.set("ns", { importedName: "*", resolvedSource: null });
    assert.equal(getNamespaceMemberAliasInfo("Direct", moduleAnalysis), null);
  });

  it("detects light-DOM hoists only in supported function bodies", () => {
    const sample = inspect("function yes() { __litsx_static_lightDom(); } function wrong() { other(); } const arrow = () => __litsx_static_lightDom();");
    assert.equal(helperPathHasLightDomHoist(sample.functions[0]), true);
    assert.equal(helperPathHasLightDomHoist(sample.functions[1]), false);
    assert.equal(helperPathHasLightDomHoist(sample.functions[2]), false);
    assert.equal(helperPathHasLightDomHoist(null), false);
  });
});
