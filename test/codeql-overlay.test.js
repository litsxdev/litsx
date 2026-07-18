import assert from "assert";
import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, describe, it } from "vitest";

import {
  buildCodeqlVirtualSourceTree,
  getOverlayRelativePath,
  rewriteLitsxSpecifiers,
} from "../scripts/codeql/build-virtual-source.js";

const tempDirs = [];

function createTempRepo() {
  const tempDir = fs.mkdtempSync(
    path.join(os.tmpdir(), "litsx-codeql-overlay-"),
  );
  tempDirs.push(tempDir);
  return tempDir;
}

function writeFile(root, relativePath, content) {
  const filePath = path.join(root, relativePath);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content);
}

afterEach(() => {
  while (tempDirs.length > 0) {
    fs.rmSync(tempDirs.pop(), { recursive: true, force: true });
  }
});

describe("CodeQL overlay builder", () => {
  it("rewrites LitSX module specifiers across import styles", () => {
    const source = [
      'import { Card } from "./card.litsx";',
      'export { Card } from "./card.litsx";',
      'const lazyCard = import("./card.litsx");',
      'const cjsCard = require("./card.litsx");',
      'const untouched = "./card.litsx";',
    ].join("\n");

    const result = rewriteLitsxSpecifiers(source);

    assert.match(result, /from "\.\/card\.tsx"/);
    assert.match(result, /import\("\.\/card\.tsx"\)/);
    assert.match(result, /require\("\.\/card\.tsx"\)/);
    assert.match(result, /const untouched = "\.\/card\.litsx";/);
  });

  it("renames .litsx overlay files to .tsx", () => {
    assert.strictEqual(
      getOverlayRelativePath("src/components/product-card.litsx"),
      "src/components/product-card.tsx",
    );
    assert.strictEqual(getOverlayRelativePath("src/index.ts"), "src/index.ts");
  });

  it("builds a virtualized overlay and rewrites imports to renamed authored modules", () => {
    const repoRoot = createTempRepo();
    writeFile(
      repoRoot,
      "src/product-card.litsx",
      [
        'import { useLocale } from "./locale-hooks.litsx";',
        "export const ProductCard = () => <button @click={handleClick} .value={value}>{label}</button>;",
      ].join("\n"),
    );
    writeFile(
      repoRoot,
      "src/locale-hooks.litsx",
      'export const useLocale = () => "es";\n',
    );
    writeFile(
      repoRoot,
      "src/index.ts",
      'export { ProductCard } from "./product-card.litsx";\n',
    );
    writeFile(
      repoRoot,
      "package.json",
      JSON.stringify({ name: "fixture", type: "module" }, null, 2),
    );
    writeFile(repoRoot, "coverage/ignored.js", "const ignored = true;\n");
    writeFile(
      repoRoot,
      "packages/demo/dist/ignored.js",
      "const ignored = true;\n",
    );

    const { outputRoot, writtenFiles } = buildCodeqlVirtualSourceTree({
      repoRoot,
      outputRoot: path.join(repoRoot, ".codeql-overlay"),
    });

    const virtualizedCard = fs.readFileSync(
      path.join(outputRoot, "src/product-card.tsx"),
      "utf8",
    );
    const virtualizedIndex = fs.readFileSync(
      path.join(outputRoot, "src/index.ts"),
      "utf8",
    );

    assert.ok(writtenFiles.includes("src/product-card.tsx"));
    assert.ok(writtenFiles.includes("src/locale-hooks.tsx"));
    assert.ok(writtenFiles.includes("src/index.ts"));
    assert.ok(writtenFiles.includes("package.json"));
    assert.doesNotMatch(virtualizedCard, /@click/);
    assert.doesNotMatch(virtualizedCard, /\.value=/);
    assert.match(virtualizedCard, /__litsx_event_click/);
    assert.match(virtualizedCard, /__litsx_prop_value/);
    assert.match(virtualizedCard, /from "\.\/locale-hooks\.tsx"/);
    assert.match(virtualizedIndex, /from "\.\/product-card\.tsx"/);
    assert.ok(!fs.existsSync(path.join(outputRoot, "coverage/ignored.js")));
    assert.ok(
      !fs.existsSync(path.join(outputRoot, "packages/demo/dist/ignored.js")),
    );
  });
});
