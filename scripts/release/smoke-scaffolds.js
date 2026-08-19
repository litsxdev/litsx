import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createProject } from "../../packages/create-litsx-app/src/index.js";
import { createCaretVersionMap } from "./package-version-map.js";

const templates = ["app", "component", "design-system"];
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "litsx-release-scaffold-"));
const expectedVersions = createCaretVersionMap([
  "@litsx/core",
]);

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

for (const template of templates) {
  const targetDir = path.join(tempRoot, template);
  createProject(targetDir, { template, localWorkspacePackages: false });

  const manifest = JSON.parse(fs.readFileSync(path.join(targetDir, "package.json"), "utf8"));
  assert(manifest.scripts?.dev, `${template} scaffold is missing dev script`);
  assert(manifest.scripts?.build, `${template} scaffold is missing build script`);
  assert(manifest.scripts?.lint, `${template} scaffold is missing lint script`);
  assert(manifest.scripts?.format, `${template} scaffold is missing format script`);
  assert(manifest.scripts?.typecheck, `${template} scaffold is missing typecheck script`);
  assert(
    manifest.dependencies?.["@litsx/core"] === expectedVersions["@litsx/core"],
    `${template} scaffold should depend on @litsx/core ${expectedVersions["@litsx/core"]}`,
  );
  assert(!fs.existsSync(path.join(targetDir, "prettier.config.js")), `${template} scaffold should use standard Prettier defaults`);
  assert(fs.existsSync(path.join(targetDir, "eslint.config.js")), `${template} scaffold is missing eslint.config.js`);
  assert(fs.existsSync(path.join(targetDir, "tsconfig.json")), `${template} scaffold is missing tsconfig.json`);
}

console.log(`scaffold smoke passed in ${tempRoot}`);
