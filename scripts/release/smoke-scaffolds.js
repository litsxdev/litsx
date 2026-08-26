import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createProject } from "../../packages/create-litsx-app/src/index.js";
import { createCaretVersionMap } from "./package-version-map.js";

const templates = ["app", "component", "design-system", "ssr"];
const stylingOptions = ["css", "tailwind", "unocss"];
const tempRoot = fs.mkdtempSync(
  path.join(os.tmpdir(), "litsx-release-scaffold-"),
);
const expectedVersions = createCaretVersionMap([
  "@litsx/core",
  "@litsx/tailwind",
  "@litsx/unocss",
]);

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

for (const template of templates) {
  for (const styling of stylingOptions) {
    const variant = `${template}-${styling}`;
    const targetDir = path.join(tempRoot, variant);
    createProject(targetDir, {
      template,
      styling,
      localWorkspacePackages: false,
    });

    const manifest = JSON.parse(
      fs.readFileSync(path.join(targetDir, "package.json"), "utf8"),
    );
    assert(manifest.scripts?.dev, `${variant} scaffold is missing dev script`);
    assert(
      manifest.scripts?.build,
      `${variant} scaffold is missing build script`,
    );
    assert(
      manifest.scripts?.lint,
      `${variant} scaffold is missing lint script`,
    );
    assert(
      manifest.scripts?.format,
      `${variant} scaffold is missing format script`,
    );
    assert(
      manifest.scripts?.typecheck,
      `${variant} scaffold is missing typecheck script`,
    );
    assert(
      manifest.dependencies?.["@litsx/core"] ===
        expectedVersions["@litsx/core"],
      `${variant} scaffold should depend on @litsx/core ${expectedVersions["@litsx/core"]}`,
    );
    if (styling !== "css") {
      assert(
        manifest.devDependencies?.[`@litsx/${styling}`] ===
          expectedVersions[`@litsx/${styling}`],
        `${variant} scaffold should depend on @litsx/${styling} ${expectedVersions[`@litsx/${styling}`]}`,
      );
      assert(
        fs.existsSync(path.join(targetDir, "litsx.style.js")),
        `${variant} scaffold is missing its style integration`,
      );
    }
    assert(
      !fs.existsSync(path.join(targetDir, "prettier.config.js")),
      `${variant} scaffold should use standard Prettier defaults`,
    );
    assert(
      fs.existsSync(path.join(targetDir, "eslint.config.js")),
      `${variant} scaffold is missing eslint.config.js`,
    );
    assert(
      fs.existsSync(path.join(targetDir, "tsconfig.json")),
      `${variant} scaffold is missing tsconfig.json`,
    );
  }
}

console.log(`scaffold smoke passed in ${tempRoot}`);
