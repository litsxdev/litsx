import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, it } from "vitest";
import {
  createImportedStaticStyleClassifier,
  moduleRecord,
  resolveFile,
  unwrap,
} from "../packages/babel-preset-litsx/src/internal/static-style-validation.js";

const tempDirs = [];

afterEach(() => {
  while (tempDirs.length) fs.rmSync(tempDirs.pop(), { recursive: true, force: true });
});

function fixture(files) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "litsx-style-classifier-"));
  tempDirs.push(dir);
  for (const [relative, source] of Object.entries(files)) {
    const filename = path.join(dir, relative);
    fs.mkdirSync(path.dirname(filename), { recursive: true });
    fs.writeFileSync(filename, source);
  }
  return dir;
}

function binding(source, importedName = "styles", isDefault = false, importedAsString = false) {
  return {
    isImportSpecifier: () => !isDefault,
    isImportDefaultSpecifier: () => isDefault,
    parentPath: { node: { source: { value: source } } },
    node: {
      imported: importedAsString
        ? { type: "StringLiteral", value: importedName }
        : { type: "Identifier", name: importedName },
    },
  };
}

describe("imported static style classification", () => {
  it("parses uncommon module records and resolution fallbacks", () => {
    const dir = fixture({
      "record.ts": `
        import fallback from "./dep";
        import * as namespace from "./dep";
        const { skipped } = source;
        let uninitialized;
        const local = "style";
        export { local as "string-name" };
        export { missing as forwarded } from "./missing";
        export default { color: "red" };
      `,
      "dep.ts": "export default 'dep';",
      "main.ts": "",
    });
    const main = path.join(dir, "main.ts");
    const file = path.join(dir, "record.ts");
    const record = moduleRecord(file);
    assert.strictEqual(record.imports.get("fallback").imported, "default");
    assert.strictEqual(record.imports.has("namespace"), false);
    assert.strictEqual(record.exports.get("string-name").local, "local");
    assert.strictEqual(record.exports.get("default").node.type, "ObjectExpression");
    assert.strictEqual(resolveFile(main, "node:path"), null);
    assert.strictEqual(resolveFile(main, "./missing"), null);
    assert.strictEqual(resolveFile(main, "./dep"), path.join(dir, "dep.ts"));
    assert.strictEqual(unwrap(null), null);
    const direct = { type: "StringLiteral" };
    assert.strictEqual(unwrap(direct), direct);

    const classify = createImportedStaticStyleClassifier(main);
    assert.strictEqual(classify(binding("./record", "default", true)), true);
    assert.strictEqual(classify(binding("./record", "forwarded")), false);
  });

  it("classifies all finite local expression shapes through imports", () => {
    const dir = fixture({
      "styles.ts": `
        const stringStyle = ":host{}";
        const templateStyle = \`:host{color:red}\`;
        const objectStyle = { color: "red" };
        const arrayStyle = [null, ...[stringStyle], unknown, objectStyle];
        const conditionalStyle = condition ? unknown : templateStyle;
        const logicalStyle = unknown || objectStyle;
        const wrappedStyle = (stringStyle as string)!;
        const cycleA = cycleB;
        const cycleB = cycleA;
        export { stringStyle, templateStyle, objectStyle, arrayStyle, conditionalStyle, logicalStyle, wrappedStyle, cycleA };
        export const unsupported = css\`:host{}\`;
        export const emptyArray = [];
      `,
      "main.ts": "",
    });
    const filename = path.join(dir, "main.ts");
    const classify = createImportedStaticStyleClassifier(filename);

    for (const name of [
      "stringStyle",
      "templateStyle",
      "objectStyle",
      "arrayStyle",
      "conditionalStyle",
      "logicalStyle",
      "wrappedStyle",
    ]) {
      assert.equal(classify(binding("./styles", name)), true, name);
    }
    assert.equal(classify(binding("./styles", "unsupported")), false);
    assert.equal(classify(binding("./styles", "emptyArray")), false);
    assert.equal(classify(binding("./styles", "cycleA")), false);
    assert.equal(classify(binding("./styles", "missing")), false);
  });

  it("follows defaults, aliases, re-exports, export-all, directories, and absolute paths", () => {
    const dir = fixture({
      "tokens.ts": `
        const local = { color: "red" };
        export { local as aliased };
        export default local;
        export const named = [local];
      `,
      "barrel/index.ts": `export { aliased as styles } from "../tokens";`,
      "all.ts": `export * from "./missing"; export * from "./tokens";`,
      "cycle-a.ts": `export { styles } from "./cycle-b";`,
      "cycle-b.ts": `export { styles } from "./cycle-a";`,
      "main.ts": "",
    });
    const filename = path.join(dir, "main.ts");
    const classify = createImportedStaticStyleClassifier(filename);

    assert.equal(classify(binding("./tokens", "default", true)), true);
    assert.equal(classify(binding("./tokens", "aliased")), true);
    assert.equal(classify(binding("./tokens", "named", false, true)), true);
    assert.equal(classify(binding("./barrel", "styles")), true);
    assert.equal(classify(binding("./all", "named")), true);
    assert.equal(classify(binding(path.join(dir, "tokens.ts"), "named")), true);
    assert.equal(classify(binding("./cycle-a", "styles")), false);
    assert.equal(classify(binding("./missing", "styles")), false);
    assert.equal(classify(binding("definitely-not-a-real-litsx-package", "styles")), false);
  });

  it("rejects invalid binding shapes and absent source context", () => {
    const noFilename = createImportedStaticStyleClassifier("");
    assert.equal(noFilename(binding("./styles")), false);

    const classify = createImportedStaticStyleClassifier("/virtual/main.ts");
    assert.equal(classify(null), false);
    assert.equal(classify({ isImportSpecifier: () => false, isImportDefaultSpecifier: () => false }), false);
    assert.equal(classify({
      isImportSpecifier: () => true,
      isImportDefaultSpecifier: () => false,
      parentPath: { node: { source: { value: null } } },
      node: { imported: { name: "styles" } },
    }), false);
  });
});
