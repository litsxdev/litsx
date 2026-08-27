import assert from "node:assert/strict";
import babelTraverse from "@babel/traverse";
import * as t from "@babel/types";
import { describe, it, vi } from "vitest";
import parser from "./helpers/litsx-parser.js";
import {
  buildModuleAnalysis,
  getOrCreateAvailableNames,
  getOrCreateHelperPaths,
  importedBindingHasLightDomHoist,
  isCompiledComponentExport,
  isExternalCompilationImport,
  isLitComponentExport,
  isLightDomComponentExport,
  isProvableComponentExport,
  resolveDirectImportRequirement,
  resolveExportedHelper,
  resolveImportedElementRequirement,
  resolveImportedHelper,
  setElementCandidatesBabelTypes,
  warnExternalPascalComponentInference,
} from "../packages/babel-preset-litsx/src/internal/transform-litsx-element-candidates.js";

const traverse = babelTraverse.default || babelTraverse;
setElementCandidatesBabelTypes(t);

function program(source) {
  const ast = parser.parse(source, { sourceType: "module", plugins: ["jsx", "typescript"] });
  let result;
  traverse(ast, { Program(path) { result = path; path.scope.crawl(); } });
  return result;
}

function context(overrides = {}) {
  return {
    options: {},
    rootFilename: "/app/root.tsx",
    resolvedImportCache: new Map(),
    moduleAnalysisCache: new Map(),
    getCompilerOptions: () => ({}),
    getModuleResolutionHost: () => ({ fileExists: () => false, readFile: () => undefined }),
    ...overrides,
  };
}

