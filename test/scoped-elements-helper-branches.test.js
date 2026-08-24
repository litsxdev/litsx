import assert from "node:assert/strict";
import babelTraverse from "@babel/traverse";
import * as t from "@babel/types";
import { describe, it } from "vitest";
import parser from "./helpers/litsx-parser.js";
import {
  consumeStaticIr,
  createClassProperty,
  createElementRegistryValue,
  createRelativeModuleSpecifier,
  ensureImportedElementCandidates,
  ensureRenderLightImport,
  ensureUniqueLocalName,
  hasMixinInSuperChain,
  hasNamedImport,
  hasStaticElementsMember,
  insertClassProperty,
  isInsideScopedNoscriptFallback,
  isRenderLightExpression,
  isWhitespaceJsxText,
  maybeInsertSsrRenderLight,
  maybeInsertSsrRenderLightTemplate,
  normalizeStaticIr,
  replaceInTemplate,
  resolveImportSource,
  resolveTopLevelClassPath,
  setScopedElementsBabelTypes,
} from "../packages/babel-plugin-transform-litsx-scoped-elements/src/index.js";

const traverse = babelTraverse.default || babelTraverse;
setScopedElementsBabelTypes(t);

function inspect(source) {
  const ast = parser.parse(source, { sourceType: "module", plugins: ["jsx"] });
  let program;
  const openings = [];
  const tagged = [];
  traverse(ast, {
    Program(path) { program = path; },
    JSXOpeningElement(path) { openings.push(path); },
    TaggedTemplateExpression(path) { tagged.push(path); },
  });
  return { program, openings, tagged };
}

