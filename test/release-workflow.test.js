import assert from "assert";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { describe, it } from "vitest";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

describe("release workflow", () => {
  it("checks out stable releases with the bypass-enabled app token", () => {
    const workflow = fs.readFileSync(
      path.join(repoRoot, ".github", "workflows", "release.yml"),
      "utf8",
    );
    const publishJob = workflow.slice(workflow.indexOf("  publish:\n"));

    assert.match(
      publishJob,
      /token: \$\{\{ needs\.plan\.outputs\.release_kind == 'stable' && steps\.app-token\.outputs\.token \|\| github\.token \}\}/,
    );
    assert.match(publishJob, /persist-credentials: false/);
  });
});
