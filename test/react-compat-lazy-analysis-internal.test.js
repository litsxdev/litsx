import assert from "assert";
import * as t from "@babel/types";
import babelTraverse from "@babel/traverse";
import parser from "../packages/babel-parser-litsx/src/index.js";
import {
  cloneLazyMarked,
  hasLazyOrigin,
  isLazyCallee,
  resolveValueNode,
  setReactLazyAnalysisBabelTypes,
  trackLazyUsage,
} from "../packages/babel-preset-react-compat/src/internal/react-lazy-analysis.js";

const traverse = babelTraverse.default || babelTraverse;

function getPaths(source) {
  const ast = parser.parse(source, { sourceType: "module" });
  let programPath;
  const callPaths = [];
  const jsxPaths = [];
  const declarators = new Map();

  traverse(ast, {
    Program(path) {
      programPath = path;
    },
    CallExpression(path) {
      callPaths.push(path);
    },
    JSXElement(path) {
      jsxPaths.push(path);
    },
    VariableDeclarator(path) {
      if (path.node.id.type === "Identifier") {
        declarators.set(path.node.id.name, path);
      }
    },
  });

  return { programPath, callPaths, jsxPaths, declarators };
}

describe("react compat lazy analysis internals", () => {
  beforeAll(() => {
    setReactLazyAnalysisBabelTypes(t);
  });

  it("detects identifier and namespace lazy callees", () => {
    const { callPaths } = getPaths(`
      import { lazy } from "react";
      import * as React from "react";

      const A = lazy(() => import("./A.js"));
      const B = React.lazy(() => import("./B.js"));
      const C = other(() => import("./C.js"));
    `);

    const state = {
      lazyLocalNames: new Set(["lazy"]),
      reactNamespaceNames: new Set(["React"]),
    };

    assert.strictEqual(isLazyCallee(callPaths[0], state), true);
    assert.strictEqual(isLazyCallee(callPaths[2], state), true);
    assert.strictEqual(isLazyCallee(callPaths[4], state), false);
  });

  it("resolves classes, missing bindings, cycles, and invalid conditional branches", () => {
    const { programPath, declarators } = getPaths(`
      class FancyButton {}
      const MissingRef = UnknownThing;
      const Loop = Loop;
      const controls = { FancyButton };
      const Computed = controls[kind];
      const Maybe = flag ? FancyButton : controls[kind];
    `);
    const state = {
      lazyLocalNames: new Set(),
      reactNamespaceNames: new Set(),
    };

    const missingRef = declarators.get("MissingRef").node.init;
    const loopRef = declarators.get("Loop").node.init;
    const computedRef = declarators.get("Computed").node.init;
    const maybeRef = declarators.get("Maybe").node.init;

    assert.strictEqual(resolveValueNode(t.identifier("UnknownThing"), programPath.scope, state).name, "UnknownThing");
    assert.strictEqual(resolveValueNode(t.identifier("FancyButton"), programPath.scope, state).type, "ClassDeclaration");
    assert.strictEqual(resolveValueNode(missingRef, programPath.scope, state).name, "UnknownThing");
    assert.strictEqual(resolveValueNode(loopRef, programPath.scope, state), null);
    assert.strictEqual(resolveValueNode(computedRef, programPath.scope, state), null);
    assert.strictEqual(resolveValueNode(maybeRef, programPath.scope, state), null);
  });

  it("resolves aliased lazy declarators and distinguishes resolvable from unresolvable call branches", () => {
    const { programPath, declarators } = getPaths(`
      const Loader = PLACEHOLDER;
      const Alias = Loader;

      function pickValid(flag) {
        if (flag) return Loader;
        return Alias;
      }

      function pickInvalid(flag) {
        if (flag) return Loader;
        return MissingThing;
      }

      const ValidChoice = pickValid(flag);
      const InvalidChoice = pickInvalid(flag);
      const UnknownChoice = resolveLater(flag);
    `);
    const state = {
      lazyLocalNames: new Set(),
      reactNamespaceNames: new Set(),
    };

    declarators.get("Loader").node.init = cloneLazyMarked(t.identifier("ActualLoader"));

    assert.strictEqual(
      resolveValueNode(t.identifier("Alias"), programPath.scope, state).__litsxLazyOrigin,
      true
    );
    assert.strictEqual(
      resolveValueNode(declarators.get("ValidChoice").node.init, programPath.scope, state).type,
      "CallExpression"
    );
    assert.strictEqual(
      resolveValueNode(declarators.get("InvalidChoice").node.init, programPath.scope, state).type,
      "CallExpression"
    );
    assert.strictEqual(
      resolveValueNode(declarators.get("UnknownChoice").node.init, programPath.scope, state),
      null
    );
    assert.strictEqual(
      hasLazyOrigin(declarators.get("ValidChoice").node.init, programPath.scope, state),
      true
    );
    assert.strictEqual(
      hasLazyOrigin(declarators.get("InvalidChoice").node.init, programPath.scope, state),
      true
    );
    assert.strictEqual(
      hasLazyOrigin(declarators.get("UnknownChoice").node.init, programPath.scope, state),
      false
    );
  });

  it("tracks special-member lazy usage and rewrites the JSX tag", () => {
    const { declarators, jsxPaths } = getPaths(`
      const Controls = { PrimaryAction: Loader };

      class Screen {
        render() {
          return <Controls .PrimaryAction />;
        }
      }
    `);
    const state = {
      lazyLocalNames: new Set(),
      reactNamespaceNames: new Set(),
    };
    const requirements = new Map();
    const controlsInit = declarators.get("Controls").node.init;

    controlsInit.properties[0].value = cloneLazyMarked(controlsInit.properties[0].value);

    trackLazyUsage(jsxPaths[0], state, () => requirements);

    assert.strictEqual(hasLazyOrigin(t.memberExpression(t.identifier("Controls"), t.identifier("PrimaryAction")), jsxPaths[0].scope, state), true);
    assert.strictEqual(jsxPaths[0].node.openingElement.name.name, "primary-action");
    assert.deepStrictEqual(jsxPaths[0].node.openingElement.attributes, []);
    assert.deepStrictEqual([...requirements.keys()], ["primary-action:Controls.PrimaryAction"]);
  });

  it("recognizes member, conditional, and loader-like lazy origins", () => {
    const { programPath, declarators } = getPaths(`
      const LoaderFactory = () => import("./FancyButton.js");
      const controls = {
        Marked: Loader,
        Plain: PlainThing,
      };
    `);
    const state = {
      lazyLocalNames: new Set(),
      reactNamespaceNames: new Set(),
    };

    declarators.get("controls").node.init.properties[0].value = cloneLazyMarked(
      declarators.get("controls").node.init.properties[0].value
    );

    const markedMember = t.memberExpression(t.identifier("controls"), t.identifier("Marked"));
    const missingMember = t.memberExpression(t.identifier("controls"), t.identifier("Missing"));
    const alternateConditional = t.conditionalExpression(
      t.identifier("flag"),
      t.identifier("PlainThing"),
      t.identifier("LoaderFactory")
    );

    assert.strictEqual(hasLazyOrigin(markedMember, programPath.scope, state), true);
    assert.strictEqual(hasLazyOrigin(missingMember, programPath.scope, state), false);
    assert.strictEqual(hasLazyOrigin(alternateConditional, programPath.scope, state), true);
    assert.strictEqual(
      hasLazyOrigin(declarators.get("LoaderFactory").node.init, programPath.scope, state),
      true
    );
    assert.strictEqual(
      resolveValueNode(markedMember, programPath.scope, state).__litsxLazyOrigin,
      true
    );
    assert.strictEqual(resolveValueNode(t.nullLiteral(), programPath.scope, state).type, "NullLiteral");
    assert.strictEqual(
      resolveValueNode(t.identifier("undefined"), programPath.scope, state).name,
      "undefined"
    );
  });

  it("returns null for non-identifier callees and member lookups on non-object values", () => {
    const { programPath } = getPaths(`
      const LoaderFactory = () => import("./FancyButton.js");
    `);
    const state = {
      lazyLocalNames: new Set(),
      reactNamespaceNames: new Set(),
    };

    const namespacedCall = t.callExpression(
      t.memberExpression(t.identifier("api"), t.identifier("load")),
      []
    );
    const invalidMemberLookup = t.memberExpression(
      t.identifier("LoaderFactory"),
      t.identifier("PrimaryAction")
    );

    assert.strictEqual(resolveValueNode(namespacedCall, programPath.scope, state), null);
    assert.strictEqual(resolveValueNode(invalidMemberLookup, programPath.scope, state), null);
  });

  it("analyzes arrow-expression, switch, and empty-return function bodies", () => {
    const { programPath, declarators } = getPaths(`
      const PrimaryLoader = PLACEHOLDER;
      const SecondaryLoader = PLACEHOLDER;

      const pickInline = (mode) => mode ? PrimaryLoader : SecondaryLoader;

      function pickSwitch(mode) {
        switch (mode) {
          case "primary":
            return PrimaryLoader;
          default:
            return SecondaryLoader;
        }
      }

      function returnNothing() {
        return;
      }

      const InlineChoice = pickInline(mode);
      const SwitchChoice = pickSwitch(mode);
      const EmptyChoice = returnNothing();
    `);
    const state = {
      lazyLocalNames: new Set(),
      reactNamespaceNames: new Set(),
    };

    declarators.get("PrimaryLoader").node.init = cloneLazyMarked(t.identifier("LoadPrimary"));
    declarators.get("SecondaryLoader").node.init = cloneLazyMarked(t.identifier("LoadSecondary"));

    assert.strictEqual(
      resolveValueNode(declarators.get("InlineChoice").node.init, programPath.scope, state).type,
      "CallExpression"
    );
    assert.strictEqual(
      resolveValueNode(declarators.get("SwitchChoice").node.init, programPath.scope, state).type,
      "CallExpression"
    );
    assert.strictEqual(
      resolveValueNode(declarators.get("EmptyChoice").node.init, programPath.scope, state).type,
      "CallExpression"
    );
    assert.strictEqual(
      hasLazyOrigin(declarators.get("InlineChoice").node.init, programPath.scope, state),
      true
    );
    assert.strictEqual(
      hasLazyOrigin(declarators.get("EmptyChoice").node.init, programPath.scope, state),
      false
    );
  });

  it("collects nested if returns when resolving function call branches", () => {
    const { programPath, declarators } = getPaths(`
      const PrimaryLoader = PLACEHOLDER;
      const SecondaryLoader = PLACEHOLDER;

      function pickNested(flag, detail) {
        if (flag) {
          if (detail) {
            return PrimaryLoader;
          }

          return SecondaryLoader;
        }

        return SecondaryLoader;
      }

      const NestedChoice = pickNested(flag, detail);
    `);
    const state = {
      lazyLocalNames: new Set(),
      reactNamespaceNames: new Set(),
    };

    declarators.get("PrimaryLoader").node.init = cloneLazyMarked(t.identifier("LoadPrimary"));
    declarators.get("SecondaryLoader").node.init = cloneLazyMarked(t.identifier("LoadSecondary"));

    assert.strictEqual(
      resolveValueNode(declarators.get("NestedChoice").node.init, programPath.scope, state).type,
      "CallExpression"
    );
    assert.strictEqual(
      hasLazyOrigin(declarators.get("NestedChoice").node.init, programPath.scope, state),
      true
    );
  });

  it("rewrites member-expression JSX names and closing tags for lazy object properties", () => {
    const { declarators, jsxPaths } = getPaths(`
      const controls = { FancyButton: Loader };

      class Screen {
        render() {
          return <controls.FancyButton></controls.FancyButton>;
        }
      }
    `);
    const state = {
      lazyLocalNames: new Set(),
      reactNamespaceNames: new Set(),
    };
    const requirements = new Map();

    declarators.get("controls").node.init.properties[0].value = cloneLazyMarked(
      declarators.get("controls").node.init.properties[0].value
    );

    trackLazyUsage(jsxPaths[0], state, () => requirements);

    assert.strictEqual(jsxPaths[0].node.openingElement.name.name, "fancy-button");
    assert.strictEqual(jsxPaths[0].node.closingElement.name.name, "fancy-button");
    assert.deepStrictEqual([...requirements.keys()], ["fancy-button:controls.FancyButton"]);
  });

  it("skips invalid special-member rewrites", () => {
    const invalidObject = getPaths(`
      const Controls = { PrimaryAction: Loader };

      class Screen {
        render() {
          return <Controls.Group .PrimaryAction />;
        }
      }
    `);
    const invalidProperty = getPaths(`
      const Controls = { PrimaryAction: Loader };

      class Screen {
        render() {
          return <Controls .PrimaryAction />;
        }
      }
    `);
    const state = {
      lazyLocalNames: new Set(),
      reactNamespaceNames: new Set(),
    };

    invalidObject.declarators.get("Controls").node.init.properties[0].value = cloneLazyMarked(
      invalidObject.declarators.get("Controls").node.init.properties[0].value
    );
    invalidProperty.declarators.get("Controls").node.init.properties[0].value = cloneLazyMarked(
      invalidProperty.declarators.get("Controls").node.init.properties[0].value
    );
    invalidProperty.jsxPaths[0].node.openingElement.attributes[0].name.name = ".";

    const objectRequirements = new Map();
    const propertyRequirements = new Map();

    trackLazyUsage(invalidObject.jsxPaths[0], state, () => objectRequirements);
    trackLazyUsage(invalidProperty.jsxPaths[0], state, () => propertyRequirements);

    assert.strictEqual(invalidObject.jsxPaths[0].node.openingElement.name.type, "JSXMemberExpression");
    assert.strictEqual(invalidProperty.jsxPaths[0].node.openingElement.name.name, "Controls");
    assert.deepStrictEqual([...objectRequirements.keys()], []);
    assert.deepStrictEqual([...propertyRequirements.keys()], []);
  });

  it("skips unresolved lazy tracking when the JSX element is outside a render method", () => {
    const { declarators, jsxPaths } = getPaths(`
      const Controls = { PrimaryAction: Loader };

      export const Screen = () => <Controls .PrimaryAction />;
    `);
    const state = {
      lazyLocalNames: new Set(),
      reactNamespaceNames: new Set(),
    };
    const requirements = new Map();
    const controlsInit = declarators.get("Controls").node.init;

    controlsInit.properties[0].value = cloneLazyMarked(controlsInit.properties[0].value);

    trackLazyUsage(jsxPaths[0], state, () => requirements);

    assert.strictEqual(jsxPaths[0].node.openingElement.name.type, "JSXIdentifier");
    assert.strictEqual(jsxPaths[0].node.openingElement.name.name, "Controls");
    assert.deepStrictEqual([...requirements.keys()], []);
  });
});
