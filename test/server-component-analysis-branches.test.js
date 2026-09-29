import assert from "node:assert/strict";
import babelTraverse from "@babel/traverse";
import * as t from "@babel/types";
import { describe, it } from "vitest";
import parser from "./helpers/litsx-parser.js";
import {
  expressionIsRenderableTemplate,
  findServerComponentFunctionPath,
  getAsyncBindingFromIdentifier,
  getCurrentModuleId,
  functionReturnsRenderableTemplate,
  getDefaultExportServerComponentName,
  getForwardedRefParameterName,
  getStaticPropertyValue,
  getStaticServerComponentElements,
  getOrCreateImportedServerComponentCache,
  isAsyncFunctionNode,
  isCapitalizedComponentName,
  isAnnotateHydratableCustomElementCall,
  mergeScopedEntries,
  isLocalComposableServerComponentBinding,
  lowerForwardedServerComponentRefs,
  markServerComponent,
  resolutionsMatch,
  resolveStableElementConstructor,
  setServerComponentBabelTypes,
  unwrapExpression,
  wrapRenderableReturns,
} from "../packages/babel-preset-litsx/src/internal/transform-litsx-server-components.js";
import { buildAvailableMap } from "../packages/babel-preset-litsx/src/internal/transform-litsx-ssr-shared.js";

const traverse = babelTraverse.default || babelTraverse;
setServerComponentBabelTypes(t);

function context(source, filename = "/virtual/server.tsx") {
  const ast = parser.parse(source, { sourceType: "module", plugins: ["jsx", "typescript"] });
  let program;
  const functions = new Map();
  traverse(ast, {
    Program(path) {
      program = path;
      path.hub.file = { opts: { filename } };
    },
    Function(path) {
      const name = path.node.id?.name ?? path.parentPath.node.id?.name;
      if (name) functions.set(name, path);
    },
  });
  return { program, functions };
}

