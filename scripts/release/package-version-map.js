import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

export const packageDirsByName = new Map([
  ["@litsx/core", "packages/core"],
  ["@litsx/compiler", "packages/compiler"],
  ["@litsx/vite-plugin", "packages/vite-plugin"],
  ["@litsx/typescript", "packages/typescript"],
  ["@litsx/eslint-plugin", "packages/eslint-plugin-litsx"],
  ["create-litsx-app", "packages/create-litsx-app"],
  ["prettier-plugin-litsx", "packages/prettier-plugin-litsx"],
  ["@litsx/scoped-registry-shim", "packages/scoped-registry-shim"],
  ["@litsx/ssr", "packages/ssr"],
  ["@litsx/authoring", "packages/authoring"],
  ["@litsx/prop-types", "packages/prop-types"],
  ["@litsx/babel-preset-litsx", "packages/babel-preset-litsx"],
  ["@litsx/babel-preset-react-compat", "packages/babel-preset-react-compat"],
  ["@litsx/babel-plugin-transform-jsx-html-template", "packages/babel-plugin-transform-jsx-html-template"],
  ["@litsx/babel-plugin-transform-litsx-scoped-elements", "packages/babel-plugin-transform-litsx-scoped-elements"],
  ["@litsx/babel-plugin-litsx-proptypes", "packages/babel-plugin-litsx-proptypes"],
  ["@litsx/babel-plugin-shared-hooks", "packages/babel-plugin-shared-hooks"],
  ["@litsx/typescript-session", "packages/typescript-session"],
]);

export function readPackageManifest(packageDir) {
  return JSON.parse(fs.readFileSync(path.join(repoRoot, packageDir, "package.json"), "utf8"));
}

export function readPackageVersion(packageName) {
  const packageDir = packageDirsByName.get(packageName);
  if (!packageDir) {
    throw new Error(`unknown package name: ${packageName}`);
  }
  return readPackageManifest(packageDir).version;
}

export function createCaretVersionMap(packageNames) {
  return Object.fromEntries(
    packageNames.map((packageName) => [packageName, `^${readPackageVersion(packageName)}`]),
  );
}
