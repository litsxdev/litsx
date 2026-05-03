import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readPackageVersion, packageDirsByName } from "./package-version-map.mjs";
import { npmReleasePackages } from "./release-packages.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const dependencyFields = ["dependencies", "devDependencies", "optionalDependencies", "peerDependencies"];

function syncDependencyBlock(manifest) {
  let changed = false;

  for (const field of dependencyFields) {
    const dependencies = manifest[field];
    if (!dependencies) continue;

    for (const [packageName, versionRange] of Object.entries(dependencies)) {
      if (!String(versionRange).startsWith("workspace:")) {
        continue;
      }

      if (!packageDirsByName.has(packageName)) {
        continue;
      }

      dependencies[packageName] = `^${readPackageVersion(packageName)}`;
      changed = true;
    }
  }

  return changed;
}

for (const packageDir of npmReleasePackages) {
  const manifestPath = path.join(repoRoot, packageDir, "package.json");
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));

  if (!syncDependencyBlock(manifest)) {
    continue;
  }

  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
}

console.log("synced public package dependency versions");