describe("scoped-elements helper branch behavior", () => {
  it("resolves only top-level and exported class declarations", () => {
    const sample = inspect("class Direct {} export class Exported {} const Expression = class {}; function nested() { class Inner {} }");
    const body = sample.program.get("body");
    assert.equal(resolveTopLevelClassPath(body[0]), body[0]);
    assert.equal(resolveTopLevelClassPath(body[1]).node.id.name, "Exported");
    assert.equal(resolveTopLevelClassPath(body[2]), null);
    assert.equal(resolveTopLevelClassPath(body[3]), null);
  });

  it("creates relative specifiers and collision-free local names", () => {
    assert.equal(createRelativeModuleSpecifier("/app/src/main.js", "/app/src/widget.js"), "./widget.js");
    assert.equal(createRelativeModuleSpecifier("/app/src/main.js", "/app/shared/widget.js"), "../shared/widget.js");
    const sample = inspect("const Button = 1; const __litsxImportedButton1 = 2;");
    assert.equal(ensureUniqueLocalName(sample.program, "Free"), "Free");
    assert.equal(ensureUniqueLocalName(sample.program, "Button"), "__litsxImportedButton2");
  });

  it("reuses or creates named and default element imports", () => {
    const sample = inspect("import Existing, { Button as LocalButton } from 'pkg'; const Card = 1; const __litsxImportedCard1 = 2;");
    const entries = ensureImportedElementCandidates(sample.program, "/app/main.js", [
      { sourceSpecifier: "pkg", sourceFile: "/pkg/index.js", importedName: "Button", originalName: "Button", lightDom: true },
      { sourceSpecifier: "pkg", sourceFile: "/pkg/index.js", importedName: "default", originalName: "DefaultThing" },
      { sourceSpecifier: "pkg", sourceFile: "/pkg/index.js", importedName: "Missing", originalName: "Missing" },
      { sourceFile: "/app/card.js", importedName: "Card", originalName: "Card" },
    ]);
    assert.equal(entries[0].localName, "LocalButton");
    assert.equal(entries[0].lightDom, true);
    assert.equal(entries[1].localName, "Existing");
    assert.equal(entries[2].localName, "Missing");
    assert.equal(entries[3].localName, "__litsxImportedCard2");
    assert.equal(sample.program.get("body").filter((path) => path.isImportDeclaration()).length, 2);
  });

  it("detects noscript ancestry in JSX and lowered primitive calls", () => {
    const sample = inspect("const a = <noscript><Fallback /></noscript>; const b = <Regular />; __litsxNoscript(() => <Lowered />);");
    const fallback = sample.openings.find((path) => path.get("name").isJSXIdentifier({ name: "Fallback" }));
    const regular = sample.openings.find((path) => path.get("name").isJSXIdentifier({ name: "Regular" }));
    const lowered = sample.openings.find((path) => path.get("name").isJSXIdentifier({ name: "Lowered" }));
    assert.equal(isInsideScopedNoscriptFallback(fallback), true);
    assert.equal(isInsideScopedNoscriptFallback(regular), false);
    assert.equal(isInsideScopedNoscriptFallback(lowered), true);
  });

  it("inserts SSR renderLight into empty or self-closing light-DOM JSX", () => {
    const sample = inspect("const a = <Light />; const b = <Light>   </Light>; const c = <Light>child</Light>; const d = <Light>{renderLight()}</Light>;");
    assert.doesNotThrow(() => maybeInsertSsrRenderLight(sample.openings[0], sample.program, { lightDom: true }, { ssr: false }));
    assert.doesNotThrow(() => maybeInsertSsrRenderLight(sample.openings[0], sample.program, { lightDom: false }, { ssr: true }));
    maybeInsertSsrRenderLight(sample.openings[0], sample.program, { lightDom: true }, { ssr: true });
    assert.equal(sample.openings[0].node.selfClosing, false);
    assert.equal(sample.openings[0].parentPath.node.children.length, 1);
    maybeInsertSsrRenderLight(sample.openings[1], sample.program, { lightDom: true }, { ssr: true });
    assert.equal(sample.openings[1].parentPath.node.children.at(-1).type, "JSXExpressionContainer");
    maybeInsertSsrRenderLight(sample.openings[2], sample.program, { lightDom: true }, { ssr: true });
    assert.equal(sample.openings[2].parentPath.node.children.length, 1);
    maybeInsertSsrRenderLight(sample.openings[3], sample.program, { lightDom: true }, { ssr: true });
    assert.equal(sample.openings[3].parentPath.node.children.length, 1);
    assert.equal(isWhitespaceJsxText(t.jsxText("  \n")), true);
    assert.equal(isWhitespaceJsxText(t.stringLiteral(" ")), false);
    assert.equal(isRenderLightExpression(t.jsxExpressionContainer(t.callExpression(t.identifier("renderLight"), []))), true);
    assert.equal(isRenderLightExpression(t.jsxText("")), false);
    assert.equal(isRenderLightExpression(t.jsxExpressionContainer(t.identifier("x"))), false);
  });

  it("reuses, augments, or creates renderLight imports", () => {
    const existing = inspect("import { renderLight as localRender } from '@lit-labs/ssr-client/directives/render-light.js';");
    assert.equal(ensureRenderLightImport(existing.program).name, "localRender");
    const augment = inspect("import { other } from '@lit-labs/ssr-client/directives/render-light.js'; const renderLight = 1;");
    assert.equal(ensureRenderLightImport(augment.program).name, "__litsxImportedrenderLight1");
    const fresh = inspect("const renderLight = 1;");
    assert.equal(ensureRenderLightImport(fresh.program).name, "__litsxImportedrenderLight1");
  });

  it("injects renderLight expressions into matching static templates", () => {
    const sample = inspect("const a = html`before<x-light></x-light>after`; const b = html`<x-light attr=${value}></x-light>`; const c = html`<x-other></x-other>`;");
    assert.equal(maybeInsertSsrRenderLightTemplate(sample.tagged[0].node.quasi, "x-light", sample.program, { lightDom: true }, { ssr: false }), false);
    assert.equal(maybeInsertSsrRenderLightTemplate(sample.tagged[0].node.quasi, "x-light", sample.program, { lightDom: false }, { ssr: true }), false);
    assert.equal(maybeInsertSsrRenderLightTemplate(sample.tagged[0].node.quasi, "x-light", sample.program, { lightDom: true }, { ssr: true }), true);
    assert.equal(sample.tagged[0].node.quasi.expressions.length, 1);
    assert.equal(maybeInsertSsrRenderLightTemplate(sample.tagged[1].node.quasi, "x-light", sample.program, { lightDom: true }, { ssr: true }), false);
    assert.equal(maybeInsertSsrRenderLightTemplate(sample.tagged[2].node.quasi, "x-light", sample.program, { lightDom: true }, { ssr: true }), false);
  });

  it("normalizes and consumes sparse static IR metadata", () => {
    assert.deepEqual(normalizeStaticIr(null), {
      properties: { inferred: [], authored: [] },
      elements: { localCandidates: [], importedCandidates: [], needsRegistry: false },
      lightDom: false,
    });
    const node = { _litsxStaticIr: {
      properties: { inferred: ["a"], authored: ["b"] },
      elements: { localCandidates: ["Card"], importedCandidates: [{ originalName: "Remote" }], needsRegistry: 1 },
      lightDom: 1,
    } };
    const ir = consumeStaticIr(node);
    assert.deepEqual(ir.properties.inferred, ["a"]);
    assert.equal(ir.elements.needsRegistry, true);
    assert.equal(ir.lightDom, true);
    assert.equal("_litsxStaticIr" in node, false);
    assert.deepEqual(consumeStaticIr(null).elements.localCandidates, []);
  });

  it("recognizes nested mixins and static element member spellings", () => {
    assert.equal(hasMixinInSuperChain(null, "LightDomMixin"), false);
    assert.equal(hasMixinInSuperChain(t.callExpression(t.identifier("LightDomMixin"), [t.identifier("Base")]), "LightDomMixin"), true);
    assert.equal(hasMixinInSuperChain(t.callExpression(t.identifier("Outer"), [t.callExpression(t.identifier("LightDomMixin"), [t.identifier("Base")])]), "LightDomMixin"), true);
    assert.equal(hasMixinInSuperChain(t.identifier("Base"), "LightDomMixin"), false);
    const direct = t.classDeclaration(t.identifier("Direct"), null, t.classBody([
      Object.assign(t.classProperty(t.identifier("elements"), t.objectExpression([])), { static: true }),
    ]));
    const stringKey = t.classDeclaration(t.identifier("StringKey"), null, t.classBody([
      Object.assign(t.classProperty(t.stringLiteral("elements"), t.objectExpression([])), { static: true }),
    ]));
    const instance = t.classDeclaration(t.identifier("Instance"), null, t.classBody([
      t.classProperty(t.identifier("elements"), t.objectExpression([])),
    ]));
    assert.equal(hasStaticElementsMember(direct), true);
    assert.equal(hasStaticElementsMember(stringKey), true);
    assert.equal(hasStaticElementsMember(instance), false);
  });

  it("creates registry properties and inserts them after properties metadata", () => {
    const sample = inspect(`import { existing } from "@litsx/core/elements"; class Card { static properties = {}; method() {} }`);
    const classPath = sample.program.get("body.1");
    assert.equal(createClassProperty("elements", [], sample.program), null);
    assert.ok(createClassProperty("elements", [], sample.program, {}, true));
    const clientValue = createElementRegistryValue({ tagName: "x-card", originalName: "Card" }, sample.program, {});
    assert.equal(clientValue.name, "Card");
    const ssrValue = createElementRegistryValue({ tagName: "x-card", originalName: "Card", moduleId: "/card.js" }, sample.program, { ssr: true });
    assert.equal(ssrValue.callee.name, "annotateHydratableCustomElement");
    assert.equal(hasNamedImport(sample.program, "@litsx/core/elements", "annotateHydratableCustomElement"), true);
    assert.equal(hasNamedImport(sample.program, "other", "missing"), false);
    const property = createClassProperty("elements", [{ tagName: "x-card", originalName: "Card" }], sample.program);
    insertClassProperty(classPath.node, property);
    assert.equal(classPath.node.body.body[1].key.name, "elements");
    const noProperties = t.classDeclaration(t.identifier("Plain"), null, t.classBody([]));
    insertClassProperty(noProperties, property);
    assert.equal(noProperties.body.body.length, 1);
  });

  it("replaces exact template tag names and rejects unresolved import sources", () => {
    const quasi = t.templateLiteral([t.templateElement({ raw: "<Card><Cardinal /></Card>", cooked: "<Card><Cardinal /></Card>" }, true)], []);
    assert.equal(replaceInTemplate(quasi, "Card", "x-card"), true);
    assert.equal(quasi.quasis[0].value.raw, "<x-card><Cardinal /></x-card>");
    assert.equal(replaceInTemplate(quasi, "Missing", "x-missing"), false);
    assert.equal(resolveImportSource("/app/main.js", "package"), null);
    assert.equal(resolveImportSource("/app/main.js", null), null);
    assert.equal(resolveImportSource("/app/main.js", "./missing"), null);
  });
});
