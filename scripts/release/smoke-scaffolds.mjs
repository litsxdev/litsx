import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createProject } from "../../packages/create-litsx-app/src/index.js";
import { RELEASE_VERSION } from "./release-packages.mjs";

const templates = ["app", "component", "design-system"];
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "litsx-release-scaffold-"));

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
  assert(manifest.dependencies?.litsx === `^${RELEASE_VERSION}`, `${template} scaffold should depend on litsx ^${RELEASE_VERSION}`);
  assert(manifest.devDependencies?.["@litsx/typescript-plugin"] === `^${RELEASE_VERSION}`, `${template} scaffold should depend on @litsx/typescript-plugin ^${RELEASE_VERSION}`);
  assert(manifest.devDependencies?.["prettier-plugin-litsx"] === `^${RELEASE_VERSION}`, `${template} scaffold should depend on prettier-plugin-litsx ^${RELEASE_VERSION}`);
  assert(fs.existsSync(path.join(targetDir, "prettier.config.js")), `${template} scaffold is missing prettier.config.js`);
  assert(fs.existsSync(path.join(targetDir, "eslint.config.js")), `${template} scaffold is missing eslint.config.js`);
  assert(fs.existsSync(path.join(targetDir, "jsconfig.json")), `${template} scaffold is missing jsconfig.json`);
}

console.log(`scaffold smoke passed in ${tempRoot}`);
