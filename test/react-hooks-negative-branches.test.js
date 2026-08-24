import { describe, expect, it } from "vitest";
import * as babelCore from "@babel/core";
import babelTraverse from "@babel/traverse";
import * as t from "@babel/types";
import parser from "./helpers/litsx-parser.js";
import reactHooksPlugin, {
  attachCompiledCustomHookMetadata,
  createCallbackRuntimeCall,
  createExternalStoreRuntimeCall,
  createImperativeRuntimeCall,
  createMemoRuntimeCall,
  createReducerRuntimeCall,
  createRuntimeCall,
  ensureReactRefAdapterImport,
  ensureRuntimeImport,
  getFunctionFromBinding,
  isCompatUseContextBinding,
  isCustomHookName,
  isSupportedCustomHookBinding,
  parseDependencies,
  popHostExpression,
  pushHostExpression,
  removeHookImports,
} from "../packages/babel-preset-react-compat/src/internal/react-hooks.js";

const traverse = babelTraverse.default || babelTraverse;

function run(code, options) {
  const ast = parser.parse(code, { sourceType: "module" });
  return babelCore.transformFromAstSync(ast, code, {
    configFile: false,
    babelrc: false,
    plugins: [[reactHooksPlugin, options]],
  }).code;
}

function inspect(code) {
  const ast = parser.parse(code, { sourceType: "module" });
  let program;
  const calls = [];
  traverse(ast, {
    Program(path) { program = path; },
    CallExpression(path) { calls.push(path); },
  });
  return { program, calls };
}

