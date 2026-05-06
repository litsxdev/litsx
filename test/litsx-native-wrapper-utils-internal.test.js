import assert from "assert";
import * as t from "@babel/types";
import babelTraverse from "@babel/traverse";
import parser from "../packages/babel-parser-litsx/src/index.js";
import {
  handlePotentialComponentExport,
  maybeTransformWrappedVariableDeclarator,
  setWrapperUtilsBabelTypes,
} from "../packages/babel-preset-litsx/src/internal/transform-litsx-wrapper-utils.js";

const traverse = babelTraverse.default || babelTraverse;

function parseModule(source) {
  const ast = parser.parse(source, { sourceType: "module", plugins: ["jsx"] });
  let programPath;
  const variableDeclarators = [];
  const exports = [];
  const functionDeclarations = [];

  traverse(ast, {
    Program(path) {
      programPath = path;
    },
    VariableDeclarator(path) {
      variableDeclarators.push(path);
    },
    ExportNamedDeclaration(path) {
      exports.push(path);
    },
    ExportDefaultDeclaration(path) {
      exports.push(path);
    },
    FunctionDeclaration(path) {
      functionDeclarations.push(path);
    },
  });

  return { ast, programPath, variableDeclarators, exports, functionDeclarations };
}

function createClass(name = "WrappedCard") {
  return t.classDeclaration(
    t.identifier(name),
    t.identifier("LitElement"),
    t.classBody([])
  );
}

