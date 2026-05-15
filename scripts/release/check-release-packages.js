import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { excludedPrivatePackages, npmReleasePackages } from "./release-packages.js";

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

  if (packageDir === "packages/create-litsx-app") {
    const packagedFiles = new Set(pack.files.map((entry) => entry.path));
    if (!packagedFiles.has("dist/assets/flame_512.png")) {
      fail("packages/create-litsx-app npm pack output is missing dist/assets/flame_512.png");
    }
  }
}

function assertNoWorkspaceProtocols(packageDir, manifest) {
  for (const field of ["dependencies", "devDependencies", "optionalDependencies", "peerDependencies"]) {
    const dependencies = manifest[field];
    if (!dependencies) continue;

    for (const [packageName, versionRange] of Object.entries(dependencies)) {
      if (typeof versionRange === "string" && versionRange.startsWith("workspace:")) {
        fail(`${packageDir} must not publish workspace protocol dependency ${packageName}: ${versionRange}`);
      }
    }
  }
}

for (const packageDir of npmReleasePackages) {
  const manifest = readJson(path.join(packageDir, "package.json"));
  if (manifest.private === true) {
    fail(`${packageDir} is still private`);
  }
  assertCommonManifestFields(packageDir, manifest);
  assertNoWorkspaceProtocols(packageDir, manifest);
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

const tsManifest = readJson("packages/typescript/package.json");
if (!tsManifest.bin?.["litsx-tsc"]) {
  fail("packages/typescript must expose litsx-tsc");
}

const prettierReadme = fs.readFileSync(path.join(repoRoot, "packages/prettier-plugin-litsx/README.md"), "utf8");
if (!prettierReadme.includes("It does **not** claim plain `*.tsx` or `*.jsx` formatting.")) {
  fail("packages/prettier-plugin-litsx/README.md must keep the tsx/jsx limitation explicit");
}

if (process.exitCode) {
  process.exit(process.exitCode);
}

console.log("release package checks passed");