describe("React hooks negative branch matrix", () => {
  it("leaves invalid builtin hook shapes untouched", () => {
    const code = run(`
      import React, {
        useEffect, useLayoutEffect, useMemo, useCallback, useReducer, useImperativeHandle,
        useSyncExternalStore, useOptimistic, startTransition
      } from "react";
      class Matrix {
        render() {
          useEffect();
          useEffect(fn, deps);
          useLayoutEffect(fn, [, value]);
          useLayoutEffect(fn, [...deps]);
          consume(useEffect(fn, []));
          useMemo();
          useMemo(fn, deps);
          useCallback();
          useCallback(fn, deps);
          useReducer();
          useImperativeHandle(ref);
          consume(useImperativeHandle(ref, fn));
          useImperativeHandle(ref, fn, deps);
          useSyncExternalStore(subscribe);
          useOptimistic();
          startTransition();
          React.unsupported();
          other.useMemo(fn, []);
          return null;
        }
      }
    `);
    expect(code).toContain("useEffect()");
    expect(code).toContain("useMemo()");
    expect(code).toContain("useReducer()");
    expect(code).toContain("startTransition()");
  });

  it("does not transform calls without a render host", () => {
    const code = run(`
      import { useMemo, useContext } from "react";
      import { useContext as compatContext } from "@litsx/core/context";
      const a = useMemo(() => 1, []);
      const b = useContext(Context);
      const c = compatContext(Context);
      function ordinary() { return useMemo(() => 2, []); }
    `);
    expect(code).toContain("useMemo(() => 1, [])");
    expect(code).toContain("useContext(Context)");
  });

  it("covers imported custom-hook opt-outs and namespace detection", () => {
    const disabled = run(`
      import useRemote from "hooks";
      import * as Hooks from "hooks";
      import thing from "other";
      class Example { render() { useRemote(); Hooks.useRemote(); Hooks.other(); thing(); return null; } }
    `, { transformImportedCustomHooks: false });
    expect(disabled).toContain("useRemote()");

    const enabled = run(`
      import useRemote from "hooks";
      import * as Hooks from "hooks";
      class Example { render() { useRemote(); Hooks.useRemote(); return null; } }
    `);
    expect(enabled).toContain("renderWithHooks");
  });

  it("covers local custom-hook binding shapes and class exits", () => {
    const code = run(`
      import { useMemo } from "react";
      const useArrow = () => useMemo(() => 1, []);
      const useValue = 1;
      let useMissing;
      function useDeclared() { return useMemo(() => 2, []); }
      class NoRender { method() { return useDeclared(); } }
      class HasRender { render() { useArrow(); useDeclared(); useValue(); useMissing(); return null; } }
      const Expression = class { render() { return useDeclared(); } };
    `);
    expect(code).toContain("useArrow[Symbol.for(\"litsx.hook\")] = true");
    expect(code).toContain("useDeclared[Symbol.for(\"litsx.hook\")] = true");
  });

  it("covers optional argument forwarding", () => {
    const code = run(`
      import { useOptimistic, useDeferredValue, useSyncExternalStore } from "react";
      class OptionalArgs { render() {
        const a = useOptimistic(value);
        const b = useDeferredValue();
        const c = useDeferredValue(value);
        const d = useSyncExternalStore(subscribe, snapshot, serverSnapshot);
        return [a,b,c,d];
      } }
    `);
    expect(code).toContain("useOptimistic(value)");
    expect(code).toContain("useDeferredValue()");
    expect(code).toContain("useExternalStore(subscribe, snapshot, serverSnapshot)");
  });

  it("covers custom-hook bindings and host-expression stacks", () => {
    run("const warmup = 1;");
    for (const name of ["useThing", "use2"]) expect(isCustomHookName(name)).toBe(true);
    for (const name of [null, "use", "user"]) expect(isCustomHookName(name)).toBe(false);
    const sample = inspect("function useDeclared() {} const useArrow = () => {}; const useExpression = function () {}; const value = 1;");
    const bindings = sample.program.scope.getAllBindings();
    expect(isSupportedCustomHookBinding(null)).toBe(false);
    expect(isSupportedCustomHookBinding(bindings.useDeclared.path)).toBe(true);
    expect(isSupportedCustomHookBinding(bindings.useArrow.path)).toBe(true);
    expect(isSupportedCustomHookBinding(bindings.useExpression.path)).toBe(true);
    expect(isSupportedCustomHookBinding(bindings.value.path)).toBe(false);
    expect(getFunctionFromBinding({})).toBeNull();
    expect(getFunctionFromBinding(bindings.useDeclared)).toBe(bindings.useDeclared.path);
    expect(getFunctionFromBinding(bindings.useArrow).isArrowFunctionExpression()).toBe(true);
    expect(getFunctionFromBinding(bindings.value)).toBeNull();
    const state = {};
    popHostExpression(state);
    pushHostExpression(state, t.thisExpression());
    pushHostExpression(state, t.booleanLiteral(true));
    popHostExpression(state);
    expect(state.hostExpressions).toHaveLength(1);
  });

  it("creates every runtime-call shape with and without optional arguments", () => {
    run("const warmup = 1;");
    const fn = t.arrowFunctionExpression([], t.numericLiteral(1));
    expect(createRuntimeCall({}, "useEffect", fn, null).callee.name).toBe("useAfterUpdate");
    expect(createRuntimeCall({}, "useLayoutEffect", fn, []).callee.name).toBe("useOnCommit");
    expect(createMemoRuntimeCall({}, fn, null).arguments).toHaveLength(1);
    expect(createMemoRuntimeCall({}, fn, []).arguments).toHaveLength(2);
    expect(createCallbackRuntimeCall({}, fn, null).arguments).toHaveLength(1);
    expect(createCallbackRuntimeCall({}, fn, []).arguments).toHaveLength(2);
    expect(createReducerRuntimeCall({}, null).arguments).toHaveLength(0);
    expect(createReducerRuntimeCall({}, [t.identifier("a"), undefined, t.identifier("b")]).arguments).toHaveLength(2);
    expect(createImperativeRuntimeCall({}, t.identifier("ref"), fn, null).arguments[0].callee.name).toBe("toLitRef");
    expect(createImperativeRuntimeCall({ reactRefAdapterLocal: "adapt" }, t.identifier("ref"), fn, []).arguments).toHaveLength(3);
    expect(createExternalStoreRuntimeCall({}, t.identifier("sub"), t.identifier("get"), null).arguments).toHaveLength(2);
    expect(createExternalStoreRuntimeCall({}, t.identifier("sub"), t.identifier("get"), t.identifier("server")).arguments).toHaveLength(3);
  });

  it("parses dependency arrays including omitted, holes, spreads, and expressions", () => {
    run("const warmup = 1;");
    const sample = inspect("a(); b(value); c([]); d([one, two]); e([, one]); f([...items]);");
    expect(parseDependencies(undefined)).toEqual({ ok: true, deps: null });
    expect(parseDependencies(sample.calls[1].get("arguments.0"))).toEqual({ ok: false });
    expect(parseDependencies(sample.calls[2].get("arguments.0"))).toEqual({ ok: true, deps: [] });
    expect(parseDependencies(sample.calls[3].get("arguments.0")).deps).toHaveLength(2);
    expect(parseDependencies(sample.calls[4].get("arguments.0"))).toEqual({ ok: false });
    expect(parseDependencies(sample.calls[5].get("arguments.0"))).toEqual({ ok: false });
  });

  it("recognizes compat context imports and manages runtime imports", () => {
    run("const warmup = 1;");
    const sample = inspect(`
      import { useContext as reactContext } from "react";
      import { useContext as compatContext } from "@litsx/core/context";
      import { other } from "other";
      reactContext(); compatContext(); other();
    `);
    const bindings = sample.program.scope.getAllBindings();
    expect(isCompatUseContextBinding(null)).toBe(false);
    expect(isCompatUseContextBinding(bindings.other)).toBe(false);
    expect(isCompatUseContextBinding(bindings.reactContext)).toBe(true);
    expect(isCompatUseContextBinding(bindings.compatContext)).toBe(true);

    ensureRuntimeImport(sample.program, { runtimeNeeded: false });
    ensureRuntimeImport(sample.program, {
      runtimeNeeded: true,
      renderBoundaryNeeded: true,
      effectNeeded: true,
      layoutNeeded: true,
      memoNeeded: true,
      callbackNeeded: true,
      reducerNeeded: true,
      idNeeded: true,
      imperativeNeeded: true,
      externalStoreNeeded: true,
      optimisticNeeded: true,
      transitionNeeded: true,
      deferredNeeded: true,
      startTransitionNeeded: true,
    });
    const runtimeImport = sample.program.node.body.find((node) => node.type === "ImportDeclaration" && node.source.value === "@litsx/core");
    expect(runtimeImport.specifiers.length).toBe(13);
    ensureRuntimeImport(sample.program, { runtimeNeeded: true, effectNeeded: true });
  });

  it("adds adapter and compiled-hook metadata while preserving existing forms", () => {
    run("const warmup = 1;");
    const sample = inspect(`
      import * as adapters from "@litsx/core/react-compat";
      function useFunction() {}
      const useVariable = () => {};
      class useClass {}
      function useMarked() {}
      useMarked[Symbol.for("litsx.hook")] = true;
    `);
    ensureReactRefAdapterImport(sample.program, { imperativeNeeded: false });
    ensureReactRefAdapterImport(sample.program, { imperativeNeeded: true, reactRefAdapterLocal: "adapt" });
    ensureReactRefAdapterImport(sample.program, { imperativeNeeded: true, reactRefAdapterLocal: "adapt" });
    attachCompiledCustomHookMetadata(sample.program, { compiledCustomHookNames: new Set(["missing", "useFunction", "useVariable", "useClass", "useMarked"]) });
    expect(sample.program.node.body.filter((node) => node.type === "ExpressionStatement").length).toBeGreaterThan(1);
  });

  it("removes transformed and unused React hook imports without touching live imports", () => {
    run("const warmup = 1;");
    const sample = inspect(`
      import { useMemo, useEffect, useCallback, keep } from "react";
      import { useMemo as otherMemo } from "other";
      useCallback;
      keep;
    `);
    removeHookImports(sample.program, {
      hookIdentifiers: new Map([["useMemo", "useMemo"], ["useEffect", "useEffect"], ["useCallback", "useCallback"]]),
      hookLocals: new Set(["useCallback"]),
    });
    const reactImport = sample.program.node.body.find((node) => node.type === "ImportDeclaration" && node.source.value === "react");
    expect(reactImport.specifiers.map((specifier) => specifier.local.name)).toEqual(["keep"]);
  });
});
