import assert from "assert";
import * as babelCore from "@babel/core";
import parser from "./helpers/litsx-parser.js";
import {
  assertNoReactEventAttributes,
  ensureRuntimeNamedImports,
  ensureHooksRenderWrapper,
  extractUseStateInfo,
  isLitElementSuperClass,
  resolveHostInfo,
  HOST_TYPE_CUSTOM,
  HOST_TYPE_RENDER,
  isReactEventAttribute,
} from "../packages/babel-plugin-shared-hooks/src/index.js";
import { describe, it } from "vitest";

const { transformFromAstSync, types: t } = babelCore;

function parseModule(source) {
  return parser.parse(source, { sourceType: "module", plugins: ["typescript"] });
}

describe("@litsx/babel-plugin-shared-hooks helpers", () => {
  it("extracts useState bindings and stable state keys", () => {
    const declaration = parseModule("const [count, setCount] = useState(1);")
      .program.body[0].declarations[0];
    const info = extractUseStateInfo(declaration, new Set(), t);

    assert.equal(info.valueBindingName, "count");
    assert.equal(info.setterBindingName, "setCount");
    assert.equal(info.stateKeyName, "count");
    assert.equal(info.initArg, declaration.init.arguments[0]);
  });

  it("rejects unsupported useState binding patterns", () => {
    const objectPattern = parseModule("const { count } = useState(0);")
      .program.body[0].declarations[0];
    const nonCall = parseModule("const value = 1;")
      .program.body[0].declarations[0];

    assert.equal(extractUseStateInfo(objectPattern, new Set(), t), null);
    assert.equal(extractUseStateInfo(nonCall, new Set(), t), null);
  });

  it("detects React event attributes", () => {
    const ast = parseModule("const view = <button onClick={save} @input={sync} />;");
    const opening = ast.program.body[0].declarations[0].init.openingElement;

    assert.equal(isReactEventAttribute(opening.attributes[0].name, t), true);
    assert.equal(isReactEventAttribute(opening.attributes[1].name, t), false);
    assert.throws(() => {
      transformFromAstSync(ast, "", {
        configFile: false,
        babelrc: false,
        plugins: [() => ({
          visitor: {
            Program(path) {
              assertNoReactEventAttributes(path, t, "React events are disabled.");
            },
          },
        })],
      });
    }, /React events are disabled/);
  });

  it("resolves render and custom-hook scopes without inventing host parameters", () => {
    let renderPath;
    let customPath;
    transformFromAstSync(
      parseModule(`
        function useCounter(initial) { return initial; }
        class Counter { render() { return useCounter(1); } }
      `),
      "",
      {
        configFile: false,
        babelrc: false,
        plugins: [() => ({
          visitor: {
            FunctionDeclaration(path) {
              if (path.node.id?.name === "useCounter") customPath = path;
            },
            ClassMethod(path) {
              if (t.isIdentifier(path.node.key, { name: "render" })) renderPath = path;
            },
          },
        })],
      },
    );

    const renderInfo = resolveHostInfo({ getFunctionParent: () => renderPath }, t);
    const customInfo = resolveHostInfo({ getFunctionParent: () => customPath }, t);

    assert.equal(renderInfo.type, HOST_TYPE_RENDER);
    assert.equal(renderInfo.expression.type, "ThisExpression");
    assert.equal(customInfo.type, HOST_TYPE_CUSTOM);
    assert.equal(customInfo.expression, null);
    assert.deepStrictEqual(customPath.node.params.map((param) => param.name), ["initial"]);
  });

  it("detects LitElement through direct and mixed superclasses", () => {
    assert.equal(isLitElementSuperClass(t.identifier("LitElement"), t), true);
    assert.equal(
      isLitElementSuperClass(
        t.callExpression(t.identifier("mixin"), [t.identifier("LitElement")]),
        t,
      ),
      true,
    );
    assert.equal(isLitElementSuperClass(t.identifier("HTMLElement"), t), false);
  });

  it("creates one idempotent render boundary", () => {
    const result = transformFromAstSync(
      parseModule("class Card { render() { return 1; } }"),
      "",
      {
        configFile: false,
        babelrc: false,
        plugins: [() => ({
          visitor: {
            ClassMethod(path) {
              if (!t.isIdentifier(path.node.key, { name: "render" })) return;
              assert.equal(ensureHooksRenderWrapper(path, t), true);
              assert.equal(ensureHooksRenderWrapper(path, t), false);
            },
          },
        })],
      },
    );

    assert.match(result.code, /return renderWithHooks\(this, \(\) => \{/);
    assert.strictEqual((result.code.match(/renderWithHooks/g) || []).length, 1);
  });

  it("adds runtime imports without duplicating existing specifiers", () => {
    const result = transformFromAstSync(
      parseModule('import { useId } from "@litsx/core";'),
      "",
      {
        configFile: false,
        babelrc: false,
        plugins: [() => ({
          visitor: {
            Program(path) {
              ensureRuntimeNamedImports(
                path,
                "@litsx/core",
                ["useId", "renderWithHooks"],
                t,
              );
            },
          },
        })],
      },
    );

    assert.match(result.code, /import \{ useId, renderWithHooks \} from "@litsx\/core";/);
  });
});
