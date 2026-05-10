import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import semver from "semver";
import { fileURLToPath } from "node:url";
import {
  packageDirsByName,
  readPackageManifest,
  readPackageVersion,
} from "./package-version-map.js";
import { npmReleasePackages } from "./release-packages.js";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const dependencyFields = ["dependencies", "devDependencies", "optionalDependencies", "peerDependencies"];
const changePlanDir = fs.mkdtempSync(path.join(os.tmpdir(), "litsx-changeset-status-"));
const changePlanPath = path.join(changePlanDir, "status.json");

function fail(message) {
  console.error(`internal dependency range check failed: ${message}`);
  process.exitCode = 1;
}

function loadReleasePlan() {
  execFileSync("./node_modules/.bin/changeset", ["status", `--output=${changePlanPath}`], {
    cwd: repoRoot,
    stdio: "ignore",
  });

  if (!fs.existsSync(changePlanPath)) {
    return new Map();
  }

  const plan = JSON.parse(fs.readFileSync(changePlanPath, "utf8"));
  const releases = Array.isArray(plan?.releases) ? plan.releases : [];
  return new Map(releases.map((entry) => [entry.name, entry]));
}

function validateDependencyRange(packageName, field, dependencyName, versionRange, releasePlan) {
  if (!packageDirsByName.has(dependencyName)) {
    return;
  }

  if (typeof versionRange !== "string" || versionRange.startsWith("workspace:")) {
    return;
  }

  const currentVersion = readPackageVersion(dependencyName);
  if (semver.validRange(versionRange) && semver.satisfies(currentVersion, versionRange, { includePrerelease: true })) {
    return;
  }

  const plannedRelease = releasePlan.get(dependencyName);
  const plannedVersion = plannedRelease?.newVersion;

  if (
    plannedVersion &&
    semver.validRange(versionRange) &&
    semver.satisfies(plannedVersion, versionRange, { includePrerelease: true })
  ) {
    fail(
      `${packageName} ${field}.${dependencyName}=${versionRange} expects a future internal version (${plannedVersion}) ` +
      `while the workspace still provides ${currentVersion}. Keep the current satisfiable range until changeset version rewrites it.`
    );
    return;
  }

  fail(
    `${packageName} ${field}.${dependencyName}=${versionRange} does not satisfy the current workspace version ${currentVersion}.`
  );
}

try {
  const releasePlan = loadReleasePlan();

  for (const packageDir of npmReleasePackages) {
    const manifest = readPackageManifest(packageDir);

    for (const field of dependencyFields) {
      const dependencies = manifest[field];
      if (!dependencies) continue;

      for (const [dependencyName, versionRange] of Object.entries(dependencies)) {
        validateDependencyRange(manifest.name, field, dependencyName, versionRange, releasePlan);
      }
    }
  }
} finally {
  fs.rmSync(changePlanDir, { recursive: true, force: true });
}

if (process.exitCode) {
  process.exit(process.exitCode);
}

console.log("internal dependency ranges are locally installable");