describe("element candidate module helper branches", () => {
  it("collects available names and helper paths across declaration forms and caches", () => {
    const path = program(`
      import DefaultThing, { named as NamedThing } from "pkg";
      class LocalClass {}
      export class ExportedClass {}
      function localFunction() {}
      export function exportedFunction() {}
      const localArrow = () => {}, localValue = 1, { destructured } = source;
      export const exportedArrow = function () {}, exportedValue = 2, [item] = list;
    `);
    const names = getOrCreateAvailableNames(path);
    assert.ok(names.has("DefaultThing"));
    assert.ok(names.has("LocalClass"));
    assert.ok(names.has("ExportedClass"));
    assert.ok(names.has("localFunction"));
    assert.ok(names.has("exportedFunction"));
    assert.ok(names.has("localArrow"));
    assert.ok(names.has("exportedArrow"));
    assert.equal(names.has("destructured"), false);
    assert.equal(getOrCreateAvailableNames(path), names);
    const helpers = getOrCreateHelperPaths(path);
    assert.ok(helpers.has("localFunction"));
    assert.ok(helpers.has("exportedFunction"));
    assert.ok(helpers.has("localArrow"));
    assert.ok(helpers.has("exportedArrow"));
    assert.equal(helpers.has("localValue"), false);
    assert.equal(getOrCreateHelperPaths(path), helpers);
  });

  it("builds import, export, default, marker, and compiled-class analysis", () => {
    const ctx = context();
    const path = program(`
      import DefaultThing, { thing as NamedThing, "string-name" as StringThing } from "pkg";
      import * as Namespace from "pkg-two";
      import { LITSX_COMPONENT as marker } from "@litsx/core/elements";
      class Compiled { static [Symbol.for("litsx.component")] = true; }
      class Plain {}
      function helper() {}
      const arrow = () => {}, value = 1;
      export { Compiled, helper as renamed, NamedThing as forwarded };
      export { default as RemoteDefault, named as RemoteNamed } from "remote";
      export const ExportedArrow = () => {}, ExportedValue = 2;
      export class ExportedClass {}
      export function ExportedFunction() {}
      export default Plain;
    `);
    const analysis = buildModuleAnalysis(path, "", ctx);
    assert.equal(analysis.importBindings.get("DefaultThing").importedName, "default");
    assert.equal(analysis.importBindings.get("NamedThing").importedName, "thing");
    assert.equal(analysis.importBindings.get("StringThing").importedName, "string-name");
    assert.equal(analysis.importBindings.get("Namespace").importedName, "*");
    assert.ok(analysis.compiledComponentLocals.has("Compiled"));
    assert.equal(analysis.exportBindings.get("default").localName, "Plain");
    assert.equal(analysis.exportBindings.get("renamed").localName, "helper");
    assert.equal(analysis.exportBindings.get("RemoteDefault").importedName, "default");
    assert.equal(analysis.exportBindings.get("ExportedArrow").localName, "ExportedArrow");

    const anonymousFunction = buildModuleAnalysis(program("export default function () {}"), "", context());
    assert.ok(anonymousFunction.exportBindings.get("default").path);
    const anonymousClass = buildModuleAnalysis(program("export default class {}"), "", context());
    assert.ok(anonymousClass.exportBindings.get("default").path);
    const defaultArrow = buildModuleAnalysis(program("export default (() => 1)"), "", context());
    assert.ok(defaultArrow.exportBindings.get("default").path);
  });

  it("follows compiled component exports and safely terminates cycles", () => {
    const compiled = { filename: "/compiled.js", exportBindings: new Map([["Card", { localName: "Card" }]]), compiledComponentLocals: new Set(["Card"]), importBindings: new Map() };
    assert.equal(isCompiledComponentExport(null, "Card", context()), false);
    assert.equal(isCompiledComponentExport(compiled, null, context()), false);
    assert.equal(isCompiledComponentExport(compiled, "Missing", context()), false);
    assert.equal(isCompiledComponentExport(compiled, "Card", context()), true);
    assert.equal(isCompiledComponentExport(compiled, "Card", context(), new Set(["/compiled.js:Card"])), false);
    const localPlain = { ...compiled, compiledComponentLocals: new Set(), exportBindings: new Map([["Plain", { localName: "Plain" }]]) };
    assert.equal(isCompiledComponentExport(localPlain, "Plain", context()), false);
  });

  it("proves Lit component exports from actual Lit imports and inheritance chains", () => {
    const ctx = context();
    const analysis = buildModuleAnalysis(program(`
      import { LitElement as LitBase } from "lit";
      import * as Lit from "lit-element";
      import { LitElement as FakeBase } from "not-lit";
      class SharedBase extends LitBase {}
      class LocalLitElement {}
      export class DirectCard extends LitBase {}
      export class NamespaceCard extends Lit["LitElement"] {}
      export class DerivedCard extends SharedBase {}
      export class MixedCard extends withTheme(Lit.LitElement) {}
      const ExpressionCard = class extends LitBase {};
      export class FakeImportedCard extends FakeBase {}
      export class FakeLocalCard extends LocalLitElement {}
      export { ExpressionCard };
    `), "/app/package.js", ctx);

    assert.ok(analysis.classBindings.has("SharedBase"));
    for (const exportName of [
      "DirectCard",
      "NamespaceCard",
      "DerivedCard",
      "MixedCard",
      "ExpressionCard",
    ]) {
      assert.equal(isLitComponentExport(analysis, exportName, ctx), true, exportName);
      assert.equal(isProvableComponentExport(analysis, exportName, ctx), true, exportName);
    }
    assert.equal(isLitComponentExport(analysis, "FakeImportedCard", ctx), false);
    assert.equal(isLitComponentExport(analysis, "FakeLocalCard", ctx), false);
    assert.equal(isLitComponentExport(analysis, "MissingCard", ctx), false);

    const anonymousDefault = buildModuleAnalysis(
      program('import { LitElement } from "lit"; export default class extends LitElement {}'),
      "/app/default.js",
      context(),
    );
    assert.equal(isLitComponentExport(anonymousDefault, "default", context()), true);

    const starLitBase = buildModuleAnalysis(
      program('export * from "lit";'),
      "/app/lit-star.js",
      context(),
    );
    assert.equal(isLitComponentExport(starLitBase, "LitElement", context()), true);

    const cycle = buildModuleAnalysis(program(`
      class CycleA extends CycleB {}
      class CycleB extends CycleA {}
      export { CycleA };
    `), "/app/cycle.js", context());
    assert.equal(isLitComponentExport(cycle, "CycleA", context()), false);
  });

  it("reads light DOM mode from component metadata instead of framework names", () => {
    const ctx = context();
    const analysis = buildModuleAnalysis(program(`
      class SymbolLightCard {
        static [Symbol.for("litsx.lightDom")] = true;
      }
      export class PublicLightCard {
        static lightDom = true;
      }
      export class OpaqueCard {}
      export { SymbolLightCard as AliasedLightCard };
    `), "/app/light-components.js", ctx);

    assert.ok(analysis.lightDomComponentLocals.has("SymbolLightCard"));
    assert.ok(analysis.lightDomComponentLocals.has("PublicLightCard"));
    assert.equal(isLightDomComponentExport(analysis, "AliasedLightCard", ctx), true);
    assert.equal(isLightDomComponentExport(analysis, "PublicLightCard", ctx), true);
    assert.equal(isLightDomComponentExport(analysis, "OpaqueCard", ctx), false);
    assert.equal(isLightDomComponentExport(null, "PublicLightCard", ctx), false);
  });

  it("classifies and deduplicates external PascalCase inference warnings", () => {
    assert.equal(isExternalCompilationImport(null), false);
    assert.equal(isExternalCompilationImport({ sourceFile: "/app/x.js" }), false);
    assert.equal(isExternalCompilationImport({ sourceFile: "/app/node_modules/pkg/x.js", sourceSpecifier: "pkg" }), true);
    const warn = vi.fn();
    const ctx = context({ options: { warn }, moduleAnalysisCache: new Map() });
    const jsxPath = { node: { name: { name: "ExternalCard", loc: null } } };
    warnExternalPascalComponentInference("ExternalCard", null, null, ctx, jsxPath);
    warnExternalPascalComponentInference("ExternalCard", { sourceFile: "/app/x.js", sourceSpecifier: "./x", importedName: "Card" }, null, ctx, jsxPath);
    warnExternalPascalComponentInference("ExternalCard", { sourceFile: "/app/node_modules/pkg/x.js", sourceSpecifier: "pkg" }, null, ctx, jsxPath);
    const requirement = { sourceFile: "/app/node_modules/pkg/x.js", sourceSpecifier: "pkg", importedName: "Card" };
    warnExternalPascalComponentInference("ExternalCard", requirement, null, ctx, jsxPath);
    warnExternalPascalComponentInference("ExternalCard", requirement, null, ctx, jsxPath);
    assert.equal(warn.mock.calls.length, 1);
    const noWarn = context();
    warnExternalPascalComponentInference("ExternalCard", requirement, null, noWarn, jsxPath);
  });

  it("resolves local, imported, reexported, and missing helpers from synthetic analyses", () => {
    const helperPath = { node: { type: "FunctionDeclaration" } };
    const local = {
      filename: "/local.js",
      exportBindings: new Map([
        ["direct", { path: helperPath }],
        ["named", { localName: "helper" }],
        ["missingLocal", { localName: "missing" }],
        ["empty", {}],
      ]),
      helperPaths: new Map([["helper", helperPath]]),
      importBindings: new Map(),
    };
    const ctx = context();
    assert.equal(resolveExportedHelper(local, "missing", ctx), null);
    assert.equal(resolveExportedHelper(local, "direct", ctx).path, helperPath);
    assert.equal(resolveExportedHelper(local, "named", ctx).path, helperPath);
    assert.equal(resolveExportedHelper(local, "missingLocal", ctx), null);
    assert.equal(resolveExportedHelper(local, "empty", ctx), null);
    assert.equal(resolveImportedHelper(local, "missing", ctx), null);
    local.importBindings.set("bad", { resolvedSource: null, importedName: "x" });
    local.importBindings.set("namespace", { resolvedSource: "/x.js", importedName: "*" });
    assert.equal(resolveImportedHelper(local, "bad", ctx), null);
    assert.equal(resolveImportedHelper(local, "namespace", ctx), null);
  });

  it("resolves direct and transitive element requirements", () => {
    const path = program(`
      import { Button as DirectButton } from "pkg";
      import * as UI from "pkg";
      const AliasCard = UI.Card;
      class LocalCard {}
      class UnexportedCard {}
      class UnmappedCard {}
    `);
    const analysis = {
      filename: "/app/helper.js",
      programPath: path,
      importBindings: new Map([
        ["DirectButton", { resolvedSource: "/app/node_modules/pkg/index.js", sourceValue: "pkg", importedName: "Button" }],
        ["UI", { resolvedSource: "/app/node_modules/pkg/index.js", sourceValue: "pkg", importedName: "*" }],
      ]),
      exportBindings: new Map([["LocalCard", { localName: "LocalCard" }], ["AliasExport", { localName: "AliasCard" }]]),
      helperPaths: new Map(),
    };
    const ctx = context();
    assert.equal(resolveDirectImportRequirement("Missing", analysis, ctx, "/root.js"), null);
    assert.equal(resolveDirectImportRequirement("LocalCard", analysis, ctx, "/root.js"), null);
    assert.equal(resolveDirectImportRequirement("DirectButton", analysis, ctx, "/root.js").sourceSpecifier, "pkg");
    assert.equal(resolveDirectImportRequirement("AliasCard", analysis, ctx, "/root.js").importedName, "Card");
    assert.equal(resolveImportedElementRequirement("DirectButton", analysis, ctx, "/root.js").importedName, "Button");
    assert.equal(resolveImportedElementRequirement("AliasCard", analysis, ctx, "/root.js").importedName, "Card");
    assert.equal(resolveImportedElementRequirement("LocalCard", analysis, ctx, "/root.js").importedName, "LocalCard");
    assert.equal(resolveImportedElementRequirement("Missing", analysis, ctx, "/root.js"), null);
    assert.throws(() => resolveImportedElementRequirement("UnexportedCard", analysis, ctx, "/root.js"), /not exported/);
    analysis.exportBindings.set("default", { localName: "Other" });
    assert.throws(() => resolveImportedElementRequirement("UnmappedCard", analysis, ctx, "/root.js"), /cannot be resolved/);
  });

  it("checks light-dom hoists through missing and malformed imported analyses", () => {
    const ctx = context();
    assert.equal(importedBindingHasLightDomHoist(null, ctx), false);
    assert.equal(importedBindingHasLightDomHoist({ resolvedSource: "/x.js", importedName: "*" }, ctx), false);
    assert.equal(importedBindingHasLightDomHoist({ resolvedSource: "/missing.js", importedName: "Thing" }, ctx), false);
  });
});
