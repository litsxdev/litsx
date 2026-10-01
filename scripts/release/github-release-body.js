export const GITHUB_RELEASE_BODY_LIMIT = 120_000;

const TRUNCATION_NOTICE = [
  "---",
  "",
  "Package notes were truncated to fit GitHub's release-body limit.",
  "See each package's CHANGELOG at the release commit for the complete notes.",
].join("\n");

export function limitGitHubReleaseBody(
  body,
  maxLength = GITHUB_RELEASE_BODY_LIMIT,
) {
  if (body.length <= maxLength) {
    return body;
  }

  const suffix = `\n\n${TRUNCATION_NOTICE}`;
  const availableLength = maxLength - suffix.length;

  if (availableLength <= 0) {
    throw new Error(
      "GitHub release body limit is too small for the truncation notice",
    );
  }

  const candidate = body.slice(0, availableLength);
  const paragraphBoundary = candidate.lastIndexOf("\n\n");
  const truncatedBody =
    paragraphBoundary > 0 ? candidate.slice(0, paragraphBoundary) : candidate;

  return `${truncatedBody.trimEnd()}${suffix}`;
}
