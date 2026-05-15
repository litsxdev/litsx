import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createProject } from "../../packages/create-litsx-app/src/index.js";
import { createCaretVersionMap } from "./package-version-map.js";

const templates = ["app", "component", "design-system"];
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "litsx-release-scaffold-"));
const expectedVersions = createCaretVersionMap([
  "@litsx/core",
  "@litsx/typescript",
  "prettier-plugin-litsx",
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
  assert(manifest.devDependencies?.["@litsx/typescript"] === expectedVersions["@litsx/typescript"], `${template} scaffold should depend on @litsx/typescript ${expectedVersions["@litsx/typescript"]}`);
  assert(manifest.devDependencies?.["prettier-plugin-litsx"] === expectedVersions["prettier-plugin-litsx"], `${template} scaffold should depend on prettier-plugin-litsx ${expectedVersions["prettier-plugin-litsx"]}`);
  assert(fs.existsSync(path.join(targetDir, "prettier.config.js")), `${template} scaffold is missing prettier.config.js`);
  assert(fs.existsSync(path.join(targetDir, "eslint.config.js")), `${template} scaffold is missing eslint.config.js`);
  assert(fs.existsSync(path.join(targetDir, "jsconfig.json")), `${template} scaffold is missing jsconfig.json`);
}

console.log(`scaffold smoke passed in ${tempRoot}`);
