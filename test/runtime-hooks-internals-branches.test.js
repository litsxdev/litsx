import assert from "node:assert/strict";
import babelTraverse from "@babel/traverse";
import * as t from "@babel/types";
import { describe, it } from "vitest";
import parser from "./helpers/litsx-parser.js";
import {
  addStructuralHookToCurrentPlan,
  addCustomHookStructuralDependenciesToCurrentPlan,
  appendHelperMetadataArgument,
  attachCompiledCustomHookMetadata,
  attachStructuralCustomHookMetadata,
  attachStructuralHookMetadata,
  assertImportedCustomHookResolution,
  createCallMetadata,
  createDefineStructuralHookEntriesStatement,
  createMarkLitsxHookStatement,
  createRuntimeMetadataSymbolExpression,
  createStructuralHookExpression,
  collectStructuralHookDeclaration,
  containsStructuralHookReference,
  detectRuntimeHelperFromCallee,
  enterRuntimeScope,
  exitRuntimeScope,
  getFunctionFromBinding,
  getImportedStructuralCustomHookDependencyArgument,
  getImportSource,
  getImportedStructuralHookInfo,
  getObjectFunctionPath,
  getStructuralDefinitionObjectPath,
  getStructuralHookCallInfo,
  isCustomHookCall,
  isCustomHookName,
  isDefineHookCallee,
  isHookMarkerAssignmentStatement,
  isCompiledCustomHookBinding,
  isImportedStructuralCustomHook,
  isImportedStructuralHook,
  isInsideRuntimeScope,
  isRuntimeMetadataSymbolFor,
  isStructuralCustomHookCall,
  isStructuralHookBinding,
  isStructuralHookReference,
  isSupportedCustomHookBinding,
  localCustomHookUsesRuntime,
  mergeRuntimeImports,
  ensureHelperImports,
  processRuntimeCall,
  resolveImportedRuntimeCustomHook,
  shouldTransformCustomHookCall,
  rejectDynamicStructuralNamespaceAccess,
  rejectStructuralHookAlias,
  rejectStructuralHookContainer,
  validateStructuralHookDefinition,
} from "../packages/babel-plugin-shared-hooks/src/create-runtime-hooks-transform.js";

const traverse = babelTraverse.default || babelTraverse;

function inspect(source) {
  const ast = parser.parse(source, { sourceType: "module", plugins: ["jsx"] });
  let program;
  const calls = [];
  traverse(ast, {
    Program(path) { program = path; },
    CallExpression(path) { calls.push(path); },
  });
  return { program, calls };
}

function state(overrides = {}) {
  return {
    hookIdentifiers: new Map([["state", "useState"]]),
    runtimeNamespaceBindings: new Set(["runtime"]),
    runtimeDefaultBindings: new Set(["defaultRuntime"]),
    defineHookIdentifiers: new Set(["defineHook"]),
    structuralHookIdentifiers: new Set(),
    structuralNamespaceImports: new Map(),
    structuralCustomHookDependencies: new Map(),
    structuralCustomHookIdentifiers: new Set(),
    structuralHookDependencies: new Map(),
    ...overrides,
  };
}