describe("native wrapper utils internals", () => {
  beforeAll(() => {
    setWrapperUtilsBabelTypes(t);
  });

  it("handles wrapped variable declarators, warnings, cleanup pruning, and null transforms", () => {
    const parsed = parseModule(`
      import { memo } from "react";
      function Inner() {
        return <div />;
      }
      const Card = memo(Inner);
      const Plain = Inner;
    `);

    const [cardPath, plainPath] = parsed.variableDeclarators.filter((path) =>
      t.isIdentifier(path.node.id)
    );

    const cleanupPath = parsed.programPath.get("body.0.specifiers.0");
    const state = { __litsxWarnings: [], __litsxTypeResolver: { label: "resolver" } };
    let updated = null;

    const handled = maybeTransformWrappedVariableDeclarator({
      varPath: cardPath,
      resolvedPluginOptions: { jsxTemplate: false },
      state,
      transformFunction(functionPath, programPath, localName, options) {
        assert.strictEqual(functionPath.node.id.name, "Inner");
        assert.strictEqual(programPath, parsed.programPath);
        assert.strictEqual(localName, "Card");
        assert.strictEqual(options.jsxTemplate, false);
        assert.deepStrictEqual(options.typeResolver, state.__litsxTypeResolver);
        return createClass("Card");
      },
      updateTransformState(nextState, classNode) {
        updated = { nextState, classNode };
      },
      getWrapperMetadata(initPath) {
        if (!initPath.isCallExpression()) return null;
        return {
          functionPath: parsed.functionDeclarations[0],
          options: { lightDom: true },
          warnings: [{ code: "WRAPPED" }],
          cleanups: [{
            shouldRemoveImport: true,
            importSpecifierPath: cleanupPath,
          }],
        };
      },
    });

    assert.strictEqual(handled, true);
    assert.deepStrictEqual(state.__litsxWarnings, [{ code: "WRAPPED" }]);
    assert.strictEqual(updated.nextState, state);
    assert.strictEqual(updated.classNode.id.name, "Card");
    assert.ok(
      parsed.programPath.node.body.some(
        (node) => node.type === "ClassDeclaration" && node.id.name === "Card"
      )
    );
    assert.ok(
      !parsed.programPath.node.body.some(
        (node) => node.type === "ImportDeclaration" && node.source.value === "react"
      )
    );

    assert.strictEqual(
      maybeTransformWrappedVariableDeclarator({
        varPath: plainPath,
        resolvedPluginOptions: {},
        state,
        transformFunction() {
          throw new Error("should not run");
        },
        getWrapperMetadata() {
          return null;
        },
      }),
      false
    );

    assert.strictEqual(
      maybeTransformWrappedVariableDeclarator({
        varPath: plainPath,
        resolvedPluginOptions: {},
        state,
        transformFunction() {
          throw new Error("should not run");
        },
      }),
      false
    );

    const nullTransform = parseModule(`
      import { memo } from "react";
      function Inner() {
        return <div />;
      }
      const Card = memo(Inner);
    `);
    const nullResult = maybeTransformWrappedVariableDeclarator({
      varPath: nullTransform.variableDeclarators[0],
      resolvedPluginOptions: {},
      state: { __litsxWarnings: [] },
      transformFunction() {
        return null;
      },
      getWrapperMetadata() {
        return {
          functionPath: nullTransform.functionDeclarations[0],
          options: {},
          warnings: [],
          cleanups: [],
        };
      },
    });
    assert.strictEqual(nullResult, true);
    assert.ok(
      nullTransform.programPath.node.body.some(
        (node) => node.type === "VariableDeclaration"
      )
    );
  });

  it("transforms named capitalized exports, including default ones", () => {
    const named = parseModule(`
      export function Card() {
        return <div />;
      }
    `);

    const state = {
      __litsxWarnings: [],
      __litsxResolvedPluginOptions: { jsxTemplate: false },
      __litsxTypeResolver: { kind: "resolver" },
    };
    let updates = 0;

    const handledNamed = handlePotentialComponentExport({
      exportPath: named.exports[0],
      state,
      isInsideFunctionOrClass() {
        return false;
      },
      transformFunction(declarationPath, programPath, exportName, options) {
        assert.strictEqual(declarationPath.node.id.name, "Card");
        assert.strictEqual(programPath, named.programPath);
        assert.strictEqual(exportName, "Card");
        assert.strictEqual(options.jsxTemplate, false);
        assert.strictEqual(options.typeResolver.kind, "resolver");
        options.warn({ code: "EMITTED" });
        return createClass("Card");
      },
      updateTransformState() {
        updates += 1;
      },
    });

    assert.strictEqual(handledNamed, true);
    assert.strictEqual(updates, 1);
    assert.deepStrictEqual(state.__litsxWarnings, [{ code: "EMITTED" }]);
    assert.ok(
      named.programPath.node.body.some(
        (node) => node.type === "ExportNamedDeclaration" && node.declaration?.type === "ClassDeclaration"
      )
    );

    const defaultArrow = parseModule(`
      export default function Card() {
        return <div />;
      }
    `);

    const handledDefault = handlePotentialComponentExport({
      exportPath: defaultArrow.exports[0],
      state: { __litsxWarnings: [], __litsxResolvedPluginOptions: {} },
      isDefault: true,
      isInsideFunctionOrClass() {
        return false;
      },
      transformFunction() {
        return createClass("Card");
      },
    });

    assert.strictEqual(handledDefault, true);
    assert.ok(
      defaultArrow.programPath.node.body.some(
        (node) => node.type === "ExportDefaultDeclaration" && node.declaration?.type === "ClassDeclaration"
      )
    );
  });

  it("handles wrapped named/default capitalized exports and short-circuits unsupported cases", () => {
    const wrappedNamed = parseModule(`
      import { memo } from "react";
      function Inner() {
        return <div />;
      }
      export const Card = memo(Inner);
    `);

    const cleanupPath = wrappedNamed.programPath.get("body.0.specifiers.0");
    let updates = 0;
    const state = { __litsxWarnings: [], __litsxResolvedPluginOptions: {} };

    const handledNamed = handlePotentialComponentExport({
      exportPath: wrappedNamed.exports[0],
      state,
      isInsideFunctionOrClass() {
        return false;
      },
      transformFunction(functionPath, programPath, exportName, options) {
        assert.strictEqual(functionPath.node.id.name, "Inner");
        assert.strictEqual(programPath, wrappedNamed.programPath);
        assert.strictEqual(exportName, "Card");
        assert.strictEqual(options.lightDom, true);
        return createClass("Card");
      },
      updateTransformState() {
        updates += 1;
      },
      getWrapperMetadata() {
        return {
          functionPath: wrappedNamed.functionDeclarations[0],
          options: { lightDom: true },
          warnings: [{ code: "WRAPPED_EXPORT" }],
          cleanups: [{
            shouldRemoveImport: true,
            importSpecifierPath: cleanupPath,
          }],
        };
      },
    });

    assert.strictEqual(handledNamed, true);
    assert.strictEqual(updates, 1);
    assert.deepStrictEqual(state.__litsxWarnings, [{ code: "WRAPPED_EXPORT" }]);
    assert.ok(
      !wrappedNamed.programPath.node.body.some(
        (node) => node.type === "ImportDeclaration"
      )
    );

    const wrappedDefault = parseModule(`
      import { memo } from "react";
      function Inner() {
        return <div />;
      }
      export default memo(Inner);
    `);

    const handledDefault = handlePotentialComponentExport({
      exportPath: wrappedDefault.exports[0],
      state: { __litsxWarnings: [], __litsxResolvedPluginOptions: {} },
      isDefault: true,
      isInsideFunctionOrClass() {
        return false;
      },
      transformFunction(functionPath, programPath, inferredName) {
        assert.strictEqual(functionPath.node.id.name, "Inner");
        assert.strictEqual(programPath, wrappedDefault.programPath);
        assert.strictEqual(inferredName, "Inner");
        return createClass("Inner");
      },
      getWrapperMetadata() {
        return {
          functionPath: wrappedDefault.functionDeclarations[0],
          options: {},
          warnings: [],
          cleanups: [],
        };
      },
    });

    assert.strictEqual(handledDefault, true);
    assert.ok(
      wrappedDefault.programPath.node.body.some(
        (node) => node.type === "ExportDefaultDeclaration" && node.declaration?.type === "ClassDeclaration"
      )
    );

    const ignored = parseModule(`
      export const value = memo(Inner);
    `);

    assert.strictEqual(
      handlePotentialComponentExport({
        exportPath: ignored.exports[0],
        state: { __litsxWarnings: [] },
        isInsideFunctionOrClass() {
          return true;
        },
        transformFunction() {
          throw new Error("should not run");
        },
      }),
      false
    );

    assert.strictEqual(
      handlePotentialComponentExport({
        exportPath: ignored.exports[0],
        state: { __litsxWarnings: [] },
        isInsideFunctionOrClass() {
          return false;
        },
        transformFunction() {
          throw new Error("should not run");
        },
        getWrapperMetadata() {
          return null;
        },
      }),
      false
    );

    const nullClass = parseModule(`
      function Inner() {
        return <div />;
      }
      export default memo(Inner);
    `);

    assert.strictEqual(
      handlePotentialComponentExport({
        exportPath: nullClass.exports[0],
        state: { __litsxWarnings: [], __litsxResolvedPluginOptions: {} },
        isDefault: true,
        isInsideFunctionOrClass() {
          return false;
        },
        transformFunction() {
          return null;
        },
        getWrapperMetadata() {
          return {
            functionPath: nullClass.functionDeclarations[0],
            options: {},
            warnings: [],
            cleanups: [],
          };
        },
      }),
      true
    );
  });
});
