import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { npmReleasePackages } from "./release-packages.js";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const generatedPaths = [
  ...npmReleasePackages.map((packageDir) => `${packageDir}/dist`),
  "packages/create-litsx-app/src/published-package-versions.js",
];

function runGitStatus(pathspecs) {
  return execFileSync(
    "git",
    ["status", "--porcelain", "--", ...pathspecs],
    {
      cwd: repoRoot,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "inherit"],
    },
  )
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

const dirtyEntries = runGitStatus(generatedPaths);

if (dirtyEntries.length > 0) {
  console.error("release check failed: generated artifacts are out of date");
  for (const entry of dirtyEntries) {
    console.error(`  ${entry}`);
  }
  console.error("run the relevant package build(s) and commit the regenerated artifacts");
  process.exit(1);
}

console.log("generated artifact check passed");
