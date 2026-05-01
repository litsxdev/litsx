import assert from "assert";
import babelCore from "@babel/core";
import parser from "../packages/babel-parser-litsx/src/index.mjs";
import {
  assertNoReactEventAttributes,
  collectUseStateImports,
  collectReactUseStateImports,
  ensureHostParam,
  ensurePrepareEffectsCall,
  ensureRuntimeNamedImports,
  extractUseStateInfo,
  finalizeUseStateImports,
  getFunctionName,
  inferHostIdentifier,
  isCustomHookFunction,
  isLitElementSuperClass,
  resolveHostInfo,
  HOST_TYPE_CUSTOM,
  HOST_TYPE_RENDER,
  initializeUseStateCustomHookBridge,
  transformLocalUseStateCustomHook,
  injectCustomHookHostArguments,
  finalizeReactUseStateImports,
  isReactEventAttribute,
} from "../packages/shared/babel-plugin-shared-hooks/src/index.js";
import { describe, it } from "vitest";

const { transformFromAstSync, types: t } = babelCore;

function parseModule(source) {
  return parser.parse(source, {
    sourceType: "module",
    plugins: ["typescript"],
  });
}

function runUseStateCustomHookBridge(source) {
  const ast = parseModule(source);

  const result = transformFromAstSync(ast, source, {
    configFile: false,
    babelrc: false,
    plugins: [
      () => ({
        visitor: {
          Program(programPath) {
            const state = {};
            initializeUseStateCustomHookBridge(state);
            state.sourceUseStateLocals.add("useState");

            programPath.traverse({
              FunctionDeclaration(functionPath) {
                transformLocalUseStateCustomHook(functionPath, state, t);
              },
            });

            programPath.traverse({
              ClassDeclaration(classPath) {
                injectCustomHookHostArguments(classPath, state, t);
              },
            });

            finalizeReactUseStateImports(programPath, state, t);
          },
        },
      }),
    ],
  });

  return result.code;
}

