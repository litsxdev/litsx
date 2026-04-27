import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

import { createProject } from "../../packages/create-litsx-app/src/index.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "../..");
const targetDir = path.join(rootDir, "packages", "dx-smoke-app");

if (fs.existsSync(targetDir)) {
  const entries = fs.readdirSync(targetDir);
  if (entries.length > 0) {
    console.error(`Smoke app already exists at ${targetDir}`);
    process.exit(1);
  }
}

const result = createProject(targetDir, {
  template: "app",
  localWorkspacePackages: true,
});

console.log(`Created workspace smoke app at ${result.targetDir}`);
console.log("");
console.log("Try:");
console.log("  yarn workspace dx-smoke-app dev");
console.log("  yarn workspace dx-smoke-app lint");
console.log("  yarn workspace dx-smoke-app typecheck");
