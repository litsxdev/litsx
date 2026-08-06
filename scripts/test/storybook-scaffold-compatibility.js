import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { createProject } from "../../packages/create-litsx-app/src/index.js";

const supportedVersions = ["10.4.6", "10.5.6"];
const requestedVersions = process.argv.slice(2);
const versions =
  requestedVersions.length > 0 ? requestedVersions : supportedVersions;
const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
);

function runNpm(fixtureDir, args, cacheDir) {
  execFileSync("npm", args, {
    cwd: fixtureDir,
    env: {
      ...process.env,
      npm_config_cache: cacheDir,
      npm_config_fund: "false",
      npm_config_audit: "false",
      STORYBOOK_DISABLE_TELEMETRY: "1",
    },
    stdio: "inherit",
  });
}

for (const version of versions) {
  if (!supportedVersions.includes(version)) {
    throw new Error(
      `Unsupported Storybook compatibility target ${version}. Expected one of: ${supportedVersions.join(", ")}.`,
    );
  }

  const tempRoot = fs.mkdtempSync(
    path.join(os.tmpdir(), `litsx-storybook-${version}-`),
  );
  const fixtureDir = path.join(tempRoot, "generated-design-system");
  const cacheDir = path.join(os.tmpdir(), "litsx-storybook-npm-cache");

  try {
    createProject(fixtureDir, { template: "design-system" });
    const packagePath = path.join(fixtureDir, "package.json");
    const packageJson = JSON.parse(fs.readFileSync(packagePath, "utf8"));

    packageJson.devDependencies["@litsx/storybook"] =
      `file:${path.join(repoRoot, "packages", "storybook")}`;
    for (const packageName of [
      "storybook",
      "@storybook/addon-a11y",
      "@storybook/addon-docs",
      "@storybook/web-components-vite",
    ]) {
      packageJson.devDependencies[packageName] = version;
    }
    fs.writeFileSync(
      packagePath,
      `${JSON.stringify(packageJson, null, 2)}\n`,
      "utf8",
    );

    console.log(`\n[storybook ${version}] install generated fixture`);
    runNpm(fixtureDir, ["install", "--loglevel=error"], cacheDir);
    for (const script of ["build", "typecheck", "test", "build-storybook"]) {
      console.log(`\n[storybook ${version}] npm run ${script}`);
      runNpm(fixtureDir, ["run", script], cacheDir);
    }
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
}

console.log(`Storybook scaffold compatibility passed: ${versions.join(", ")}`);
