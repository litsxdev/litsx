import assert from "assert";
import { execFileSync } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, describe, it } from "vitest";

import { createReleaseManifest, stageReleasePackage } from "../scripts/release/release-manifest.js";

const tempDirs = [];

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

afterEach(() => {
  while (tempDirs.length > 0) {
    fs.rmSync(tempDirs.pop(), { recursive: true, force: true });
  }
});

describe("release manifest staging", () => {
  it("rewrites release manifests to existing dist targets", () => {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "litsx-release-manifest-cases-"));
    const esmPackageRoot = path.join(rootDir, "packages", "esm");
    const cjsPackageRoot = path.join(rootDir, "packages", "cjs");
    tempDirs.push(rootDir);

    fs.mkdirSync(path.join(esmPackageRoot, "dist"), { recursive: true });
    fs.writeFileSync(path.join(esmPackageRoot, "dist", "index.js"), "export const value = true;\n");
    fs.writeFileSync(path.join(esmPackageRoot, "dist", "index.cjs"), "exports.value = true;\n");
    fs.writeFileSync(path.join(esmPackageRoot, "dist", "index.d.ts"), "export declare const value: true;\n");

    const esmManifest = createReleaseManifest({
      name: "@litsx/esm-demo",
      module: "./src/index.js",
      types: "./src/index.d.ts",
      exports: {
        ".": {
          import: "./src/index.js",
          require: "./dist/index.cjs",
          types: "./src/index.d.ts",
          default: "./src/index.js",
        },
      },
      files: ["dist", "src", "README.md"],
    }, { packageRoot: esmPackageRoot });

    assert.strictEqual(esmManifest.module, "./dist/index.js");
    assert.strictEqual(esmManifest.types, "./dist/index.d.ts");
    assert.strictEqual(esmManifest.exports["."].import, "./dist/index.js");
    assert.strictEqual(esmManifest.exports["."].default, "./dist/index.js");
    assert.strictEqual(esmManifest.exports["."].types, "./dist/index.d.ts");
    assert.ok(!esmManifest.files.includes("src"));

    fs.mkdirSync(path.join(cjsPackageRoot, "dist"), { recursive: true });
    fs.writeFileSync(path.join(cjsPackageRoot, "dist", "index.cjs"), "exports.value = true;\n");
    fs.writeFileSync(path.join(cjsPackageRoot, "dist", "typecheck.cjs"), "exports.value = true;\n");
    fs.writeFileSync(path.join(cjsPackageRoot, "tsserver-plugin.cjs"), "module.exports = {};\n");

    const cjsManifest = createReleaseManifest({
      name: "@litsx/cjs-demo",
      main: "./tsserver-plugin.cjs",
      module: "./src/index.js",
      exports: {
        ".": {
          require: "./tsserver-plugin.cjs",
          import: "./src/index.js",
          default: "./src/index.js",
        },
        "./typecheck": {
          require: "./dist/typecheck.cjs",
          import: "./src/typecheck.js",
          default: "./src/typecheck.js",
        },
      },
      files: ["dist", "src", "tsserver-plugin.cjs"],
    }, { packageRoot: cjsPackageRoot });

    assert.strictEqual(cjsManifest.module, "./tsserver-plugin.cjs");
    assert.strictEqual(cjsManifest.exports["."].import, "./tsserver-plugin.cjs");
    assert.strictEqual(cjsManifest.exports["."].default, "./tsserver-plugin.cjs");
    assert.strictEqual(cjsManifest.exports["./typecheck"].import, "./dist/typecheck.cjs");
    assert.strictEqual(cjsManifest.exports["./typecheck"].default, "./dist/typecheck.cjs");
    assert.ok(!cjsManifest.files.includes("src"));

    for (const manifest of [esmManifest, cjsManifest]) {
      for (const target of normalizeExportTargets(manifest.exports)) {
        assert.ok(typeof target !== "string" || !target.startsWith("./src/"));
      }
    }
  });

  it("stages a release package with rewritten manifest targets and packable files", () => {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "litsx-release-manifest-root-"));
    const packageRoot = path.join(rootDir, "packages", "demo");
    const stagingRoot = path.join(rootDir, "staging");
    tempDirs.push(rootDir);

    fs.mkdirSync(path.join(packageRoot, "src"), { recursive: true });
    fs.mkdirSync(path.join(packageRoot, "dist"), { recursive: true });
    fs.writeFileSync(
      path.join(packageRoot, "package.json"),
      `${JSON.stringify({
        name: "@litsx/demo",
        version: "0.1.0",
        license: "Apache-2.0",
        homepage: "https://litsx.dev/",
        bugs: { url: "https://github.com/litsxdev/litsx/issues" },
        repository: {
          type: "git",
          url: "https://github.com/litsxdev/litsx.git",
          directory: "packages/demo",
        },
        main: "./dist/index.cjs",
        module: "./src/index.js",
        types: "./src/index.d.ts",
        exports: {
          ".": {
            import: "./src/index.js",
            require: "./dist/index.cjs",
            types: "./src/index.d.ts",
            default: "./src/index.js",
          },
        },
        bin: {
          demo: "./dist/cli.js",
        },
        files: ["dist", "src", "README.md", "NOTICE.txt"],
        scripts: {
          build: "rollup -c",
          prepack: "yarn build",
        },
      }, null, 2)}\n`,
    );
    fs.writeFileSync(path.join(packageRoot, "src", "index.js"), "export const src = true;\n");
    fs.writeFileSync(path.join(packageRoot, "src", "index.d.ts"), "export declare const src: true;\n");
    fs.writeFileSync(path.join(packageRoot, "dist", "index.js"), "export const dist = true;\n");
    fs.writeFileSync(path.join(packageRoot, "dist", "index.cjs"), "exports.dist = true;\n");
    fs.writeFileSync(path.join(packageRoot, "dist", "index.d.ts"), "export declare const dist: true;\n");
    fs.writeFileSync(path.join(packageRoot, "dist", "cli.js"), "#!/usr/bin/env node\n");
    fs.writeFileSync(path.join(packageRoot, "README.md"), "# demo\n");
    fs.writeFileSync(path.join(packageRoot, "NOTICE.txt"), "notice\n");

    const { releaseManifest, stagingDir } = stageReleasePackage({
      packageDir: "packages/demo",
      packageRoot,
      stagingRoot,
    });

    assert.strictEqual(releaseManifest.module, "./dist/index.js");
    assert.strictEqual(releaseManifest.types, "./dist/index.d.ts");
    assert.ok(!releaseManifest.files.includes("src"));
    assert.ok(!releaseManifest.scripts?.prepack);
    assert.ok(fs.existsSync(path.join(stagingDir, "dist", "index.js")));
    assert.ok(fs.existsSync(path.join(stagingDir, "dist", "index.cjs")));
    assert.ok(fs.existsSync(path.join(stagingDir, "dist", "index.d.ts")));
    assert.ok(fs.existsSync(path.join(stagingDir, "dist", "cli.js")));
    assert.ok(fs.existsSync(path.join(stagingDir, "README.md")));
    assert.ok(fs.existsSync(path.join(stagingDir, "NOTICE.txt")));
    assert.ok(!fs.existsSync(path.join(stagingDir, "src")));

    const npmCacheDir = fs.mkdtempSync(path.join(os.tmpdir(), "litsx-release-manifest-npm-cache-"));
    tempDirs.push(npmCacheDir);
    const packed = JSON.parse(execFileSync("npm", ["pack", "--json", "--dry-run"], {
      cwd: stagingDir,
      encoding: "utf8",
      env: {
        ...process.env,
        npm_config_cache: npmCacheDir,
      },
      stdio: "pipe",
    }))[0];
    const packedFiles = new Set(packed.files.map((entry) => entry.path));

    assert.ok(packedFiles.has("dist/index.js"));
    assert.ok(packedFiles.has("dist/index.cjs"));
    assert.ok(packedFiles.has("dist/index.d.ts"));
    assert.ok(packedFiles.has("dist/cli.js"));
    assert.ok(packedFiles.has("README.md"));
    assert.ok(!packedFiles.has("src/index.js"));
  });
});
