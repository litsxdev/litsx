import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
);
const preStatePath = path.join(repoRoot, ".changeset", "pre.json");

if (!fs.existsSync(preStatePath)) {
  execFileSync("./node_modules/.bin/changeset", ["pre", "enter", "next"], {
    cwd: repoRoot,
    stdio: "inherit",
  });
} else {
  const preState = JSON.parse(fs.readFileSync(preStatePath, "utf8"));
  if (preState.mode !== "pre" || preState.tag !== "next") {
    throw new Error(
      `Expected an active next prerelease in .changeset/pre.json, received mode=${preState.mode} tag=${preState.tag}`,
    );
  }
}

execFileSync("./node_modules/.bin/changeset", ["version"], {
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
