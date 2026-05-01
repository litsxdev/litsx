import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

execFileSync("./node_modules/.bin/changeset", ["version"], {
  cwd: repoRoot,
  stdio: "inherit",
});

execFileSync("node", ["scripts/release/sync-scaffold-package-versions.mjs"], {
  cwd: repoRoot,
  stdio: "inherit",
});
