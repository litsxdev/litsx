import assert from "assert";
import * as t from "@babel/types";
import babelCore from "@babel/core";
import babelTraverse from "@babel/traverse";
import parser from "../packages/babel-parser-litsx/src/index.mjs";
import elementCandidatesPlugin, {
  getAnnotatedElementCandidates,
  setElementCandidatesBabelTypes,
} from "../packages/babel-preset-litsx/src/internal/transform-litsx-element-candidates.js";

const traverse = babelTraverse.default || babelTraverse;
const { transformFromAstSync } = babelCore;

function getPaths(source) {
  const ast = parser.parse(source, { sourceType: "module" });
  let programPath;
  const functionPaths = new Map();
  const arrowPaths = [];

  traverse(ast, {
    Program(path) {
      programPath = path;
    },
    FunctionDeclaration(path) {
      if (path.node.id?.name) {
        functionPaths.set(path.node.id.name, path);
      }
    },
    VariableDeclarator(path) {
      if (path.get("init").isArrowFunctionExpression()) {
        arrowPaths.push(path.get("init"));
      }
    },
  });

  return { ast, programPath, functionPaths, arrowPaths };
}

describe("native element candidate internals", () => {
  beforeAll(() => {
    setElementCandidatesBabelTypes(t);
  });

  it("returns annotated candidate sets without sharing the original instance", () => {
    const { programPath, functionPaths } = getPaths(`
      export function Card() {
        return <section />;
      }
    `);

    const cardPath = functionPaths.get("Card");
    cardPath.node._litsxElementCandidates = new Set(["FancyButton"]);

    const candidates = getAnnotatedElementCandidates(cardPath, programPath);

    assert.deepStrictEqual([...candidates], ["FancyButton"]);
    assert.notStrictEqual(candidates, cardPath.node._litsxElementCandidates);
  });

  it("returns an empty set when the component or program path is missing", () => {
    const { programPath } = getPaths(`export function Card() { return <section />; }`);

    assert.deepStrictEqual([...getAnnotatedElementCandidates(null, programPath)], []);
    assert.deepStrictEqual([...getAnnotatedElementCandidates({ node: null }, programPath)], []);
    assert.deepStrictEqual([...getAnnotatedElementCandidates(null, null)], []);
  });

  it("collects imported and top-level helper candidates transitively", () => {
    const { programPath, functionPaths } = getPaths(`
      import { FancyButton } from "./fancy-button.js";

      class Panel {}

      export class ExportedCard {}

      function renderHeader() {
        return <FancyButton />;
      }

      const renderBody = () => <Panel />;

      export function Card() {
        return (
          <section>
            {renderHeader()}
            {renderBody()}
            <ExportedCard />
          </section>
        );
      }
    `);

    const candidates = getAnnotatedElementCandidates(functionPaths.get("Card"), programPath);

    assert.deepStrictEqual(
      [...candidates].sort(),
      ["ExportedCard", "FancyButton", "Panel"]
    );
  });

  it("supports function-expression helpers and recursive helper graphs", () => {
    const { programPath, functionPaths } = getPaths(`
      import { FancyButton } from "./fancy-button.js";

      const renderHeader = function () {
        return renderBody();
      };

      const renderBody = () => {
        if (Math.random() > 2) {
          return renderHeader();
        }

        return <FancyButton />;
      };

      export function Card() {
        return renderHeader();
      }
    `);

    const candidates = getAnnotatedElementCandidates(functionPaths.get("Card"), programPath);

    assert.deepStrictEqual([...candidates], ["FancyButton"]);
  });

  it("allows compat names and optionally ignores unknown PascalCase", () => {
    const { programPath, functionPaths } = getPaths(`
      export function Card() {
        return (
          <section>
            <Suspense />
            <MissingThing />
          </section>
        );
      }
    `);

    programPath.setData("__litsxCompatPascalNames", new Set(["Suspense"]));

    const candidates = getAnnotatedElementCandidates(
      functionPaths.get("Card"),
      programPath,
      { allowUnknownPascalCase: true }
    );

    assert.deepStrictEqual([...candidates], []);
  });

  it("throws for truly undeclared PascalCase components", () => {
    const { programPath, functionPaths } = getPaths(`
      export function Card() {
        return <MissingThing />;
      }
    `);

    assert.throws(
      () => getAnnotatedElementCandidates(functionPaths.get("Card"), programPath),
      /Unknown LitSX component "MissingThing"/
    );
  });

  it("ignores component-scope PascalCase bindings that are not module-level", () => {
    const { programPath, functionPaths } = getPaths(`
      export function Card() {
        const Local = () => null;
        return <Local />;
      }
    `);

    const candidates = getAnnotatedElementCandidates(functionPaths.get("Card"), programPath);

    assert.deepStrictEqual([...candidates], []);
  });

  it("annotates top-level functions while skipping nested arrows", () => {
    const source = `
      import { FancyButton } from "./fancy-button.js";

      export const Card = () => <FancyButton />;

      class Wrapper {
        render() {
          return (() => <FancyButton />);
        }
      }
    `;
    const ast = parser.parse(source, { sourceType: "module" });
    const result = transformFromAstSync(ast, source, {
      configFile: false,
      babelrc: false,
      code: false,
      ast: true,
      plugins: [[elementCandidatesPlugin, {}]],
    });

    let topLevelArrow = null;
    let nestedArrow = null;
    traverse(result.ast, {
      VariableDeclarator(path) {
        if (
          path.node.id.type === "Identifier" &&
          path.node.id.name === "Card" &&
          path.get("init").isArrowFunctionExpression()
        ) {
          topLevelArrow = path.node.init;
        }
      },
      ArrowFunctionExpression(path) {
        if (path.parentPath.isReturnStatement()) {
          nestedArrow = path.node;
        }
      },
    });

    assert.deepStrictEqual([...topLevelArrow._litsxElementCandidates], ["FancyButton"]);
    assert.strictEqual(nestedArrow._litsxElementCandidates, undefined);
  });
});
