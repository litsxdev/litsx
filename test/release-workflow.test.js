import assert from "assert";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { describe, it } from "vitest";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

describe("release workflow", () => {
  const workflow = fs.readFileSync(
    path.join(repoRoot, ".github", "workflows", "release.yml"),
    "utf8",
  );
  const publishJob = workflow.slice(workflow.indexOf("  publish:\n"));

  it("treats main, next, and feature branches as distinct release channels", () => {
    assert.match(
      workflow,
      /branch === "main" \? "stable" : branch === "next" \? "next" : "snapshot"/,
    );
    assert.match(workflow, /github\.ref == 'refs\/heads\/next'/);
    assert.match(workflow, /run: corepack yarn changeset:version:next/);
    assert.match(
      workflow,
      /run: corepack yarn changeset publish --tag next --no-git-tag/,
    );
  });

  it("checks out persistent release channels with the bypass-enabled app token", () => {
    assert.match(
      publishJob,
      /token: \$\{\{ needs\.plan\.outputs\.release_kind != 'snapshot' && steps\.app-token\.outputs\.token \|\| github\.token \}\}/,
    );
    assert.match(publishJob, /persist-credentials: false/);
    assert.match(
      publishJob,
      /git push origin HEAD:\$\{\{ needs\.plan\.outputs\.release_branch \}\}/,
    );
  });
});
