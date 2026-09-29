import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const hooks = ["commit-msg", "pre-push"];

for (const hookName of hooks) {
  const sourcePath = path.join(repoRoot, "scripts/hooks", hookName);
  const targetPath = path.join(repoRoot, ".git/hooks", hookName);

  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  fs.copyFileSync(sourcePath, targetPath);
  fs.chmodSync(targetPath, 0o755);

  console.log(`installed ${hookName} hook at ${targetPath}`);
}
