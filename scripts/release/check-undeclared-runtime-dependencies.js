import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as babelParser from "@babel/parser";
import { npmReleasePackages } from "./release-packages.js";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

const BUILTIN_MODULES = new Set([
  "assert",
  "buffer",
  "child_process",
  "crypto",
  "events",
  "fs",
  "fs/promises",
  "module",
  "os",
  "path",
  "path/posix",
  "stream",
  "timers",
  "tty",
  "url",
  "util",
  "zlib",
]);

function fail(message) {
  console.error(`undeclared runtime dependency check failed: ${message}`);
  process.exitCode = 1;
}

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(repoRoot, relativePath), "utf8"));
}

function walkFiles(directory, results = []) {
  if (!fs.existsSync(directory)) {
    return results;
  }

  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (entry.name === "dist" || entry.name === "node_modules" || entry.name.startsWith(".")) {
      continue;
    }

    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      walkFiles(fullPath, results);
      continue;
    }

    if (/\.(?:js|mjs|cjs)$/.test(entry.name)) {
      results.push(fullPath);
    }
  }

  return results;
}

function normalizeDependencySpecifier(specifier) {
  if (
    !specifier ||
    specifier.startsWith(".") ||
    specifier.startsWith("/") ||
    specifier.startsWith("data:")
  ) {
    return null;
  }

  if (specifier.startsWith("node:")) {
    return null;
  }

  if (BUILTIN_MODULES.has(specifier)) {
    return null;
  }

  if (specifier.startsWith("@")) {
    const [scope, name] = specifier.split("/");
    return scope && name ? `${scope}/${name}` : specifier;
  }

  return specifier.split("/")[0];
}

function parseFile(filePath) {
  return babelParser.parse(fs.readFileSync(filePath, "utf8"), {
    sourceType: "unambiguous",
    plugins: [
      "jsx",
      "importAssertions",
      "importAttributes",
      "dynamicImport",
      "topLevelAwait",
    ],
  });
}

function addSpecifier(specifiers, value) {
  const normalized = normalizeDependencySpecifier(value);
  if (normalized) {
    specifiers.add(normalized);
  }
}

function collectImportSpecifiers(node, specifiers) {
  if (!node || typeof node !== "object") {
    return;
  }

  if (Array.isArray(node)) {
    for (const item of node) {
      collectImportSpecifiers(item, specifiers);
    }
    return;
  }

  if (
    (node.type === "ImportDeclaration" ||
      node.type === "ExportNamedDeclaration" ||
      node.type === "ExportAllDeclaration") &&
    node.source?.value
  ) {
    addSpecifier(specifiers, node.source.value);
  }

  if (
    node.type === "CallExpression" &&
    node.callee?.type === "Identifier" &&
    node.callee.name === "require" &&
    node.arguments?.length > 0 &&
    node.arguments[0]?.type === "StringLiteral"
  ) {
    addSpecifier(specifiers, node.arguments[0].value);
  }

  if (
    node.type === "ImportExpression" &&
    node.source?.type === "StringLiteral"
  ) {
    addSpecifier(specifiers, node.source.value);
  }

  for (const value of Object.values(node)) {
    if (value && typeof value === "object") {
      collectImportSpecifiers(value, specifiers);
    }
  }
}

function getPublishedSourceFiles(packageDir) {
  const files = walkFiles(path.join(repoRoot, packageDir, "src"));
  const tsserverPlugin = path.join(repoRoot, packageDir, "tsserver-plugin.cjs");
  if (fs.existsSync(tsserverPlugin)) {
    files.push(tsserverPlugin);
  }
  return files;
}

for (const packageDir of npmReleasePackages) {
  const manifest = readJson(path.join(packageDir, "package.json"));
  const declaredDependencies = new Set([
    ...Object.keys(manifest.dependencies || {}),
    ...Object.keys(manifest.peerDependencies || {}),
    ...Object.keys(manifest.optionalDependencies || {}),
    manifest.name,
  ]);

  const importedDependencies = new Set();
  for (const filePath of getPublishedSourceFiles(packageDir)) {
    const ast = parseFile(filePath);
    collectImportSpecifiers(ast.program, importedDependencies);
  }

  const missingDependencies = [...importedDependencies].filter(
    (dependencyName) => !declaredDependencies.has(dependencyName),
  );

  if (missingDependencies.length > 0) {
    fail(`${packageDir} imports undeclared runtime dependencies: ${missingDependencies.join(", ")}`);
  }
}

if (process.exitCode) {
  process.exit(process.exitCode);
}

console.log("undeclared runtime dependency checks passed");
