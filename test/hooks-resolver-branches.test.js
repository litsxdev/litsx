import assert from "node:assert/strict";
import * as t from "@babel/types";
import { describe, it } from "vitest";
import {
  createStructuralHookResolver,
  getDeclarationImplementationBase,
  getNodeModulesPackageName,
  isStructuralRuntimeHelperSource,
  isSymbolForMarker,
  normalizeHookFilePath,
  normalizeInMemoryHookFiles,
} from "../packages/babel-preset-litsx/src/internal/transform-litsx-hooks.js";

describe("imported hook resolver branch behavior", () => {
  it("normalizes package, declaration, marker, and in-memory inputs", () => {
    assert.equal(normalizeHookFilePath("C:\\repo\\src\\file.ts"), "C:/repo/src/file.ts");
    assert.equal(getNodeModulesPackageName("/repo/node_modules/pkg/index.js"), "pkg");
    assert.equal(getNodeModulesPackageName("/repo/node_modules/@scope/pkg/index.js"), "@scope/pkg");
    assert.equal(getNodeModulesPackageName("/repo/node_modules/@scope"), null);
    assert.equal(getNodeModulesPackageName("/repo/src/file.js"), null);
    assert.equal(getDeclarationImplementationBase(null), null);
    assert.equal(getDeclarationImplementationBase("/pkg/index.d.ts"), "/pkg/index");
    assert.equal(getDeclarationImplementationBase("/pkg/index.d.mts"), "/pkg/index");
    assert.equal(getDeclarationImplementationBase("/pkg/index.d.cts"), "/pkg/index");
    assert.equal(getDeclarationImplementationBase("/pkg/index.ts"), null);

    const marker = t.callExpression(t.memberExpression(t.identifier("Symbol"), t.identifier("for")), [t.stringLiteral("litsx.hook")]);
    assert.equal(isSymbolForMarker(marker, "litsx.hook"), true);
    for (const node of [null, t.identifier("x"), t.callExpression(t.identifier("Symbol"), []), t.callExpression(t.memberExpression(t.identifier("Symbol"), t.identifier("keyFor")), [t.stringLiteral("litsx.hook")])]) {
      assert.equal(isSymbolForMarker(node, "litsx.hook"), false);
    }
    assert.equal(isSymbolForMarker(marker, "other"), false);

    for (const source of ["./structural-hooks-runtime.js", "./structural-hooks-runtime", "pkg/structural-hooks-runtime.js"]) {
      assert.equal(isStructuralRuntimeHelperSource(source), true);
    }
    assert.equal(isStructuralRuntimeHelperSource(null), false);
    assert.equal(isStructuralRuntimeHelperSource("./other.js"), false);
    assert.equal(normalizeInMemoryHookFiles(null).size, 0);
    assert.equal(normalizeInMemoryHookFiles({ "/a.js": "code", "/b.js": 1 }).size, 1);
  });

  it("resolves direct structural definitions, custom hooks, and cycles", () => {
    const resolver = createStructuralHookResolver({
      inMemoryFiles: {
        "/app/structural.js": `
          import { defineHook } from "@litsx/core";
          export const useLayout = defineHook({ use() {} });
          export function useFeature() { return useLayout(); }
          export function useCycleA() { return useCycleB(); }
          function useCycleB() { return useCycleA(); }
          export function useClean() { return 1; }
        `,
      },
    });
    const input = (importedName) => resolver({ filename: "/app/main.js", source: "./structural", importedName });
    assert.equal(input("useLayout").kind, "structural-hook");
    assert.equal(input("useFeature"), "structural-custom-hook");
    assert.equal(input("useCycleA"), false);
    assert.equal(input("useClean"), false);
    assert.equal(input("missing"), false);
    assert.equal(input(null), false);
    assert.equal(resolver({ filename: "", source: "./structural", importedName: "useLayout" }), false);
    assert.equal(resolver({ filename: "/app/main.js", source: null, importedName: "useLayout" }), false);
  });

  it("follows named, namespace, default, and export-all structural chains", () => {
    const resolver = createStructuralHookResolver({
      inMemoryFiles: {
        "/app/base.js": `import { defineHook } from "./structural-hooks-runtime.js"; export const useBase = defineHook({ mixin: (Base) => class extends Base {} });`,
        "/app/named.js": `import { useBase as localBase } from "./base.js"; export { localBase as useNamed };`,
        "/app/barrel.js": `export * from "./named.js";`,
        "/app/namespace.js": `import * as hooks from "./base.js"; export function useNamespace() { return hooks.useBase(); }`,
        "/app/default.js": `import runtime from "@litsx/core"; export const useDefault = runtime.defineHook({ use() {} });`,
        "/app/reexport.js": `export { useBase as useRemote } from "./base.js";`,
      },
    });
    const resolve = (source, importedName) => resolver({ filename: "/app/main.js", source, importedName });
    assert.equal(resolve("./named", "useNamed").kind, "structural-hook");
    assert.equal(resolve("./barrel", "useNamed").kind, "structural-hook");
    assert.equal(resolve("./namespace", "useNamespace"), "structural-custom-hook");
    assert.equal(resolve("./default", "useDefault").kind, "structural-hook");
    assert.equal(resolve("./reexport", "useRemote").kind, "structural-hook");
    assert.equal(resolve("./barrel", "missing"), false);
  });

  it("resolves runtime custom hooks across direct, local, namespace, and reexport chains", () => {
    const resolver = createStructuralHookResolver({
      runtimeCustomHookSources: ["runtime-kit"],
      runtimeCustomHookNames: ["useRuntimeKit"],
      inMemoryFiles: {
        "/app/runtime.js": `
          import { useState } from "@litsx/core";
          import { useRuntimeKit } from "runtime-kit";
          import * as core from "@litsx/core";
          import * as kit from "runtime-kit";
          export function useDirect() { return useState(0); }
          export const useArrow = () => useDirect();
          export function useNamespace() { return core.useEffect(() => {}); }
          export function useConfigured() { return useRuntimeKit(); }
          export function useConfiguredNamespace() { return kit.useRuntimeKit(); }
          export function useClean() { return 1; }
        `,
        "/app/reexport.js": `export { useDirect as useAgain } from "./runtime.js";`,
        "/app/barrel.js": `export * from "./reexport.js";`,
        "/app/consumer.js": `import * as hooks from "./runtime.js"; export function useThroughNamespace() { return hooks.useDirect(); }`,
      },
    });
    const resolve = (source, importedName) => resolver({ filename: "/app/main.js", source, importedName, runtimeCustomOnly: true });
    for (const name of ["useDirect", "useArrow", "useNamespace", "useConfigured", "useConfiguredNamespace"]) {
      assert.equal(resolve("./runtime", name), "runtime-custom-hook");
    }
    assert.equal(resolve("./runtime", "useClean"), false);
    assert.equal(resolve("./reexport", "useAgain"), "runtime-custom-hook");
    assert.equal(resolve("./barrel", "useAgain"), "runtime-custom-hook");
    assert.equal(resolve("./consumer", "useThroughNamespace"), "runtime-custom-hook");
    assert.equal(resolve("./runtime", "missing"), "unresolved-custom-hook");
  });

  it("recognizes compiled metadata and rejects unsupported external hooks", () => {
    const resolver = createStructuralHookResolver({
      inMemoryFiles: {
        "/app/node_modules/pkg/index.js": `
          export function useCompiled() { return 1; }
          useCompiled[Symbol.for("litsx.hook")] = true;
          export function useStructural() { return 1; }
          useStructural[Symbol.for("litsx.structuralHooks")] = [];
          export function useUnsupported() { return 1; }
        `,
        "/app/node_modules/pkg/bad.js": `export function useBad( {`,
      },
    });
    const resolveRuntime = (source, importedName) => resolver({ filename: "/app/main.js", source, importedName, runtimeCustomOnly: true });
    assert.equal(resolveRuntime("./node_modules/pkg/index.js", "useCompiled"), "runtime-custom-hook");
    assert.equal(resolveRuntime("./node_modules/pkg/index.js", "useUnsupported"), "unsupported-external-hook");
    assert.equal(resolveRuntime("./node_modules/pkg/index.js", "missing"), "unsupported-external-hook");
    assert.equal(resolveRuntime("./node_modules/pkg/bad.js", "useBad"), "unsupported-external-hook");
    assert.equal(resolver({ filename: "/app/main.js", source: "./node_modules/pkg/index.js", importedName: "useStructural" }), "structural-custom-hook");

    const transformed = createStructuralHookResolver({
      transformDependencies: ["pkg"],
      inMemoryFiles: { "/app/node_modules/pkg/index.js": `export function usePlain() { return 1; }` },
    });
    assert.equal(transformed({ filename: "/app/main.js", source: "./node_modules/pkg/index.js", importedName: "usePlain", runtimeCustomOnly: true }), false);
  });

  it("honors path mappings, index resolution, TypeScript syntax, and shared caches", () => {
    const session = { importedHookModuleAnalysisCache: new Map(), resolvedImportCache: new Map() };
    const resolver = createStructuralHookResolver({
      __litsxCompilationSession: session,
      compilerOptions: {
        baseUrl: "/app",
        paths: {
          "@hooks/*": ["src/*"],
          exact: ["src/hooks"],
          "broken/*": ["src/*/*"],
        },
      },
      inMemoryFiles: {
        "/app/src/hooks/index.ts": `
          import { defineHook } from "@litsx/core";
          export const useTyped = defineHook({ use: (() => 1) satisfies () => number });
        `,
      },
    });
    const aliased = resolver({ filename: "/app/main.ts", source: "@hooks/hooks", importedName: "useTyped" });
    assert.equal(aliased.kind, "structural-hook");
    assert.equal(resolver({ filename: "/app/main.ts", source: "exact", importedName: "useTyped" }).kind, "structural-hook");
    assert.equal(resolver({ filename: "/app/main.ts", source: "broken/hooks", importedName: "useTyped" }), false);
    assert.ok(session.importedHookModuleAnalysisCache.size > 0);
    assert.ok(session.resolvedImportCache.size > 0);
  });
});
