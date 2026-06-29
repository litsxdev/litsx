import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const snapshotTag = process.env.LITSX_SNAPSHOT_TAG || process.argv[2] || "canary";

function listChangelogPaths(rootDir) {
  const packageRoot = path.join(rootDir, "packages");
  return fs.readdirSync(packageRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(packageRoot, entry.name, "CHANGELOG.md"))
    .filter((filePath) => fs.existsSync(filePath));
}

const changelogBackups = new Map();
for (const changelogPath of listChangelogPaths(repoRoot)) {
  changelogBackups.set(changelogPath, fs.readFileSync(changelogPath, "utf8"));
}

try {
  execFileSync("./node_modules/.bin/changeset", ["version", "--snapshot", snapshotTag], {
    cwd: repoRoot,
    stdio: "inherit",
  });

  execFileSync("node", ["scripts/release/sync-scaffold-package-versions.js"], {
    cwd: repoRoot,
    stdio: "inherit",
  });

  execFileSync("node", ["scripts/release/sync-public-package-dependencies.js"], {
    cwd: repoRoot,
    stdio: "inherit",
  });
} finally {
  for (const [changelogPath, originalContents] of changelogBackups.entries()) {
    fs.writeFileSync(changelogPath, originalContents);
  }
}
