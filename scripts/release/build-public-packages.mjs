import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { npmReleasePackages, vscodeReleasePackage } from "./release-packages.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

function readManifest(packageDir) {
  return JSON.parse(fs.readFileSync(path.join(repoRoot, packageDir, "package.json"), "utf8"));
}

for (const packageDir of [...npmReleasePackages, vscodeReleasePackage]) {
  const manifest = readManifest(packageDir);
  if (!manifest.scripts?.build) {
    continue;
  }

  console.log(`building ${manifest.name}`);
  execFileSync("yarn", ["workspace", manifest.name, "build"], {
    cwd: repoRoot,
    stdio: "inherit",
    env: process.env,
  });
}