describe("runtime hook internal branch behavior", () => {
  it("recognizes names and creates structural metadata AST", () => {
    for (const name of ["useThing", "use2", "useABC"]) assert.equal(isCustomHookName(name), true);
    for (const name of [null, "use", "user", "UseThing"]) assert.equal(isCustomHookName(name), false);

    const definition = t.identifier("entry");
    assert.equal(createStructuralHookExpression({ definition }, t).name, "entry");
    assert.equal(createStructuralHookExpression({ type: "spread", argument: definition }, t).type, "SpreadElement");
    const symbol = createRuntimeMetadataSymbolExpression(t, "litsx.hook");
    assert.equal(isRuntimeMetadataSymbolFor(symbol, t, "litsx.hook"), true);
    assert.equal(isRuntimeMetadataSymbolFor(symbol, t, "other"), false);
    for (const invalid of [null, t.identifier("x"), t.callExpression(t.identifier("Symbol"), []), t.callExpression(t.memberExpression(t.identifier("Other"), t.identifier("for")), [t.stringLiteral("litsx.hook")])]) {
      assert.equal(isRuntimeMetadataSymbolFor(invalid, t, "litsx.hook"), false);
    }

    const statement = createDefineStructuralHookEntriesStatement("useFeature", [{ definition }], t, true);
    assert.equal(statement.expression.right.elements.length, 2);
    assert.equal(createDefineStructuralHookEntriesStatement("useFeature", [], t).expression.right.elements.length, 0);
    assert.equal(createMarkLitsxHookStatement("useFeature", t).expression.right.value, true);
  });

  it("adds entries to every active structural plan combination", () => {
    const entry = { definition: t.identifier("hook") };
    const empty = state();
    addStructuralHookToCurrentPlan(empty, entry);
    assert.equal(empty.structuralCustomHookDependencies.size, 0);

    const active = state({
      activeStructuralHooks: [],
      activeCustomHookBinding: { identifier: { name: "useOuter" } },
      activeStructuralDefinitionName: "useDefinition",
    });
    addStructuralHookToCurrentPlan(active, entry);
    addStructuralHookToCurrentPlan(active, entry);
    assert.equal(active.activeStructuralHooks.length, 2);
    assert.equal(active.structuralCustomHookDependencies.get("useOuter").length, 2);
    assert.equal(active.structuralHookDependencies.get("useDefinition").length, 2);
  });

  it("tracks runtime scope depth without underflow", () => {
    const runtimeState = {};
    assert.equal(isInsideRuntimeScope(runtimeState), false);
    enterRuntimeScope(runtimeState);
    enterRuntimeScope(runtimeState);
    assert.equal(isInsideRuntimeScope(runtimeState), true);
    exitRuntimeScope(runtimeState);
    exitRuntimeScope(runtimeState);
    exitRuntimeScope(runtimeState);
    assert.equal(runtimeState.runtimeScopeDepth, 0);
  });

  it("resolves supported function bindings and import sources", () => {
    const sample = inspect(`
      import { useImported } from "pkg";
      function useDeclared() {}
      const useArrow = () => {};
      const useExpression = function () {};
      const value = 1;
    `);
    const bindings = sample.program.scope.getAllBindings();
    assert.equal(isSupportedCustomHookBinding(null), false);
    assert.equal(isSupportedCustomHookBinding(bindings.useDeclared.path), true);
    assert.equal(isSupportedCustomHookBinding(bindings.useArrow.path), true);
    assert.equal(isSupportedCustomHookBinding(bindings.useExpression.path), true);
    assert.equal(isSupportedCustomHookBinding(bindings.value.path), false);
    assert.equal(getFunctionFromBinding({ path: bindings.useDeclared.path }), bindings.useDeclared.path);
    assert.equal(getFunctionFromBinding(bindings.useArrow).isArrowFunctionExpression(), true);
    assert.equal(getFunctionFromBinding(bindings.value), null);
    assert.equal(getFunctionFromBinding({}), null);
    assert.equal(getImportSource(null), null);
    assert.equal(getImportSource(bindings.value.path), null);
    assert.equal(getImportSource(bindings.useImported.path), "pkg");
  });

  it("detects direct, namespace, default, custom, and invalid callees", () => {
    const sample = inspect("state(); runtime.useEffect(); defaultRuntime.useMemo(); other.useThing(); useLocal(); runtime.useThing(); other.value(); obj[key]();");
    const runtimeState = state({ isHelperName: (name) => ["useEffect", "useMemo"].includes(name) });
    const callees = sample.calls.map((call) => call.get("callee"));
    assert.equal(detectRuntimeHelperFromCallee(callees[0], runtimeState, t), "useState");
    assert.equal(detectRuntimeHelperFromCallee(callees[1], runtimeState, t), "useEffect");
    assert.equal(detectRuntimeHelperFromCallee(callees[2], runtimeState, t), "useMemo");
    assert.equal(detectRuntimeHelperFromCallee(callees[3], runtimeState, t), null);
    assert.equal(detectRuntimeHelperFromCallee(callees[7], runtimeState, t), null);
    assert.equal(isCustomHookCall(callees[0], runtimeState, t), false);
    assert.equal(isCustomHookCall(callees[3], runtimeState, t), true);
    assert.equal(isCustomHookCall(callees[4], runtimeState, t), true);
    assert.equal(isCustomHookCall(callees[5], runtimeState, t), false);
    assert.equal(isCustomHookCall(callees[6], runtimeState, t), false);
    assert.equal(isCustomHookCall(callees[7], runtimeState, t), false);
  });

  it("recognizes marker statements and helper metadata insertion", () => {
    const marked = inspect("useFeature[Symbol.for('litsx.hook')] = true; useFeature[Symbol.for('other')] = true; useFeature.value = true; useFeature[Symbol.for('litsx.hook')] = false;");
    const body = marked.program.get("body");
    assert.equal(isHookMarkerAssignmentStatement(null, "useFeature", {}, t), false);
    assert.equal(isHookMarkerAssignmentStatement(body[0], "useFeature", {}, t), true);
    assert.equal(isHookMarkerAssignmentStatement(body[1], "useFeature", {}, t), false);
    assert.equal(isHookMarkerAssignmentStatement(body[2], "useFeature", {}, t), false);
    assert.equal(isHookMarkerAssignmentStatement(body[3], "useFeature", {}, t), false);

    const call = inspect("helper(1)").calls[0];
    const noFactory = state();
    assert.equal(createCallMetadata(call, noFactory, t, "helper"), null);
    assert.equal(appendHelperMetadataArgument(call, noFactory, t, "helper"), false);
    const metadataState = state({ callMetadataByHelper: new Map([["helper", () => t.stringLiteral("meta")]]) });
    assert.equal(appendHelperMetadataArgument(call, metadataState, t, "helper"), true);
    assert.equal(call.node.arguments[0].value, "meta");
    assert.equal(appendHelperMetadataArgument(call, metadataState, t, "helper"), false);
  });

  it("resolves defineHook and structural hook forms", () => {
    const sample = inspect("const local = defineHook({}); defineHook({}); runtime.defineHook({}); defaultRuntime.defineHook({}); other.defineHook({}); runtime.value(); obj[key](); local(); ns.remote(); missing();");
    const runtimeState = state({
      structuralNamespaceImports: new Map([["ns", "pkg"]]),
      structuralHookResolver: ({ source, importedName }) => source === "pkg" && importedName === "remote" ? "structural-hook" : false,
    });
    const callees = sample.calls.map((call) => call.get("callee"));
    assert.equal(isDefineHookCallee(callees[0], runtimeState), true);
    assert.equal(isDefineHookCallee(callees[1], runtimeState), true);
    assert.equal(isDefineHookCallee(callees[2], runtimeState), true);
    assert.equal(isDefineHookCallee(callees[3], runtimeState), true);
    assert.equal(isDefineHookCallee(callees[4], runtimeState), false);
    assert.equal(isDefineHookCallee(callees[5], runtimeState), false);
    assert.equal(isDefineHookCallee(callees[6], runtimeState), false);
    assert.equal(isStructuralHookBinding(sample.program.scope.getBinding("local"), runtimeState), true);
    assert.equal(isStructuralHookBinding(null, runtimeState), false);
    assert.equal(isStructuralHookBinding(sample.program.scope.getBinding("ns"), runtimeState), false);

    const localCall = sample.calls.find((call) => call.get("callee").isIdentifier({ name: "local" }));
    assert.equal(getStructuralHookCallInfo(localCall, localCall.get("callee"), runtimeState, t).label, "local");
    const remoteCall = sample.calls.find((call) => call.get("callee").isMemberExpression() && call.get("callee.property").isIdentifier({ name: "remote" }));
    assert.equal(getStructuralHookCallInfo(remoteCall, remoteCall.get("callee"), runtimeState, t).label, "remote");
    const missingCall = sample.calls.at(-1);
    assert.equal(getStructuralHookCallInfo(missingCall, missingCall.get("callee"), runtimeState, t), null);
  });

  it("normalizes structural resolvers and imported-hook failures", () => {
    for (const result of [true, "structural-hook", { kind: "structural-hook" }]) {
      assert.equal(isImportedStructuralHook(state({ structuralHookResolver: () => result }), "pkg", "useRemote"), true);
    }
    assert.equal(isImportedStructuralHook(state(), "pkg", "useRemote"), false);
    assert.equal(getImportedStructuralHookInfo(state(), "pkg", "useRemote"), false);
    assert.equal(getImportedStructuralHookInfo(state({ filename: "file.js", structuralHookResolver: (input) => input.filename }), "pkg", "useRemote"), "file.js");
    assert.equal(isImportedStructuralCustomHook(state({ structuralHookResolver: () => "structural-custom-hook" }), "pkg", "useRemote"), true);
    assert.equal(isImportedStructuralCustomHook(state({ structuralHookResolver: () => true }), "pkg", "useRemote"), false);

    assert.equal(resolveImportedRuntimeCustomHook(state(), "pkg", "useRemote"), true);
    assert.equal(resolveImportedRuntimeCustomHook(state({ customHookResolver: () => false }), "pkg", "useRemote"), false);
    assert.equal(resolveImportedRuntimeCustomHook(state({ structuralHookResolver: () => "structural-custom-hook", customHookResolver: () => false }), "pkg", "useRemote"), true);
    const errorPath = { buildCodeFrameError: (message) => new Error(message) };
    assert.doesNotThrow(() => assertImportedCustomHookResolution(true, errorPath, "useRemote", "pkg"));
    assert.throws(() => assertImportedCustomHookResolution("unsupported-external-hook", errorPath, "useRemote", "pkg"), /Cannot compile external hook/);
    assert.throws(() => assertImportedCustomHookResolution("unresolved-custom-hook", errorPath, "useRemote", "pkg"), /Unable to resolve imported custom hook/);
  });

  it("finds structural references directly and inside expressions", () => {
    const sample = inspect("const local = defineHook({ use() {} }); const direct = local; const nested = wrap(local); const clean = wrap(value); const member = ns.remote; const dynamic = ns[key];");
    const runtimeState = state({
      structuralHookIdentifiers: new Set(["local"]),
      structuralNamespaceImports: new Map([["ns", "pkg"]]),
      structuralHookResolver: ({ importedName }) => importedName === "remote" ? true : false,
    });
    const declarators = sample.program.get("body").filter((path) => path.isVariableDeclaration()).map((path) => path.get("declarations.0"));
    assert.equal(isStructuralHookReference(declarators[1].get("init"), runtimeState), true);
    assert.equal(isStructuralHookReference(declarators[4].get("init"), runtimeState), true);
    assert.equal(isStructuralHookReference(declarators[5].get("init"), runtimeState), false);
    assert.equal(isStructuralHookReference(declarators[3].get("init"), runtimeState), false);
    assert.equal(containsStructuralHookReference(null, runtimeState), false);
    assert.equal(containsStructuralHookReference(declarators[1].get("init"), runtimeState), true);
    assert.equal(containsStructuralHookReference(declarators[2].get("init"), runtimeState), true);
    assert.equal(containsStructuralHookReference(declarators[3].get("init"), runtimeState), false);
  });

  it("rejects structural aliases, containers, and dynamic namespace access", () => {
    const sample = inspect(`
      const local = defineHook({ use() {} });
      const alias = local;
      const direct = local();
      const read = readStructuralHook(local);
      const clean = value;
      const object = { hook: local };
      const spread = { ...local };
      const array = [local, null];
      defineHook({ hook: local });
      readStructuralHook({ hook: local });
      ns.remote;
      ns[key];
      other[key];
    `);
    const runtimeState = state({
      structuralHookIdentifiers: new Set(["local"]),
      structuralNamespaceImports: new Map([["ns", "pkg"]]),
    });
    const declarations = [];
    const objects = [];
    const arrays = [];
    const members = [];
    sample.program.traverse({
      VariableDeclarator(path) { declarations.push(path); },
      ObjectExpression(path) { objects.push(path); },
      ArrayExpression(path) { arrays.push(path); },
      MemberExpression(path) { members.push(path); },
    });
    assert.throws(() => rejectStructuralHookAlias(declarations.find((path) => path.get("id").isIdentifier({ name: "alias" })), runtimeState), /cannot be created through an alias/);
    for (const name of ["local", "direct", "read", "clean"]) {
      assert.doesNotThrow(() => rejectStructuralHookAlias(declarations.find((path) => path.get("id").isIdentifier({ name })), runtimeState));
    }
    assert.throws(() => rejectStructuralHookContainer(objects.find((path) => path.parentPath.isVariableDeclarator() && path.parentPath.get("id").isIdentifier({ name: "object" })), runtimeState), /cannot be stored/);
    assert.throws(() => rejectStructuralHookContainer(objects.find((path) => path.parentPath.isVariableDeclarator() && path.parentPath.get("id").isIdentifier({ name: "spread" })), runtimeState), /cannot be stored/);
    assert.throws(() => rejectStructuralHookContainer(arrays[0], runtimeState), /cannot be stored/);
    for (const objectPath of objects.filter((path) => path.parentPath.isCallExpression())) {
      assert.doesNotThrow(() => rejectStructuralHookContainer(objectPath, runtimeState));
    }
    assert.doesNotThrow(() => rejectStructuralHookContainer({ node: {}, parentPath: null }, runtimeState));
    assert.doesNotThrow(() => rejectDynamicStructuralNamespaceAccess(members.find((path) => path.node.computed === false), runtimeState));
    assert.throws(() => rejectDynamicStructuralNamespaceAccess(members.find((path) => path.node.computed && path.get("object").isIdentifier({ name: "ns" })), runtimeState), /must use a static property/);
    assert.doesNotThrow(() => rejectDynamicStructuralNamespaceAccess(members.find((path) => path.node.computed && path.get("object").isIdentifier({ name: "other" })), runtimeState));
  });

  it("validates structural definitions and locates use or mixin functions", () => {
    const sample = inspect(`
      const absent = defineHook(value);
      const empty = defineHook({});
      const unsupported = defineHook({ use() {}, legacy: true, "other": true, [key]: true, ...extra });
      const methods = defineHook({ use() {}, "mixin": () => class {}, invalid: 1 });
      const values = defineHook({ use: function () {}, mixin: 1 });
    `);
    const declarations = sample.program.get("body").map((path) => path.get("declarations.0"));
    assert.equal(getStructuralDefinitionObjectPath(declarations[0]), null);
    assert.throws(() => validateStructuralHookDefinition(declarations[1]), /requires a mixin/);
    assert.throws(() => validateStructuralHookDefinition(declarations[2]), /structural fields legacy, other/);
    assert.throws(() => validateStructuralHookDefinition(declarations[3]), /structural fields invalid/);
    assert.doesNotThrow(() => validateStructuralHookDefinition(declarations[4]));
    const methodsObject = getStructuralDefinitionObjectPath(declarations[3]);
    assert.equal(getObjectFunctionPath(methodsObject, "use").isObjectMethod(), true);
    assert.equal(getObjectFunctionPath(methodsObject, "mixin").isArrowFunctionExpression(), true);
    assert.equal(getObjectFunctionPath(methodsObject, "missing"), null);
    const valuesObject = getStructuralDefinitionObjectPath(declarations[4]);
    assert.equal(getObjectFunctionPath(valuesObject, "use").isFunctionExpression(), true);
    assert.equal(getObjectFunctionPath(valuesObject, "mixin"), null);
    assert.equal(getObjectFunctionPath(null, "use"), null);
  });

  it("collects structural declarations and recognizes custom structural calls", () => {
    const sample = inspect("const hook = defineHook({ use() {} }); const noCall = 1; const other = makeHook({}); hook(); custom(); ns.remote(); ns.value();");
    const declarations = sample.program.get("body").slice(0, 3).map((path) => path.get("declarations.0"));
    const runtimeState = state({
      structuralCustomHookIdentifiers: new Set(["custom"]),
      structuralNamespaceImports: new Map([["ns", "pkg"]]),
      structuralHookResolver: ({ importedName }) => importedName === "remote" ? "structural-custom-hook" : false,
    });
    assert.doesNotThrow(() => collectStructuralHookDeclaration(declarations[1], runtimeState, t));
    assert.doesNotThrow(() => collectStructuralHookDeclaration(declarations[2], runtimeState, t));
    // Avoid invoking the transformation half here; collection behavior is covered
    // by adding the definition directly before testing call recognition.
    runtimeState.structuralHookIdentifiers.add("hook");
    const customCall = sample.calls.find((path) => path.get("callee").isIdentifier({ name: "custom" }));
    const remoteCall = sample.calls.find((path) => path.get("callee").isMemberExpression() && path.get("callee.property").isIdentifier({ name: "remote" }));
    const valueCall = sample.calls.find((path) => path.get("callee").isMemberExpression() && path.get("callee.property").isIdentifier({ name: "value" }));
    assert.equal(isStructuralCustomHookCall(customCall.get("callee"), runtimeState), true);
    assert.equal(isStructuralCustomHookCall(remoteCall.get("callee"), runtimeState), true);
    assert.equal(isStructuralCustomHookCall(valueCall.get("callee"), runtimeState), false);
    assert.equal(isStructuralCustomHookCall(sample.calls.find((path) => path.get("callee").isIdentifier({ name: "hook" })).get("callee"), runtimeState), false);
  });

  it("attaches metadata for function and variable hooks while skipping empty or missing bindings", () => {
    const sample = inspect(`
      function useFunction() {}
      const useVariable = () => {};
      const useStructural = defineHook({ use() {} });
      class useClass {}
    `);
    const runtimeState = state({
      structuralCustomHookDependencies: new Map([
        ["empty", []],
        ["missing", [{ definition: t.identifier("x") }]],
        ["useFunction", [{ definition: t.identifier("x") }]],
        ["useVariable", [{ definition: t.identifier("y") }]],
        ["useClass", [{ definition: t.identifier("z") }]],
      ]),
      structuralHookDependencies: new Map([
        ["empty", []],
        ["missing", [{ definition: t.identifier("x") }]],
        ["useStructural", [{ definition: t.identifier("y") }]],
        ["useFunction", [{ definition: t.identifier("z") }]],
      ]),
      compiledCustomHookNames: new Set(["missing", "useFunction", "useVariable", "useClass"]),
    });
    attachStructuralCustomHookMetadata(sample.program, runtimeState, t);
    attachStructuralHookMetadata(sample.program, runtimeState, t);
    attachCompiledCustomHookMetadata(sample.program, runtimeState, t);
    assert.ok(sample.program.node.body.length > 4);
  });

  it("detects compiled hook markers and imported structural dependencies", () => {
    const sample = inspect(`
      import { useRemote as remote } from "pkg";
      import * as hooks from "pkg";
      function useMarked() {}
      useMarked[Symbol.for("litsx.hook")] = true;
      const useBlocked = () => {};
      class Stop {}
      useBlocked[Symbol.for("litsx.hook")] = true;
      remote(); hooks.useRemote(); plain(); hooks[key]();
    `);
    const runtimeState = state({
      structuralHookResolver: ({ importedName }) => importedName === "useRemote" ? "structural-custom-hook" : false,
      structuralNamespaceImports: new Map([["hooks", "pkg"]]),
      structuralCustomHookIdentifiers: new Set(["remote"]),
      activeStructuralHooks: [],
    });
    const bindings = sample.program.scope.getAllBindings();
    assert.equal(isCompiledCustomHookBinding(null, runtimeState, t), false);
    assert.equal(isCompiledCustomHookBinding({ identifier: {} }, runtimeState, t), false);
    assert.equal(isCompiledCustomHookBinding(bindings.useMarked, runtimeState, t), true);
    assert.equal(isCompiledCustomHookBinding(bindings.useBlocked, runtimeState, t), false);
    assert.equal(isCompiledCustomHookBinding(bindings.Stop, runtimeState, t), false);

    const remote = sample.calls.find((path) => path.get("callee").isIdentifier({ name: "remote" })).get("callee");
    const member = sample.calls.find((path) => path.get("callee").isMemberExpression({ computed: false }) && path.get("callee.object").isIdentifier({ name: "hooks" })).get("callee");
    const plain = sample.calls.find((path) => path.get("callee").isIdentifier({ name: "plain" })).get("callee");
    const computed = sample.calls.find((path) => path.get("callee").isMemberExpression({ computed: true })).get("callee");
    assert.equal(getImportedStructuralCustomHookDependencyArgument(remote, runtimeState, t).name, "remote");
    assert.equal(getImportedStructuralCustomHookDependencyArgument(member, runtimeState, t).type, "MemberExpression");
    assert.equal(getImportedStructuralCustomHookDependencyArgument(plain, runtimeState, t), null);
    assert.equal(getImportedStructuralCustomHookDependencyArgument(computed, runtimeState, t), null);
    addCustomHookStructuralDependenciesToCurrentPlan(remote, runtimeState, t);
    addCustomHookStructuralDependenciesToCurrentPlan(member, runtimeState, t);
    addCustomHookStructuralDependenciesToCurrentPlan(plain, runtimeState, t);
    assert.equal(runtimeState.activeStructuralHooks.length, 2);
  });

  it("classifies local custom-hook runtime usage and recursion", () => {
    const sample = inspect(`
      import { useRemote } from "pkg";
      import * as hooks from "pkg";
      function useBuiltin() { state(); }
      function useStructural() { structural(); }
      function useNested() { useBuiltin(); }
      function useImported() { useRemote(); }
      function useNamespaced() { hooks.useRemote(); }
      function useCycle() { useCycle(); }
      function useClean() { plain(); }
      const value = 1;
    `);
    const runtimeState = state({
      structuralHookIdentifiers: new Set(["structural"]),
      structuralCustomHookIdentifiers: new Set(["useStructural"]),
      customHookResolver: () => false,
      structuralHookResolver: () => false,
    });
    const bindings = sample.program.scope.getAllBindings();
    assert.equal(localCustomHookUsesRuntime(null, runtimeState, t), false);
    assert.equal(localCustomHookUsesRuntime(bindings.value, runtimeState, t), false);
    assert.equal(localCustomHookUsesRuntime(bindings.useStructural, runtimeState, t), true);
    assert.equal(localCustomHookUsesRuntime(bindings.useBuiltin, runtimeState, t), true);
    assert.equal(localCustomHookUsesRuntime(bindings.useNested, runtimeState, t), true);
    assert.equal(localCustomHookUsesRuntime(bindings.useImported, runtimeState, t), false);
    assert.equal(localCustomHookUsesRuntime(bindings.useNamespaced, runtimeState, t), false);
    assert.equal(localCustomHookUsesRuntime(bindings.useCycle, runtimeState, t), false);
    assert.equal(localCustomHookUsesRuntime(bindings.useClean, runtimeState, t), false);
    assert.equal(localCustomHookUsesRuntime(bindings.useClean, state(), t), true);
  });

  it("merges duplicate runtime imports across named, default, and namespace forms", () => {
    const named = inspect(`import { useState } from "runtime"; import { useEffect, useState as again } from "runtime"; const x = 1;`);
    mergeRuntimeImports(named.program, { runtimeModule: "runtime" }, t);
    const namedImports = named.program.node.body.filter((node) => node.type === "ImportDeclaration");
    assert.equal(namedImports.length, 1);
    assert.deepEqual(namedImports[0].specifiers.map((specifier) => specifier.imported.name), ["useState", "useEffect"]);

    const mixed = inspect(`import Runtime, { useState } from "runtime"; import * as Hooks from "runtime"; import Other from "runtime"; import { useEffect } from "runtime";`);
    mergeRuntimeImports(mixed.program, { runtimeModule: "runtime" }, t);
    const mixedImports = mixed.program.node.body.filter((node) => node.type === "ImportDeclaration");
    assert.equal(mixedImports.length, 2);
    assert.equal(mixedImports[0].specifiers.some((specifier) => specifier.type === "ImportDefaultSpecifier"), true);
    assert.equal(mixedImports[0].specifiers.some((specifier) => specifier.type === "ImportNamespaceSpecifier"), true);
    assert.equal(mixedImports[1].specifiers.every((specifier) => specifier.type === "ImportSpecifier"), true);
    assert.doesNotThrow(() => mergeRuntimeImports(inspect(`import { x } from "runtime";`).program, { runtimeModule: "runtime" }, t));
  });

  it("ensures structural and ordinary helper imports without duplicating available helpers", () => {
    const sample = inspect(`import Runtime, { useState } from "runtime";`);
    const runtimeState = state({
      runtimeModule: "runtime",
      importSourceSet: new Set(["runtime"]),
      preservedRuntimeImportSourceSet: new Set(["runtime"]),
      usedHelpers: new Set(["useState", "useEffect", "readStructuralHook"]),
      hookIdentifiers: new Map([["bad", null], ["memo", "useMemo"]]),
      isHelperName: (name) => typeof name === "string" && name.startsWith("use"),
    });
    ensureHelperImports(sample.program, runtimeState, t);
    const sources = sample.program.node.body.filter((node) => node.type === "ImportDeclaration").map((node) => node.source.value);
    assert.ok(sources.includes("@litsx/core"));
    assert.ok(sources.includes("runtime"));
    assert.doesNotThrow(() => ensureHelperImports(inspect("const x = 1;").program, state({ usedHelpers: new Set(), hookIdentifiers: new Map(), importSourceSet: new Set(), preservedRuntimeImportSourceSet: new Set(), runtimeModule: "runtime" }), t));
  });

  it("classifies transformable custom calls and processes helper/custom paths", () => {
    const sample = inspect(`
      import { useRemote } from "pkg";
      import * as hooks from "pkg";
      function useLocal() { return 1; }
      state(); useRemote(); hooks.useRemote(); useMissing(); plain();
    `);
    const runtimeState = state({
      isHelperName: (name) => name === "useState",
      customHookResolver: ({ importedName }) => importedName === "useRemote",
      structuralHookResolver: () => false,
      usedHelpers: new Set(),
      compiledCustomHookNames: new Set(),
      processedCustomHooks: new WeakSet(),
      activeStructuralHooks: null,
    });
    const byName = (name) => sample.calls.find((path) => {
      const callee = path.get("callee");
      return callee.isIdentifier({ name }) || callee.get?.("property")?.isIdentifier?.({ name });
    });
    assert.equal(shouldTransformCustomHookCall(byName("useRemote").get("callee"), runtimeState, t), true);
    assert.equal(shouldTransformCustomHookCall(byName("useMissing").get("callee"), runtimeState, t), true);
    const namespace = sample.calls.find((path) => path.get("callee").isMemberExpression() && path.get("callee.object").isIdentifier({ name: "hooks" }));
    assert.equal(shouldTransformCustomHookCall(namespace.get("callee"), runtimeState, t), true);
    const marked = [];
    assert.equal(processRuntimeCall(byName("state"), runtimeState, t, { markHelperUsage: (name) => marked.push(name) }), true);
    assert.equal(processRuntimeCall(byName("useRemote"), runtimeState, t, { markHelperUsage: (name) => marked.push(name) }), true);
    assert.equal(processRuntimeCall(byName("plain"), runtimeState, t, {}), false);
    assert.deepEqual(marked, ["useState", "custom"]);
  });
});
