import assert from "assert";
import { execFileSync } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";
import { describe, it } from "vitest";
import { runLitsxTypecheck } from "../packages/typescript/src/typecheck.js";

const fixtureDir = path.resolve("test/fixtures/typescript");
const tsconfigPath = path.join(fixtureDir, "tsconfig.litsx-jsx.json");

describe("litsx typescript cli", () => {
  it("type-checks the fixture through the virtualized litsx TypeScript entrypoint", () => {
    execFileSync("node", ["packages/typescript/src/litsx-tsc.js", "-p", tsconfigPath, "--noEmit"], {
      cwd: path.resolve("."),
      stdio: "pipe",
    });
  }, 30000);

  it("virtualizes imported .litsx modules discovered through module resolution", async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "litsx-tsc-imported-module-"));
    const srcDir = path.join(tempDir, "src");
    const componentDir = path.join(srcDir, "components");
    const jsconfigPath = path.join(tempDir, "jsconfig.json");

    try {
      fs.mkdirSync(componentDir, { recursive: true });
      fs.symlinkSync(path.resolve("node_modules"), path.join(tempDir, "node_modules"), "dir");
      fs.writeFileSync(
        jsconfigPath,
        JSON.stringify(
          {
            compilerOptions: {
              jsx: "preserve",
              jsxImportSource: "@litsx/core",
              module: "ESNext",
              moduleResolution: "Bundler",
              target: "ESNext",
              strict: true,
              skipLibCheck: true,
            },
            files: ["src/index.tsx", "src/types.d.ts"],
            exclude: ["src/components"],
          },
          null,
          2,
        ),
        "utf8",
      );
      fs.writeFileSync(
        path.join(srcDir, "types.d.ts"),
        'declare module "*.litsx";\n',
        "utf8",
      );
      fs.writeFileSync(
        path.join(srcDir, "index.tsx"),
        'import { VdsField } from "./components/vds-field.litsx";\nexport const view = <VdsField label="Name" />;\n',
        "utf8",
      );
      fs.writeFileSync(
        path.join(componentDir, "vds-field.litsx"),
        `
          import { css } from "lit";
          import { useState } from "@litsx/core";

          export function VdsField({ label }: { label: string }) {
            static styles = css\`
              button { color: currentColor; }
            \`;
            const [disabled, setDisabled] = useState(false);
            return (
              <label>
                <span>{label}</span>
                <button
                  @click={() => setDisabled(!disabled)}
                  .value={label}
                  ?disabled={disabled}
                >
                  Toggle
                </button>
              </label>
            );
          }
        `,
        "utf8",
      );

      const exitCode = await runLitsxTypecheck(["-p", jsconfigPath, "--noEmit"]);
      assert.strictEqual(exitCode, 0);
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  }, 30000);
});