describe("server component analysis branch behavior", () => {
  it("recognizes names, async functions, wrappers, and renderable expression forms", () => {
    assert.equal(isCapitalizedComponentName(null), false);
    assert.equal(isCapitalizedComponentName(""), false);
    assert.equal(isCapitalizedComponentName("lower"), false);
    assert.equal(isCapitalizedComponentName("9Panel"), false);
    assert.equal(isCapitalizedComponentName("Panel"), true);
    assert.equal(isAsyncFunctionNode(null), false);
    assert.equal(isAsyncFunctionNode(t.arrowFunctionExpression([], t.nullLiteral(), true)), true);
    assert.equal(isAsyncFunctionNode(t.arrowFunctionExpression([], t.nullLiteral())), false);
    assert.equal(isAsyncFunctionNode({ async: true, type: "ClassDeclaration" }), false);

    const jsx = t.jsxElement(t.jsxOpeningElement(t.jsxIdentifier("div"), [], true), null, [], true);
    const fragment = t.jsxFragment(t.jsxOpeningFragment(), t.jsxClosingFragment(), []);
    const html = t.taggedTemplateExpression(t.identifier("html"), t.templateLiteral([t.templateElement({ raw: "x" }, true)], []));
    const values = [
      jsx,
      fragment,
      html,
      t.conditionalExpression(t.booleanLiteral(true), t.nullLiteral(), jsx),
      t.logicalExpression("||", t.nullLiteral(), fragment),
      t.sequenceExpression([t.numericLiteral(1), html]),
      t.tsAsExpression(jsx, t.tsAnyKeyword()),
      t.tsSatisfiesExpression(fragment, t.tsAnyKeyword()),
      t.tsNonNullExpression(html),
      t.parenthesizedExpression(jsx),
    ];
    for (const value of values) assert.equal(expressionIsRenderableTemplate(value), true);
    assert.equal(expressionIsRenderableTemplate(null), false);
    assert.equal(expressionIsRenderableTemplate(t.stringLiteral("x")), false);
    assert.equal(expressionIsRenderableTemplate(t.taggedTemplateExpression(t.identifier("css"), html.quasi)), false);
    assert.equal(expressionIsRenderableTemplate(t.conditionalExpression(t.booleanLiteral(true), t.nullLiteral(), t.numericLiteral(1))), false);
    assert.equal(expressionIsRenderableTemplate(t.logicalExpression("&&", t.numericLiteral(1), t.numericLiteral(2))), false);
    assert.equal(expressionIsRenderableTemplate(t.sequenceExpression([t.numericLiteral(1)])), false);
    assert.strictEqual(unwrapExpression(t.tsAsExpression(jsx, t.tsAnyKeyword())), jsx);
  });

  it("finds renderable returns in concise, nested block, and conditional functions", () => {
    const jsx = t.jsxElement(t.jsxOpeningElement(t.jsxIdentifier("main"), [], true), null, [], true);
    assert.equal(functionReturnsRenderableTemplate(null), false);
    assert.equal(functionReturnsRenderableTemplate(t.arrowFunctionExpression([], jsx)), true);
    assert.equal(functionReturnsRenderableTemplate(t.arrowFunctionExpression([], t.numericLiteral(1))), false);
    assert.equal(functionReturnsRenderableTemplate(t.functionExpression(null, [], t.blockStatement([
      t.emptyStatement(),
      t.blockStatement([t.returnStatement(t.numericLiteral(1))]),
      t.ifStatement(t.booleanLiteral(true), t.blockStatement([t.returnStatement(jsx)]), null),
    ]))), true);
    assert.equal(functionReturnsRenderableTemplate(t.functionExpression(null, [], t.blockStatement([
      t.ifStatement(t.booleanLiteral(true), t.returnStatement(t.numericLiteral(1)), t.returnStatement(t.stringLiteral("x"))),
    ]))), false);
  });

  it("resolves default async server components and cache outcomes", () => {
    const cases = [
      [`export default async function ProductPage() { return <main/>; }`, "ProductPage"],
      [`const ProductPage = async () => <main/>; export default ProductPage;`, "ProductPage"],
      [`const ProductPage = async function () { if (ok) return <main/>; return null; }; export default ProductPage;`, "ProductPage"],
      [`export default async function lower() { return <main/>; }`, null],
      [`export default function ProductPage() { return <main/>; }`, null],
      [`const ProductPage = () => <main/>; export default ProductPage;`, null],
      [`export default 1;`, null],
      [`export const value = 1;`, null],
    ];
    for (const [source, expected] of cases) {
      const { program } = context(source);
      assert.equal(getDefaultExportServerComponentName(program), expected);
      assert.equal(getDefaultExportServerComponentName(program), expected);
    }
  });

  it("resolves stable constructors through bindings, objects, branches, and sequences", () => {
    const { program } = context(`
      import RemotePanel, { NamedPanel } from "./remote.js";
      class LocalPanel {}
      function FunctionPanel() {}
      const AliasPanel = LocalPanel;
      const CyclePanel = CyclePanel;
      let MutablePanel = LocalPanel;
      const Bag = { local: LocalPanel, remote: RemotePanel, [dynamic]: LocalPanel };
      const SameChoice = flag ? LocalPanel : LocalPanel;
      const DifferentChoice = flag ? LocalPanel : FunctionPanel;
      const SameLogical = LocalPanel || LocalPanel;
      const LastPanel = (0, LocalPanel);
    `);
    const available = buildAvailableMap(program, { filename: "/virtual/server.tsx" });
    const resolve = (name) => resolveStableElementConstructor(t.identifier(name), program.scope, available, program);
    assert.equal(resolve("RemotePanel").moduleId, "./remote.js");
    assert.equal(resolve("NamedPanel").localName, "NamedPanel");
    assert.equal(resolve("LocalPanel").moduleId, "/virtual/server.tsx");
    assert.equal(resolve("FunctionPanel").localName, "FunctionPanel");
    assert.equal(resolve("AliasPanel").localName, "LocalPanel");
    assert.equal(resolve("CyclePanel"), null);
    assert.equal(resolve("MutablePanel"), null);
    assert.equal(resolve("missing"), null);
    assert.equal(resolve("SameChoice").localName, "LocalPanel");
    assert.equal(resolve("DifferentChoice"), null);
    assert.equal(resolve("SameLogical").localName, "LocalPanel");
    assert.equal(resolve("LastPanel").localName, "LocalPanel");

    const bagLocal = t.memberExpression(t.identifier("Bag"), t.identifier("local"));
    const bagRemote = t.memberExpression(t.identifier("Bag"), t.stringLiteral("remote"), true);
    assert.equal(resolveStableElementConstructor(bagLocal, program.scope, available, program).localName, "LocalPanel");
    assert.equal(resolveStableElementConstructor(bagRemote, program.scope, available, program).localName, "RemotePanel");
    assert.equal(resolveStableElementConstructor(t.memberExpression(t.identifier("Bag"), t.identifier("dynamic"), true), program.scope, available, program), null);
    assert.equal(resolveStableElementConstructor(t.memberExpression(t.identifier("Bag"), t.identifier("missing")), program.scope, available, program), null);
    const annotated = t.callExpression(t.identifier("annotateHydratableCustomElement"), [t.identifier("LocalPanel")]);
    assert.equal(resolveStableElementConstructor(annotated, program.scope, available, program).explicitMetadata, true);
    assert.equal(resolveStableElementConstructor(t.objectExpression([]), program.scope, available, program).objectLiteral, true);
    assert.equal(resolveStableElementConstructor(t.numericLiteral(1), program.scope, available, program), null);
  });

  it("reads explicit element maps and merges inferred entries", () => {
    const { program, functions } = context(`
      import RemotePanel from "./remote.js";
      class LocalPanel {}
      async function ProductPage(_props, forwardedRef) { return <main/>; }
      ProductPage.elements = {
        "remote-panel": RemotePanel,
        localPanel: LocalPanel,
      };
    `);
    const available = buildAvailableMap(program, { filename: "/virtual/server.tsx" });
    const entries = getStaticServerComponentElements(program, "ProductPage", available);
    assert.deepEqual(entries.map((entry) => entry.tagName), ["remote-panel", "localPanel"]);
    assert.strictEqual(getStaticServerComponentElements(program, "ProductPage", available), entries);
    assert.equal(getStaticServerComponentElements(program, "MissingPage", available).length, 0);
    const invalid = context(`async function BadPage() { return <main/>; } BadPage.elements = { bad: 1 };`).program;
    assert.throws(
      () => getStaticServerComponentElements(invalid, "BadPage", buildAvailableMap(invalid)),
      /single stable custom element constructor/,
    );
    assert.equal(getForwardedRefParameterName(functions.get("ProductPage")), "forwardedRef");
    functions.get("ProductPage").node.params[1] = t.objectPattern([]);
    assert.equal(getForwardedRefParameterName(functions.get("ProductPage")), null);

    const merged = mergeScopedEntries(
      [{ tagName: "same", source: "inferred" }, { tagName: "new", source: "inferred" }],
      [{ tagName: "same", source: "explicit" }],
    );
    assert.deepEqual(merged, [
      { tagName: "same", source: "explicit" },
      { tagName: "new", source: "inferred" },
    ]);
    assert.equal(getStaticPropertyValue(t.numericLiteral(1), "x"), null);
    const object = t.objectExpression([
      t.spreadElement(t.identifier("spread")),
      t.objectProperty(t.identifier("first"), t.numericLiteral(1)),
      t.objectProperty(t.stringLiteral("second"), t.numericLiteral(2)),
      t.objectProperty(t.identifier("computed"), t.numericLiteral(3), true),
    ]);
    assert.equal(getStaticPropertyValue(object, "first").value, 1);
    assert.equal(getStaticPropertyValue(object, "second").value, 2);
    assert.equal(getStaticPropertyValue(object, "missing"), null);
    assert.equal(resolutionsMatch(null, {}), false);
    assert.equal(resolutionsMatch({ moduleId: "a", exportName: "b", localName: "c" }, { moduleId: "a", exportName: "b", localName: "c" }), true);
    assert.equal(resolutionsMatch({ moduleId: "a", exportName: "b", localName: "c" }, { moduleId: "x", exportName: "b", localName: "c" }), false);
  });

  it("resolves local async bindings, function paths, module ids, and caches", () => {
    const { program } = context(`
      async function Page() { return <main />; }
      const Arrow = async () => <section />;
      const Sync = () => <div />;
      class ClassPage {}
    `, "/virtual/page.tsx");
    assert.equal(getAsyncBindingFromIdentifier(program, "Page").id.name, "Page");
    assert.equal(getAsyncBindingFromIdentifier(program, "Arrow").async, true);
    assert.equal(getAsyncBindingFromIdentifier(program, "Sync"), null);
    assert.equal(getAsyncBindingFromIdentifier(program, "ClassPage"), null);
    assert.equal(getAsyncBindingFromIdentifier(program, "Missing"), null);
    assert.equal(getAsyncBindingFromIdentifier(null, "Page"), null);
    assert.ok(findServerComponentFunctionPath(program, "Page").isFunctionDeclaration());
    assert.ok(findServerComponentFunctionPath(program, "Arrow").isArrowFunctionExpression());
    assert.equal(findServerComponentFunctionPath(program, "Sync").isArrowFunctionExpression(), true);
    assert.equal(findServerComponentFunctionPath(program, "ClassPage"), null);
    assert.equal(findServerComponentFunctionPath(program, null), null);
    assert.equal(getCurrentModuleId(program), "/virtual/page.tsx");
    const cache = getOrCreateImportedServerComponentCache(program);
    assert.strictEqual(getOrCreateImportedServerComponentCache(program), cache);
    assert.equal(isLocalComposableServerComponentBinding(program, "Page"), true);
    assert.equal(isLocalComposableServerComponentBinding(program, "Arrow"), true);
    assert.equal(isLocalComposableServerComponentBinding(program, "Sync"), false);
    assert.equal(isLocalComposableServerComponentBinding(null, "Page"), false);
  });

  it("recognizes annotations and marks server components idempotently", () => {
    assert.equal(isAnnotateHydratableCustomElementCall(t.callExpression(t.identifier("annotateHydratableCustomElement"), [])), true);
    assert.equal(isAnnotateHydratableCustomElementCall(t.callExpression(t.identifier("other"), [])), false);
    assert.equal(isAnnotateHydratableCustomElementCall(t.identifier("x")), false);
    const { program } = context(`async function Page() { return <main />; }`);
    markServerComponent(program, "Page");
    markServerComponent(program, "Page");
    const marks = program.node.body.filter((node) => node.type === "ExpressionStatement" && node.expression.type === "AssignmentExpression");
    assert.equal(marks.length, 1);
  });

  it("lowers forwarded refs and wraps renderable returns", () => {
    const { program, functions } = context(`
      async function Page(props, forwardedRef) {
        if (props.native) return <input ref={forwardedRef} />;
        return <Widget ref={forwardedRef} other={1} />;
      }
    `);
    const page = functions.get("Page");
    const returns = [];
    page.traverse({ ReturnStatement(path) { returns.push(path); } });
    lowerForwardedServerComponentRefs(returns[0], "forwardedRef");
    lowerForwardedServerComponentRefs(returns[1], "forwardedRef");
    assert.notEqual(returns[0].node.argument.openingElement.attributes[0].name.name, "ref");
    assert.notEqual(returns[1].node.argument.openingElement.attributes[0].name.name, "ref");
    assert.equal(wrapRenderableReturns(page, program), true);
  });
});
