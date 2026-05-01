import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

export const packageDirsByName = new Map([
  ["litsx", "packages/litsx"],
  ["@litsx/compiler", "packages/compiler"],
  ["@litsx/vite-plugin", "packages/vite-plugin"],
  ["@litsx/typescript-plugin", "packages/typescript-plugin-litsx"],
  ["@litsx/eslint-plugin", "packages/eslint-plugin-litsx"],
  ["create-litsx-app", "packages/create-litsx-app"],
  ["prettier-plugin-litsx", "packages/prettier-plugin-litsx"],
  ["@litsx/playground", "packages/litsx-playground"],
  ["@litsx/light-dom-registry", "packages/light-dom-registry"],
  ["@litsx/babel-parser", "packages/babel-parser-litsx"],
  ["@litsx/jsx-authoring", "packages/jsx-authoring"],
  ["@litsx/prop-types", "packages/prop-types"],
  ["@litsx/babel-preset-litsx", "packages/babel-preset-litsx"],
  ["@litsx/babel-preset-react-compat", "packages/babel-preset-react-compat"],
  ["@litsx/babel-plugin-transform-jsx-html-template", "packages/babel-plugin-transform-jsx-html-template"],
  ["@litsx/babel-plugin-transform-litsx-scoped-elements", "packages/babel-plugin-transform-litsx-scoped-elements"],
  ["@litsx/babel-plugin-litsx-proptypes", "packages/babel-plugin-litsx-proptypes"],
  ["@litsx/babel-plugin-shared-hooks", "packages/babel-plugin-shared-hooks"],
  ["vscode-litsx", "packages/vscode-litsx"],
  ["@litsx/vitepress", "packages/vitepress"],
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