describe("@litsx/babel-plugin-shared-hooks helpers", () => {
  it("extracts useState info from identifier declarators and keeps names unique", () => {
    const ast = parseModule("const state = useState(1);");
    const declaration = ast.program.body[0].declarations[0];
    const usedNames = new Set(["state"]);
    const info = extractUseStateInfo(declaration, usedNames, t);

    assert.deepStrictEqual(info, {
      valueBindingName: "state",
      setterBindingName: null,
      stateKeyName: "state1",
      initArg: declaration.init.arguments[0],
    });
    assert.ok(usedNames.has("state1"));
  });

  it("derives state keys from setter-only destructuring and rejects unsupported patterns", () => {
    const setterOnlyAst = parseModule("const [, setCount] = useState(0);");
    const setterOnlyDeclaration = setterOnlyAst.program.body[0].declarations[0];
    const info = extractUseStateInfo(setterOnlyDeclaration, new Set(), t);

    assert.equal(info.valueBindingName, null);
    assert.equal(info.setterBindingName, "setCount");
    assert.equal(info.stateKeyName, "count");

    const unsupportedAst = parseModule("const { count } = useState(0);");
    const unsupportedDeclaration = unsupportedAst.program.body[0].declarations[0];

    assert.equal(extractUseStateInfo(unsupportedDeclaration, new Set(), t), null);

    const nonCallAst = parseModule("const value = 1;");
    const nonCallDeclaration = nonCallAst.program.body[0].declarations[0];
    assert.equal(extractUseStateInfo(nonCallDeclaration, new Set(), t), null);

    const wrongHookAst = parseModule("const value = useMemo(0);");
    const wrongHookDeclaration = wrongHookAst.program.body[0].declarations[0];
    assert.equal(extractUseStateInfo(wrongHookDeclaration, new Set(), t), null);
  });

  it("generates fallback state keys when bindings are missing or setter names are non-standard", () => {
    const emptyPatternAst = parseModule("const [,] = useState(0);");
    const emptyPatternDeclaration = emptyPatternAst.program.body[0].declarations[0];
    const emptyPatternInfo = extractUseStateInfo(emptyPatternDeclaration, new Set(["state1"]), t);

    assert.equal(emptyPatternInfo.valueBindingName, null);
    assert.equal(emptyPatternInfo.setterBindingName, null);
    assert.equal(emptyPatternInfo.stateKeyName, "state2");

    const oddSetterAst = parseModule("const [, updateReady] = useState(0);");
    const oddSetterDeclaration = oddSetterAst.program.body[0].declarations[0];
    const oddSetterInfo = extractUseStateInfo(oddSetterDeclaration, new Set(["updateReadyState"]), t);

    assert.equal(oddSetterInfo.setterBindingName, "updateReady");
    assert.equal(oddSetterInfo.stateKeyName, "updateReadyState1");
  });

  it("detects React event attributes and throws on authored onX props", () => {
    const ast = parseModule("const view = <button onClick={save} @input={sync} />;");
    const openingElement = ast.program.body[0].declarations[0].init.openingElement;

    assert.equal(isReactEventAttribute(openingElement.attributes[0].name, t), true);
    assert.equal(isReactEventAttribute(openingElement.attributes[1].name, t), false);
    assert.equal(isReactEventAttribute(t.jsxNamespacedName(t.jsxIdentifier("svg"), t.jsxIdentifier("onClick")), t), false);

    assert.throws(() => {
      transformFromAstSync(ast, "const view = <button onClick={save} />;", {
        configFile: false,
        babelrc: false,
        plugins: [
          () => ({
            visitor: {
              Program(path) {
                assertNoReactEventAttributes(path, t, "React-style event props are not allowed.");
              },
            },
          }),
        ],
      });
    }, /React-style event props are not allowed/);
  });

  it("bridges local custom hooks that call useState and rewrites render call sites", () => {
    const source = `
      import { useState } from "react";

      function useCounter(initial) {
        const [count, setCount] = useState(initial);
        return [count, setCount];
      }

      class Counter {
        render() {
          return useCounter(1);
        }
      }
    `;

    const code = runUseStateCustomHookBridge(source);

    assert.match(code, /import \{ useState \} from "litsx";/);
    assert.match(code, /function useCounter\(_host, initial\)/);
    assert.match(code, /const \[count, setCount\] = useState\(_host, initial\);/);
    assert.match(code, /return useCounter\(this, 1\);/);
    assert.doesNotMatch(code, /from "react"/);
  });

  it("does not rewrite non-custom hooks, ignores non-render methods, and preserves explicit host args", () => {
    const source = `
      import { useState } from "react";

      function makeCounter(initial) {
        const [count, setCount] = useState(initial);
        return [count, setCount];
      }

      function useCounter(_host, initial) {
        const [count, setCount] = useState(_host, initial);
        return [count, setCount];
      }

      class Counter {
        connectedCallback() {
          return useCounter(1);
        }

        render() {
          makeCounter(2);
          return useCounter(this, 1);
        }
      }
    `;

    const code = runUseStateCustomHookBridge(source);

    assert.match(code, /function makeCounter\(initial\)/);
    assert.match(code, /const \[count, setCount\] = useState\(initial\);/);
    assert.match(code, /function useCounter\(_host, initial\)/);
    assert.match(code, /const \[count, setCount\] = useState\(_host, initial\);/);
    assert.match(code, /connectedCallback\(\) \{\s*return useCounter\(1\);/s);
    assert.match(code, /makeCounter\(2\);/);
    assert.match(code, /return useCounter\(this, 1\);/);
  });

  it("drops dead react useState imports while preserving a canonical litsx useState import for bridged hooks", () => {
    const source = `
      import { useState as runtimeUseState } from "litsx";
      import { useState } from "react";

      function useCounter(initial) {
        const [count, setCount] = useState(initial);
        return [count, setCount];
      }

      class Counter {
        render() {
          return useCounter(1);
        }
      }
    `;

    const ast = parseModule(source);
    const result = transformFromAstSync(ast, source, {
      configFile: false,
      babelrc: false,
      plugins: [
        () => ({
          visitor: {
            Program(programPath) {
              const state = {};
              initializeUseStateCustomHookBridge(state);

              programPath.traverse({
                ImportDeclaration(path) {
                  collectUseStateImports(path, state, {
                    importSources: ["react", "litsx"],
                  });
                },
              });

              programPath.traverse({
                FunctionDeclaration(functionPath) {
                  transformLocalUseStateCustomHook(functionPath, state, t);
                },
              });

              programPath.traverse({
                ClassDeclaration(classPath) {
                  injectCustomHookHostArguments(classPath, state, t);
                },
              });

              finalizeUseStateImports(programPath, state, t, {
                importSources: ["react", "litsx"],
                runtimeModule: "litsx",
              });
            },
          },
        }),
      ],
    });
    const code = result.code;

    assert.match(code, /import \{ useState \} from "litsx";/);
    assert.doesNotMatch(code, /from "react"/);
    assert.match(code, /function useCounter\(_host, initial\)/);
    assert.match(code, /const \[count, setCount\] = useState\(_host, initial\);/);
    assert.match(code, /return useCounter\(this, 1\);/);
  });

  it("derives function names and custom-hook status from declarations and variable initializers", () => {
    const namedFunctionAst = parseModule("function useCounter() {}");
    const variableAst = parseModule("const useLatest = () => {};");
    const anonymousAst = parseModule("export default function () {}");

    const namedDeclaration = namedFunctionAst.program.body[0];
    const variableInitializer = variableAst.program.body[0].declarations[0].init;
    const anonymousFunction = anonymousAst.program.body[0].declaration;

    const namedPath = {
      node: namedDeclaration,
      isFunctionDeclaration: () => true,
      isFunctionExpression: () => false,
      isArrowFunctionExpression: () => false,
    };
    const variablePath = {
      node: variableInitializer,
      parentPath: {
        isVariableDeclarator: () => true,
        node: variableAst.program.body[0].declarations[0],
      },
      isFunctionDeclaration: () => false,
      isFunctionExpression: () => false,
      isArrowFunctionExpression: () => true,
    };
    const anonymousPath = {
      node: anonymousFunction,
      isFunctionDeclaration: () => false,
      isFunctionExpression: () => false,
      isArrowFunctionExpression: () => false,
    };

    assert.equal(getFunctionName(namedPath, t), "useCounter");
    assert.equal(getFunctionName(variablePath, t), "useLatest");
    assert.equal(getFunctionName(anonymousPath, t), null);
    assert.equal(isCustomHookFunction(namedPath, t), true);
    assert.equal(isCustomHookFunction(variablePath, t), true);
  });

  it("resolves and injects host identifiers for custom hooks and render methods", () => {
    const customHookNode = parseModule("function useCounter(host) { return host; }").program.body[0];
    const underscoredHookNode = parseModule("function useThing(_host) { return _host; }").program.body[0];

    const customHookPath = {
      node: customHookNode,
      scope: {
        hasBinding: () => false,
        generateUidIdentifier: (name) => t.identifier(`_${name}`),
      },
      isClassMethod: () => false,
      isFunctionDeclaration: () => true,
      isFunctionExpression: () => false,
      isArrowFunctionExpression: () => false,
    };
    const underscoredHookPath = {
      node: underscoredHookNode,
      scope: customHookPath.scope,
      isClassMethod: () => false,
      isFunctionDeclaration: () => true,
      isFunctionExpression: () => false,
      isArrowFunctionExpression: () => false,
    };

    assert.equal(inferHostIdentifier(customHookPath, t), "host");
    assert.equal(inferHostIdentifier(underscoredHookPath, t), "_host");
    assert.equal(ensureHostParam(customHookPath, t).name, "host");

    const collidingPath = {
      node: {
        params: [],
      },
      scope: {
        hasBinding: (name) => name === "_host",
        generateUidIdentifier: (name) => t.identifier(`_${name}2`),
      },
      isClassMethod: () => false,
      isFunctionDeclaration: () => false,
      isFunctionExpression: () => false,
      isArrowFunctionExpression: () => true,
    };

    assert.equal(ensureHostParam(collidingPath, t).name, "_host2");

    const renderFunctionPath = {
      isClassMethod(match) {
        return match.kind === "method";
      },
      node: {
        key: t.identifier("render"),
      },
    };
    const renderInfo = resolveHostInfo({
      getFunctionParent() {
        return renderFunctionPath;
      },
    }, t);
    const customInfo = resolveHostInfo({
      getFunctionParent() {
        return underscoredHookPath;
      },
    }, t);

    assert.equal(renderInfo.type, HOST_TYPE_RENDER);
    assert.equal(renderInfo.expression.type, "ThisExpression");
    assert.equal(customInfo.type, HOST_TYPE_CUSTOM);
    assert.equal(customInfo.expression.name, "_host");
    assert.equal(resolveHostInfo({ getFunctionParent() { return null; } }, t), null);
  });

  it("detects LitElement super classes across direct and wrapped call expressions", () => {
    assert.equal(isLitElementSuperClass(t.identifier("LitElement"), t), true);
    assert.equal(
      isLitElementSuperClass(
        t.callExpression(t.identifier("mixin"), [t.identifier("LitElement")]),
        t,
      ),
      true,
    );
    assert.equal(isLitElementSuperClass(t.identifier("HTMLElement"), t), false);
    assert.equal(isLitElementSuperClass(null, t), false);
  });

  it("inserts prepareEffects once and skips non-block function bodies", () => {
    let renderMethodPath = null;
    transformFromAstSync(parseModule(`
      class Card {
        render() {
          return 1;
        }
      }
    `), "", {
      configFile: false,
      babelrc: false,
      plugins: [() => ({
        visitor: {
          ClassMethod(path) {
            if (t.isIdentifier(path.node.key, { name: "render" })) {
              renderMethodPath = path;
            }
          },
        },
      })],
    });

    const arrowPath = {
      get() {
        return {
          isBlockStatement: () => false,
        };
      },
    };

    assert.equal(ensurePrepareEffectsCall(renderMethodPath, t), true);
    assert.equal(ensurePrepareEffectsCall(renderMethodPath, t), false);
    assert.equal(ensurePrepareEffectsCall(arrowPath, t), false);
  });

  it("adds runtime named imports before, after, or into existing runtime imports", () => {
    const noRuntimeAst = parseModule(`import { LitElement } from "lit"; const view = 1;`);
    const namespaceAst = parseModule(`
      import * as runtime from "litsx";
      import { LitElement } from "lit";
    `);
    const existingAst = parseModule(`import { useId } from "litsx";`);

    const noRuntimeResult = transformFromAstSync(noRuntimeAst, "", {
      configFile: false,
      babelrc: false,
      plugins: [() => ({
        visitor: {
          Program(programPath) {
            ensureRuntimeNamedImports(programPath, "litsx", ["prepareEffects", "useState"], t);
          },
        },
      })],
    });
    const namespaceResult = transformFromAstSync(namespaceAst, "", {
      configFile: false,
      babelrc: false,
      plugins: [() => ({
        visitor: {
          Program(programPath) {
            ensureRuntimeNamedImports(programPath, "litsx", ["prepareEffects"], t);
          },
        },
      })],
    });
    const existingResult = transformFromAstSync(existingAst, "", {
      configFile: false,
      babelrc: false,
      plugins: [() => ({
        visitor: {
          Program(programPath) {
            ensureRuntimeNamedImports(programPath, "litsx", ["useId", "prepareEffects"], t);
          },
        },
      })],
    });

    assert.match(noRuntimeResult.code, /import \{ prepareEffects, useState \} from "litsx";/);
    assert.match(namespaceResult.code, /import \* as runtime from "litsx";/);
    assert.match(namespaceResult.code, /import \{ prepareEffects \} from "litsx";/);
    assert.match(existingResult.code, /import \{ useId, prepareEffects \} from "litsx";|import \{ prepareEffects, useId \} from "litsx";/);
  });

  it("skips empty runtime import requests and can insert into files with no imports", () => {
    const noImportsAst = parseModule(`const value = 1;`);
    const noImportsResult = transformFromAstSync(noImportsAst, "", {
      configFile: false,
      babelrc: false,
      plugins: [() => ({
        visitor: {
          Program(programPath) {
            ensureRuntimeNamedImports(programPath, "litsx", [], t);
            ensureRuntimeNamedImports(programPath, "litsx", ["prepareEffects", null, "prepareEffects"], t);
          },
        },
      })],
    });

    assert.match(noImportsResult.code, /^import \{ prepareEffects \} from "litsx";\s+const value = 1;/s);
  });

  it("collects and finalizes useState imports across source and runtime modules", () => {
    const ast = parseModule(`
      import { useState as useReactState } from "react";
      const stateFactory = useReactState;
      stateFactory;
      const ready = true;
      if (ready) {
        useReactState;
      }
    `);
    const state = {
      sourceUseStateLocals: new Set(),
      runtimeUseStateLocals: new Set(["useReactState", "useRuntimeState"]),
      localCustomHooks: new Set(),
    };

    const result = transformFromAstSync(ast, "", {
      configFile: false,
      babelrc: false,
      plugins: [() => ({
        visitor: {
          Program(programPath) {
            programPath.get("body").forEach((path) => {
              if (path.isImportDeclaration()) {
                collectUseStateImports(path, state, { importSources: ["react", "litsx"] });
                collectReactUseStateImports(path, state);
              }
            });
            finalizeUseStateImports(programPath, state, t, {
              importSources: ["react", "litsx"],
              runtimeModule: "litsx",
            });
          },
        },
      })],
    });

    assert.ok(state.sourceUseStateLocals.has("useReactState"));
    assert.match(result.code, /import \{ useState as useReactState \} from "litsx";/);
    assert.doesNotMatch(result.code, /from "react";/);
  });

  it("removes emptied source imports and inserts runtime useState before other imports", () => {
    const ast = parseModule(`
      import { useState as useReactState } from "react";
      import { html } from "lit";
      const value = useReactState(0);
      html;
      value;
    `);
    const state = {
      sourceUseStateLocals: new Set(),
      runtimeUseStateLocals: new Set(["useReactState"]),
      localCustomHooks: new Set(),
    };

    const result = transformFromAstSync(ast, "", {
      configFile: false,
      babelrc: false,
      plugins: [() => ({
        visitor: {
          Program(programPath) {
            programPath.get("body").forEach((path) => {
              if (path.isImportDeclaration()) {
                collectReactUseStateImports(path, state);
              }
            });
            finalizeReactUseStateImports(programPath, state, t);
          },
        },
      })],
    });

    assert.match(
      result.code,
      /^import \{ useState as useReactState \} from "litsx";\s+import \{ html \} from "lit";/s,
    );
    assert.doesNotMatch(result.code, /from "react";/);
  });
});
