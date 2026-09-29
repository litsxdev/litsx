import assert from "assert";
import babelTraverse from "@babel/traverse";
import * as t from "@babel/types";
import { describe, it } from "vitest";
import parser from "./helpers/litsx-parser.js";
import {
  assertValidServerComponentReference,
  isDefaultExportServerComponentPath,
  isServerComponentBindingName,
  setServerComponentBabelTypes,
} from "../packages/babel-preset-litsx/src/internal/transform-litsx-server-components.js";

const traverse = babelTraverse.default ?? babelTraverse;
setServerComponentBabelTypes(t);

function pathsFor(source) {
  const ast = parser.parse(source, { sourceType: "module", plugins: ["jsx"] });
  let programPath;
  let exportPath;
  let jsxNamePath;
  traverse(ast, {
    Program(path) { programPath = path; },
    ExportDefaultDeclaration(path) { exportPath = path; },
    JSXIdentifier(path) {
      if (path.node.name === "ProductPage") {
        jsxNamePath = path;
      }
    },
  });
  return { programPath, exportPath, jsxNamePath };
}

describe("native server component internals", () => {
  it("recognizes default async renderable exports and rejects non-default references", () => {
    const valid = pathsFor(`export default async function ProductPage() { return <main>ready</main>; }`);
    assert.strictEqual(isDefaultExportServerComponentPath(valid.exportPath), true);
    assert.strictEqual(isServerComponentBindingName(valid.programPath, "ProductPage"), true);

    const invalid = pathsFor(`async function ProductPage() { return <main>ready</main>; } export default ProductPage;`);
    assert.strictEqual(isDefaultExportServerComponentPath(invalid.exportPath), true);

    const nonRenderable = pathsFor(`export default async function ProductPage() { return 1; }`);
    assert.strictEqual(isDefaultExportServerComponentPath(nonRenderable.exportPath), false);
    assert.strictEqual(isServerComponentBindingName(nonRenderable.programPath, "ProductPage"), false);
    assert.strictEqual(isServerComponentBindingName(valid.programPath, ""), false);

    const arrow = pathsFor(`const ProductPage = async () => <main>ready</main>; export default ProductPage;`);
    assert.strictEqual(isDefaultExportServerComponentPath(arrow.exportPath), true);

    const reference = pathsFor(`async function ProductPage() { return <main>ready</main>; } const view = <ProductPage />;`);
    assert.throws(
      () => assertValidServerComponentReference(reference.jsxNamePath, reference.programPath, { requireDefaultExport: true }),
      /must be the module default export/,
    );
    assert.doesNotThrow(() =>
      assertValidServerComponentReference(reference.jsxNamePath, reference.programPath),
    );
  });
});
