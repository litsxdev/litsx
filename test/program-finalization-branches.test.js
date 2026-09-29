import assert from "node:assert/strict";
import babelTraverse from "@babel/traverse";
import * as t from "@babel/types";
import { describe, it } from "vitest";
import parser from "./helpers/litsx-parser.js";
import {
  ensureNamedImport,
  ensureNamedImportAcross,
  finalizeProgram,
  setProgramBabelTypes,
} from "../packages/babel-preset-litsx/src/internal/transform-litsx-program.js";

const traverse = babelTraverse.default || babelTraverse;
setProgramBabelTypes(t);

function program(source) {
  const ast = parser.parse(source, { sourceType: "module", plugins: ["jsx"] });
  let result;
  traverse(ast, { Program(path) { result = path; } });
  return result;
}

describe("program finalization branches", () => {
  it("handles named, namespace, missing, and cross-import helpers", () => {
    const named = program('import { html } from "lit";');
    const importPath = named.get("body.0");
    assert.strictEqual(ensureNamedImport(importPath, "html"), true);
    assert.strictEqual(ensureNamedImport(importPath, "css"), true);
    assert.strictEqual(ensureNamedImportAcross([importPath], "css"), true);
    assert.strictEqual(ensureNamedImportAcross([], "css"), false);

    const namespace = program('import * as lit from "lit";');
    assert.strictEqual(ensureNamedImport(namespace.get("body.0"), "css"), false);
    assert.strictEqual(ensureNamedImportAcross([namespace.get("body.0")], "css"), false);
  });

  it("injects every optional runtime dependency from an empty program", () => {
    const root = program("class View {} const Component = () => null;");
    root.node.body[0]._litsxStaticSymbolDeclarations = [
      t.variableDeclaration("const", [t.variableDeclarator(t.identifier("classHoist"), t.numericLiteral(1))]),
    ];
    root.node.body[1].declarations[0].init._litsxStaticSymbolDeclarations = [
      t.variableDeclaration("const", [t.variableDeclarator(t.identifier("functionHoist"), t.numericLiteral(2))]),
    ];
    finalizeProgram(root, {
      __litsxTransformCount: 1,
      __litsxNeedsCss: true,
      __litsxNeedsUnsafeCss: true,
      __litsxNeedsPropertyDeclarationMerge: true,
      __litsxNeedsLightDomMixin: true,
      __litsxNeedsHydrationSuspenseMixin: true,
      __litsxNeedsModuleIdMetadata: true,
      __litsxNeedsCallbackRef: true,
      __litsxNeedsRenderWithHooks: true,
      __litsxNeedsRendererCallImport: true,
    });
    const sources = root.node.body.filter(t.isImportDeclaration).map((node) => node.source.value);
    assert.ok(sources.includes("lit"));
    assert.ok(sources.includes("@litsx/core/elements"));
    assert.ok(sources.includes("@litsx/core"));
    assert.ok(sources.includes("@litsx/core/rendering"));
    assert.strictEqual(root.node.body.some((node) => t.isVariableDeclaration(node) && node.declarations[0].id.name === "classHoist"), true);
    assert.strictEqual(root.node.body.some((node) => t.isVariableDeclaration(node) && node.declarations[0].id.name === "functionHoist"), true);
  });

  it("reuses existing ordinary imports and works around namespace-only imports", () => {
    const root = program(`
      import * as litNs from "lit";
      import { html } from "lit";
      import * as elements from "@litsx/core/elements";
      import * as core from "@litsx/core";
      import * as rendering from "@litsx/core/rendering";
    `);
    finalizeProgram(root, {
      __litsxTransformCount: 1,
      __litsxNeedsCss: true,
      __litsxNeedsUnsafeCss: true,
      __litsxNeedsPropertyDeclarationMerge: true,
      __litsxNeedsLightDomMixin: true,
      __litsxNeedsHydrationSuspenseMixin: true,
      __litsxNeedsModuleIdMetadata: true,
      __litsxNeedsCallbackRef: true,
      __litsxNeedsRenderWithHooks: true,
      __litsxNeedsRendererCallImport: true,
    });
    assert.ok(root.node.body.filter(t.isImportDeclaration).length > 5);
  });
});
