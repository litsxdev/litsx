import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { npmReleasePackages } from "./release-packages.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

function readJsonAtGitRef(ref, filePath) {
  const content = execFileSync("git", ["show", `${ref}:${filePath}`], {
    cwd: repoRoot,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  });
  return JSON.parse(content);
}

function readCurrentJson(filePath) {
  return JSON.parse(fs.readFileSync(path.join(repoRoot, filePath), "utf8"));
}

function tagExists(tagName) {
  try {
    execFileSync("git", ["rev-parse", "-q", "--verify", `refs/tags/${tagName}`], {
      cwd: repoRoot,
      stdio: "ignore",
    });
    return true;
  } catch {
    return false;
  }
}

function getVersionChanges() {
  const changes = [];

  for (const packageDir of npmReleasePackages) {
    const packageJsonPath = `${packageDir}/package.json`;
    const currentPackage = readCurrentJson(packageJsonPath);
    const previousPackage = readJsonAtGitRef("HEAD^", packageJsonPath);

    if (currentPackage.version === previousPackage.version) {
      continue;
    }

    changes.push({
      name: currentPackage.name,
      version: currentPackage.version,
    });
  }

  return changes;
}

const changes = getVersionChanges();

for (const { name, version } of changes) {
  const tagName = `${name}@${version}`;
  if (tagExists(tagName)) {
    continue;
  }

  execFileSync("git", ["tag", "-a", tagName, "-m", tagName], {
    cwd: repoRoot,
    stdio: "inherit",
  });

  console.log(tagName);
}
