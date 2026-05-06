import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { npmReleasePackages } from "./release-packages.js";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const artifactsRoot = path.join(repoRoot, ".release-artifacts");
const npmArtifactsRoot = path.join(artifactsRoot, "npm");

fs.rmSync(artifactsRoot, { recursive: true, force: true });
fs.mkdirSync(npmArtifactsRoot, { recursive: true });

const npmCacheDir = fs.mkdtempSync(path.join(os.tmpdir(), "litsx-npm-pack-cache-"));

for (const packageDir of npmReleasePackages) {
  const output = execFileSync(
    "npm",
    ["pack", "--pack-destination", npmArtifactsRoot],
    {
      cwd: path.join(repoRoot, packageDir),
      encoding: "utf8",
      env: {
        ...process.env,
        npm_config_cache: npmCacheDir,
      },
      stdio: ["ignore", "pipe", "inherit"],
    },
  ).trim();

  console.log(`${packageDir}: ${output}`);
}

console.log(`release artifacts written to ${npmArtifactsRoot}`);
