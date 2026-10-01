import assert from "assert";
import { describe, it } from "vitest";
import {
  GITHUB_RELEASE_BODY_LIMIT,
  limitGitHubReleaseBody,
} from "../scripts/release/github-release-body.js";

describe("GitHub release body", () => {
  it("leaves release notes below the safety limit unchanged", () => {
    const body = "## Published packages\n\n- `@litsx/core@1.0.0`";

    assert.equal(limitGitHubReleaseBody(body), body);
  });

  it("truncates oversized release notes below GitHub's API limit", () => {
    const body = `## Published packages\n\n${"package notes\n\n".repeat(10_000)}`;
    const result = limitGitHubReleaseBody(body);

    assert(result.length <= GITHUB_RELEASE_BODY_LIMIT);
    assert.match(result, /Package notes were truncated/);
    assert.match(result, /CHANGELOG at the release commit/);
  });
});
