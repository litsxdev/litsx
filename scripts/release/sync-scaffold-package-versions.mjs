import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createCaretVersionMap } from "./package-version-map.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const targetFile = path.join(repoRoot, "packages/create-litsx-app/src/index.js");

const versionMap = createCaretVersionMap([
  "litsx",
  "@litsx/eslint-plugin",
  "@litsx/typescript-plugin",
  "@litsx/vite-plugin",
  "prettier-plugin-litsx",
]);

const versionLiteral = `${JSON.stringify(versionMap, null, 2)};`;

const source = fs.readFileSync(targetFile, "utf8");
const pattern = /const PUBLISHED_PACKAGE_VERSIONS = \{[\s\S]*?\n\};/;
if (!pattern.test(source)) {
  throw new Error("failed to update PUBLISHED_PACKAGE_VERSIONS in packages/create-litsx-app/src/index.js");
}
const nextSource = source.replace(
  pattern,
  `const PUBLISHED_PACKAGE_VERSIONS = ${versionLiteral}`,
);

fs.writeFileSync(targetFile, nextSource);
console.log("synced create-litsx-app package versions");
