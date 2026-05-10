import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const sourcePath = path.join(repoRoot, "scripts/hooks/pre-push");
const targetPath = path.join(repoRoot, ".git/hooks/pre-push");

fs.mkdirSync(path.dirname(targetPath), { recursive: true });
fs.copyFileSync(sourcePath, targetPath);
fs.chmodSync(targetPath, 0o755);

console.log(`installed pre-push hook at ${targetPath}`);
