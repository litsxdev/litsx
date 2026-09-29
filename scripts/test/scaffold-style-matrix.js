import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createProject } from "../../packages/create-litsx-app/src/index.js";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
);
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "litsx-style-matrix-"));
const templates = ["app", "component", "design-system", "ssr"];
const stylingOptions = ["css", "tailwind", "unocss"];
const executable = (name) => path.join(repoRoot, "node_modules", ".bin", name);

function run(command, args, cwd) {
  execFileSync(command, args, {
    cwd,
    env: { ...process.env, CI: "1" },
    stdio: "pipe",
  });
}

let passed = false;
try {
  for (const template of templates) {
    for (const styling of stylingOptions) {
      const variant = `${template}-${styling}`;
      const targetDir = path.join(tempRoot, variant);
      createProject(targetDir, { template, styling });
      fs.symlinkSync(
        path.join(repoRoot, "node_modules"),
        path.join(targetDir, "node_modules"),
      );

      run(executable("tsc"), ["-p", "tsconfig.json", "--noEmit"], targetDir);
      if (template === "ssr") {
        run(process.execPath, ["render.mjs"], targetDir);
        const document = fs.readFileSync(
          path.join(targetDir, "dist", "index.html"),
          "utf8",
        );
        if (
          !document.includes("declarative-shadow-root") &&
          !document.includes("shadowrootmode")
        ) {
          throw new Error(
            `${variant} prerender did not emit declarative shadow DOM`,
          );
        }
        if (styling !== "css" && !/font-weight:\s*700/u.test(document)) {
          throw new Error(
            `${variant} prerender did not materialize component utility CSS`,
          );
        }
      } else {
        run(executable("vite"), ["build"], targetDir);
        if (!fs.existsSync(path.join(targetDir, "dist", "index.html"))) {
          throw new Error(`${variant} Vite build did not emit dist/index.html`);
        }
        if (
          styling !== "css" &&
          !fs
            .readdirSync(path.join(targetDir, "dist", "assets"))
            .some((name) => name.endsWith(".css"))
        ) {
          throw new Error(`${variant} Vite build did not emit utility CSS`);
        }
      }

      console.log(`validated ${variant}`);
    }
  }
  passed = true;
} finally {
  if (passed) {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  } else {
    console.error(`Style matrix fixture preserved for inspection: ${tempRoot}`);
  }
}

console.log("scaffold style matrix passed");
