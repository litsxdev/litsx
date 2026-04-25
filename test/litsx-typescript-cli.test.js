import assert from "assert";
import { execFileSync } from "child_process";
import path from "path";
import { describe, it } from "vitest";

const fixtureDir = path.resolve("test/fixtures/typescript");
const tsconfigPath = path.join(fixtureDir, "tsconfig.litsx-jsx.json");

describe("litsx typescript cli", () => {
  it("type-checks the fixture through the virtualized litsx TypeScript entrypoint", () => {
    execFileSync("node", ["packages/typescript-plugin-litsx/bin/litsx-tsc.js", "-p", tsconfigPath, "--noEmit"], {
      cwd: path.resolve("."),
      stdio: "pipe",
    });
  }, 15000);
});
