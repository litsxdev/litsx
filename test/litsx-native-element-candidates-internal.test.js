import assert from "assert";
import * as t from "@babel/types";
import babelCore from "@babel/core";
import babelTraverse from "@babel/traverse";
import fs from "fs";
import os from "os";
import path from "path";
import parser from "../packages/babel-parser-litsx/src/index.js";
import elementCandidatesPlugin, {
  getAnnotatedElementCandidates,
  getAnnotatedImportedElementCandidates,
  getImportedBindingModuleAnalysis,
  importedBindingNeedsRendererContext,
  setElementCandidatesBabelTypes,
} from "../packages/babel-preset-litsx/src/internal/transform-litsx-element-candidates.js";
import { createLitsxTypecheckSession } from "../packages/typescript/src/typecheck.js";

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

  it("returns annotated imported candidates without sharing the original array", () => {
    const { programPath, functionPaths } = getPaths(`
      export function Card() {
        return <section />;
      }
    `);

    const imported = [{ sourceFile: "/tmp/FancyButton.litsx", importedName: "FancyButton", tagName: "fancy-button" }];
    const cardPath = functionPaths.get("Card");
    cardPath.node._litsxImportedElementCandidates = imported;

    const candidates = getAnnotatedImportedElementCandidates(cardPath, programPath);

    assert.deepStrictEqual(candidates, imported);
    assert.notStrictEqual(candidates, imported);
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

  it("annotates top-level anonymous default functions and function expressions", () => {
    const source = `
      import { FancyButton } from "./fancy-button.js";

      export default function () {
        return <FancyButton />;
      }

      export const Card = function () {
        return <FancyButton />;
      };
    `;
    const ast = parser.parse(source, { sourceType: "module" });
    const result = transformFromAstSync(ast, source, {
      configFile: false,
      babelrc: false,
      code: false,
      ast: true,
      plugins: [[elementCandidatesPlugin, {}]],
    });

    let defaultFn = null;
    let cardFn = null;
    traverse(result.ast, {
      ExportDefaultDeclaration(path) {
        if (path.get("declaration").isFunctionDeclaration()) {
          defaultFn = path.node.declaration;
        }
      },
      VariableDeclarator(path) {
        if (
          path.node.id.type === "Identifier" &&
          path.node.id.name === "Card" &&
          path.get("init").isFunctionExpression()
        ) {
          cardFn = path.node.init;
        }
      },
    });

    assert.deepStrictEqual([...defaultFn._litsxElementCandidates], ["FancyButton"]);
    assert.deepStrictEqual([...cardFn._litsxElementCandidates], ["FancyButton"]);
  });

  it("annotates top-level functions without plugin options and skips nested scopes", () => {
    const source = `
      import { FancyButton } from "./fancy-button.js";

      export function Card() {
        return <FancyButton />;
      }

      export const ArrowCard = () => <FancyButton />;

      export const ExprCard = function () {
        return <FancyButton />;
      };

      class Wrapper {
        render() {
          return function nested() {
            return <FancyButton />;
          };
        }
      }
    `;
    const ast = parser.parse(source, { sourceType: "module" });
    const result = transformFromAstSync(ast, source, {
      configFile: false,
      babelrc: false,
      code: false,
      ast: true,
      plugins: [elementCandidatesPlugin],
    });

    let cardFn = null;
    let arrowCard = null;
    let exprCard = null;
    let nestedFn = null;
    traverse(result.ast, {
      FunctionDeclaration(path) {
        if (path.node.id?.name === "Card") {
          cardFn = path.node;
        }
      },
      FunctionExpression(path) {
        if (path.node.id?.name === "nested") {
          nestedFn = path.node;
        }
      },
      VariableDeclarator(path) {
        if (path.node.id.type !== "Identifier") {
          return;
        }
        if (path.node.id.name === "ArrowCard" && path.get("init").isArrowFunctionExpression()) {
          arrowCard = path.node.init;
        }
        if (path.node.id.name === "ExprCard" && path.get("init").isFunctionExpression()) {
          exprCard = path.node.init;
        }
      },
    });

    assert.deepStrictEqual([...cardFn._litsxElementCandidates], ["FancyButton"]);
    assert.deepStrictEqual([...arrowCard._litsxElementCandidates], ["FancyButton"]);
    assert.deepStrictEqual([...exprCard._litsxElementCandidates], ["FancyButton"]);
    assert.strictEqual(nestedFn._litsxElementCandidates, undefined);
  });

  it("collects imported element requirements for default exports and reexports", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "litsx-candidate-imports-"));

    try {
      const rootFile = path.join(tempDir, "demo.litsx");
      const middleFile = path.join(tempDir, "renderers.js");
      const leafFile = path.join(tempDir, "leaf.js");
      const widgetFile = path.join(tempDir, "widget-box.litsx");

      fs.writeFileSync(
        middleFile,
        [
          'export { default as renderHeader } from "./leaf.js";',
        ].join("\n")
      );
      fs.writeFileSync(
        leafFile,
        [
          'import WidgetBox from "./widget-box.litsx";',
          "export default function renderHeader() {",
          "  return <WidgetBox />;",
          "}",
        ].join("\n")
      );
      fs.writeFileSync(widgetFile, "export default function WidgetBox() { return <div />; }");

      const { programPath, functionPaths } = getPaths(`
        import { renderHeader } from "./renderers.js";
        import { GuideCard } from "./guide-card.litsx";
        export function Card() {
          return <GuideCard .header={renderHeader} />;
        }
      `);
      programPath.hub = { file: { opts: { filename: rootFile } } };

      const importedCandidates = getAnnotatedImportedElementCandidates(
        functionPaths.get("Card"),
        programPath,
        { filename: rootFile }
      );

      assert.strictEqual(importedCandidates.length, 1);
      assert.strictEqual(importedCandidates[0].importedName, "default");
      assert.strictEqual(importedCandidates[0].tagName, "widget-box");
      assert.strictEqual(
        importedCandidates[0].sourceFile,
        widgetFile
      );
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("returns false for imported helpers that resolve to namespace or non-component leaves", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "litsx-candidate-noncomponent-"));

    try {
      const rootFile = path.join(tempDir, "demo.litsx");
      const helperFile = path.join(tempDir, "renderers.js");
      const utilFile = path.join(tempDir, "util.js");

      fs.writeFileSync(
        helperFile,
        [
          'import * as helpers from "./util.js";',
          "export const renderHeader = () => helpers.renderPlain();",
        ].join("\n")
      );
      fs.writeFileSync(
        utilFile,
        "export function renderPlain() { return 'plain'; }"
      );

      const { programPath } = getPaths(`
        import { renderHeader } from "./renderers.js";
        export function Card() {
          return <GuideCard .header={renderHeader} />;
        }
      `);
      programPath.hub = { file: { opts: { filename: rootFile } } };

      assert.strictEqual(
        importedBindingNeedsRendererContext(programPath, "renderHeader", { filename: rootFile }),
        false
      );
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("returns false when imported helper modules cannot be read or parsed", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "litsx-candidate-bad-import-"));

    try {
      const missingRoot = path.join(tempDir, "missing-demo.litsx");
      const brokenRoot = path.join(tempDir, "broken-demo.litsx");
      const brokenHelper = path.join(tempDir, "broken.js");

      fs.writeFileSync(
        brokenHelper,
        "export const renderHeader = () => <;"
      );

      let ctx = getPaths(`
        import { renderHeader } from "./missing.js";
        export function Card() {
          return <GuideCard .header={renderHeader} />;
        }
      `);
      ctx.programPath.hub = { file: { opts: { filename: missingRoot } } };
      assert.strictEqual(
        importedBindingNeedsRendererContext(ctx.programPath, "renderHeader", { filename: missingRoot }),
        false
      );

      ctx = getPaths(`
        import { renderHeader } from "./broken.js";
        export function Card() {
          return <GuideCard .header={renderHeader} />;
        }
      `);
      ctx.programPath.hub = { file: { opts: { filename: brokenRoot } } };
      assert.strictEqual(
        importedBindingNeedsRendererContext(ctx.programPath, "renderHeader", { filename: brokenRoot }),
        false
      );
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("throws when an imported helper renders a non-exported component from another module", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "litsx-candidate-unexported-"));

    try {
      const rootFile = path.join(tempDir, "demo.litsx");
      const helperFile = path.join(tempDir, "renderers.js");

      fs.writeFileSync(
        helperFile,
        [
          "const PrivateButton = () => <button />;",
          "export function renderHeader() {",
          "  return <PrivateButton />;",
          "}",
        ].join("\n")
      );

      const { programPath, functionPaths } = getPaths(`
        import { renderHeader } from "./renderers.js";
        import { GuideCard } from "./guide-card.litsx";
        export function Card() {
          return <GuideCard .header={renderHeader} />;
        }
      `);
      programPath.hub = { file: { opts: { filename: rootFile } } };

      assert.throws(
        () =>
          getAnnotatedImportedElementCandidates(functionPaths.get("Card"), programPath, {
            filename: rootFile,
          }),
        /not exported and cannot be added to static elements/
      );
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("detects imported helpers that need renderer context through relative files", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "litsx-candidate-context-"));

    try {
      const rootFile = path.join(tempDir, "demo.litsx");
      const helperFile = path.join(tempDir, "renderers.js");
      const buttonFile = path.join(tempDir, "fancy-button.litsx");

      fs.writeFileSync(
        helperFile,
        [
          'import { FancyButton } from "./fancy-button.litsx";',
          "export function renderHeader() {",
          "  return <FancyButton />;",
          "}",
        ].join("\n")
      );
      fs.writeFileSync(buttonFile, "export const FancyButton = () => <button />;");

      const { programPath } = getPaths(`
        import { renderHeader } from "./renderers.js";
        export function Card() {
          return <GuideCard .header={renderHeader} />;
        }
      `);
      programPath.hub = { file: { opts: { filename: rootFile } } };

      assert.strictEqual(
        importedBindingNeedsRendererContext(programPath, "renderHeader", { filename: rootFile }),
        true
      );
      assert.strictEqual(
        importedBindingNeedsRendererContext(programPath, "MissingRenderer", { filename: rootFile }),
        false
      );
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("resolves aliased imported helpers when a TypeScript project session is available", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "litsx-candidate-alias-"));

    try {
      const srcDir = path.join(tempDir, "src");
      fs.mkdirSync(path.join(srcDir, "components"), { recursive: true });
      const rootFile = path.join(srcDir, "demo.litsx");
      const helperFile = path.join(srcDir, "renderers.js");
      const buttonFile = path.join(srcDir, "components", "fancy-button.litsx");
      const tsconfigPath = path.join(tempDir, "tsconfig.json");

      fs.writeFileSync(tsconfigPath, JSON.stringify({
        compilerOptions: {
          baseUrl: ".",
          paths: {
            "@/*": ["src/*"],
          },
          allowJs: true,
          jsx: "preserve",
          module: "esnext",
          target: "esnext",
        },
        include: ["src/**/*"],
      }));

      fs.writeFileSync(
        helperFile,
        [
          'import { FancyButton } from "@/components/fancy-button.litsx";',
          "export const renderHeader = () => <FancyButton />;",
        ].join("\n")
      );
      fs.writeFileSync(buttonFile, "export const FancyButton = () => <button />;");

      const { programPath } = getPaths(`
        import { renderHeader } from "./renderers.js";
        export function Card() {
          return <GuideCard .header={renderHeader} />;
        }
      `);
      programPath.hub = { file: { opts: { filename: rootFile } } };

      const session = createLitsxTypecheckSession(["--project", tsconfigPath]);
      try {
        assert.strictEqual(
          importedBindingNeedsRendererContext(programPath, "renderHeader", {
            filename: rootFile,
            typescriptSession: session.projectSession,
          }),
          true
        );
      } finally {
        session.projectSession.dispose?.();
      }
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("resolves non-wildcard and absolute path aliases for imported helpers", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "litsx-candidate-absolute-alias-"));

    try {
      const srcDir = path.join(tempDir, "src");
      fs.mkdirSync(path.join(srcDir, "components"), { recursive: true });
      const rootFile = path.join(srcDir, "demo.litsx");
      const helperFile = path.join(srcDir, "renderers.js");
      const buttonFile = path.join(srcDir, "components", "fancy-button.litsx");
      const tsconfigPath = path.join(tempDir, "tsconfig.json");

      fs.writeFileSync(tsconfigPath, JSON.stringify({
        compilerOptions: {
          baseUrl: ".",
          paths: {
            "#button": [buttonFile],
          },
          allowJs: true,
          jsx: "preserve",
          module: "esnext",
          target: "esnext",
        },
        include: ["src/**/*"],
      }));

      fs.writeFileSync(
        helperFile,
        [
          'import { FancyButton } from "#button";',
          "export function renderHeader() {",
          "  return <FancyButton />;",
          "}",
        ].join("\n")
      );
      fs.writeFileSync(buttonFile, "export const FancyButton = () => <button />;");

      const { programPath } = getPaths(`
        import { renderHeader } from "./renderers.js";
        export function Card() {
          return <GuideCard .header={renderHeader} />;
        }
      `);
      programPath.hub = { file: { opts: { filename: rootFile } } };

      const session = createLitsxTypecheckSession(["--project", tsconfigPath]);
      try {
        assert.strictEqual(
          importedBindingNeedsRendererContext(programPath, "renderHeader", {
            filename: rootFile,
            typescriptSession: session.projectSession,
          }),
          true
        );
      } finally {
        session.projectSession.dispose?.();
      }
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("returns imported module analysis through path-alias resolution", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "litsx-candidate-server-alias-"));

    try {
      const srcDir = path.join(tempDir, "src");
      fs.mkdirSync(path.join(srcDir, "pages"), { recursive: true });
      const rootFile = path.join(srcDir, "entry.litsx");
      const pageFile = path.join(srcDir, "pages", "ProductPage.js");
      const tsconfigPath = path.join(tempDir, "tsconfig.json");

      fs.writeFileSync(tsconfigPath, JSON.stringify({
        compilerOptions: {
          baseUrl: ".",
          paths: {
            "@/*": ["src/*"],
          },
          allowJs: true,
          jsx: "preserve",
          module: "esnext",
          target: "esnext",
        },
        include: ["src/**/*"],
      }));

      fs.writeFileSync(
        pageFile,
        [
          "export default async function ProductPage() {",
          "  return <main>ok</main>;",
          "}",
        ].join("\n")
      );

      const { programPath } = getPaths(`
        import ProductPage from "@/pages/ProductPage.js";
        export function Entry() {
          return <ProductPage />;
        }
      `);
      programPath.hub = { file: { opts: { filename: rootFile } } };

      const session = createLitsxTypecheckSession(["--project", tsconfigPath]);
      try {
        const imported = getImportedBindingModuleAnalysis(programPath, "ProductPage", {
          filename: rootFile,
          typescriptSession: session.projectSession,
        });

        assert.strictEqual(imported?.importedName, "default");
        assert.strictEqual(imported?.resolvedSource, pageFile);
        assert.strictEqual(imported?.moduleAnalysis?.filename, pageFile);
      } finally {
        session.projectSession.dispose?.();
      }
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });
});
