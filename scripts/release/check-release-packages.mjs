import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { excludedPrivatePackages, npmReleasePackages, vscodeReleasePackage } from "./release-packages.mjs";

const repoRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..", "..");

function fail(message) {
  console.error(`release check failed: ${message}`);
  process.exitCode = 1;
}

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(repoRoot, relativePath), "utf8"));
}

function fileExists(relativePath) {
  return fs.existsSync(path.join(repoRoot, relativePath));
}

function normalizeExportTargets(value, results = new Set()) {
  if (!value) return results;
  if (typeof value === "string") {
    results.add(value);
    return results;
  }
  if (Array.isArray(value)) {
    for (const entry of value) normalizeExportTargets(entry, results);
    return results;
  }
  if (typeof value === "object") {
    for (const entry of Object.values(value)) normalizeExportTargets(entry, results);
  }
  return results;
}

function assertCommonManifestFields(packageDir, manifest) {
  const requiredFields = ["name", "version", "license", "homepage", "bugs", "repository"];
  for (const field of requiredFields) {
    if (!(field in manifest)) {
      fail(`${packageDir} is missing ${field}`);
    }
  }
  if (typeof manifest.version !== "string" || manifest.version.length === 0) {
    fail(`${packageDir} must declare a non-empty version`);
  }
  if (!manifest.repository?.directory) {
    fail(`${packageDir} repository.directory is missing`);
  }
  if (manifest.repository?.directory && manifest.repository.directory !== packageDir) {
    fail(`${packageDir} repository.directory is ${manifest.repository.directory}`);
  }
}

function assertFileList(packageDir, manifest) {
  if (!Array.isArray(manifest.files) || manifest.files.length === 0) {
    fail(`${packageDir} must declare a non-empty files list`);
    return;
  }
  for (const entry of manifest.files) {
    if (!fileExists(path.join(packageDir, entry))) {
      fail(`${packageDir} files entry does not exist: ${entry}`);
    }
  }

  const hasReadmeOnDisk = fileExists(path.join(packageDir, "README.md"));
  const filesSet = new Set(manifest.files);
  if (hasReadmeOnDisk && !filesSet.has("README.md")) {
    fail(`${packageDir} has a README.md but does not include it in files`);
  }
}

function assertEntrypoints(packageDir, manifest) {
  for (const field of ["main", "module", "types"]) {
    if (manifest[field] && !fileExists(path.join(packageDir, manifest[field]))) {
      fail(`${packageDir} ${field} target does not exist: ${manifest[field]}`);
    }
  }

  if (manifest.exports) {
    for (const target of normalizeExportTargets(manifest.exports)) {
      if (target.includes("*")) continue;
      if (!fileExists(path.join(packageDir, target))) {
        fail(`${packageDir} exports target does not exist: ${target}`);
      }
    }
  }

  if (manifest.bin) {
    if (typeof manifest.bin === "string") {
      if (!fileExists(path.join(packageDir, manifest.bin))) {
        fail(`${packageDir} bin target does not exist: ${manifest.bin}`);
      }
    } else {
      for (const target of Object.values(manifest.bin)) {
        if (!fileExists(path.join(packageDir, target))) {
          fail(`${packageDir} bin target does not exist: ${target}`);
        }
      }
    }
  }
}

function assertPackOutput(packageDir) {
  const npmCacheDir = fs.mkdtempSync(path.join(os.tmpdir(), "litsx-npm-pack-cache-"));
  const output = execFileSync(
    "npm",
    ["pack", "--json", "--dry-run"],
    {
      cwd: path.join(repoRoot, packageDir),
      encoding: "utf8",
      env: {
        ...process.env,
        npm_config_cache: npmCacheDir,
      },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  const jsonStartMatch = output.match(/\[\s*\{/);
  if (!jsonStartMatch || jsonStartMatch.index == null) {
    fail(`${packageDir} npm pack dry-run did not emit JSON output`);
    return;
  }
  const pack = JSON.parse(output.slice(jsonStartMatch.index))[0];
  if (!Array.isArray(pack.files) || pack.files.length === 0) {
    fail(`${packageDir} npm pack dry-run returned no files`);
  }
}

for (const packageDir of npmReleasePackages) {
  const manifest = readJson(path.join(packageDir, "package.json"));
  if (manifest.private === true) {
    fail(`${packageDir} is still private`);
  }
  assertCommonManifestFields(packageDir, manifest);
  assertFileList(packageDir, manifest);
  assertEntrypoints(packageDir, manifest);
  assertPackOutput(packageDir);
}

for (const packageDir of excludedPrivatePackages) {
  const manifest = readJson(path.join(packageDir, "package.json"));
  if (manifest.private !== true) {
    fail(`${packageDir} should remain private and outside npm publication`);
  }
}

const prettierManifest = readJson("packages/prettier-plugin-litsx/package.json");
if (!prettierManifest.peerDependencies?.prettier) {
  fail("packages/prettier-plugin-litsx must keep prettier as a peer dependency");
}
if (prettierManifest.dependencies?.prettier) {
  fail("packages/prettier-plugin-litsx must not depend on prettier directly");
}

const tsPluginManifest = readJson("packages/typescript-plugin-litsx/package.json");
if (!tsPluginManifest.bin?.["litsx-tsc"]) {
  fail("packages/typescript-plugin-litsx must expose litsx-tsc");
}

const vscodeManifest = readJson(path.join(vscodeReleasePackage, "package.json"));
if (vscodeManifest.private !== true) {
  fail("packages/vscode-litsx must remain private and outside npm publication");
}
assertCommonManifestFields(vscodeReleasePackage, vscodeManifest);
assertEntrypoints(vscodeReleasePackage, vscodeManifest);
if (!vscodeManifest.publisher) {
  fail("packages/vscode-litsx is missing publisher");
}
if (vscodeManifest.icon && !fileExists(path.join(vscodeReleasePackage, vscodeManifest.icon))) {
  fail(`packages/vscode-litsx icon does not exist: ${vscodeManifest.icon}`);
}
for (const requiredFile of ["dist", "syntaxes", "icon.png", "LICENSE", "README.md", "package.json"]) {
  if (!fileExists(path.join(vscodeReleasePackage, requiredFile))) {
    fail(`packages/vscode-litsx is missing required packaged file: ${requiredFile}`);
  }
}
if (!fileExists(path.join(vscodeReleasePackage, "LICENSE"))) {
  fail("packages/vscode-litsx is missing a package-local LICENSE file");
}
if (!fileExists(path.join(vscodeReleasePackage, ".vscodeignore"))) {
  fail("packages/vscode-litsx is missing .vscodeignore");
}

const vscodeReadme = fs.readFileSync(path.join(repoRoot, "packages/vscode-litsx/README.md"), "utf8");
for (const snippet of [".litsx", ".litsx.jsx", "tsx", "jsx", "does not replace the full JavaScript or TypeScript language services"]) {
  if (!vscodeReadme.includes(snippet)) {
    fail(`packages/vscode-litsx/README.md is missing expected release wording: ${snippet}`);
  }
}

const prettierReadme = fs.readFileSync(path.join(repoRoot, "packages/prettier-plugin-litsx/README.md"), "utf8");
if (!prettierReadme.includes("It does **not** claim plain `*.tsx` or `*.jsx` formatting.")) {
  fail("packages/prettier-plugin-litsx/README.md must keep the tsx/jsx limitation explicit");
}

if (process.exitCode) {
  process.exit(process.exitCode);
}

console.log("release package checks passed");
