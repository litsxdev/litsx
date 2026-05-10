import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const releaseCommitPattern = "^chore(release): version packages \\[skip ci\\]$";

const args = new Set(process.argv.slice(2));
const dryRun = args.has("--dry-run");
const updateExisting = args.has("--update");
const includeEmpty = args.has("--include-empty");
const requestedRefs = process.argv
  .slice(2)
  .filter((arg) => arg.startsWith("--ref="))
  .map((arg) => arg.slice("--ref=".length))
  .filter(Boolean);

const remoteUrl = execFileSync("git", ["remote", "get-url", "origin"], {
  cwd: repoRoot,
  encoding: "utf8",
}).trim();

const repoMatch = remoteUrl.match(/github\.com[:/]([^/]+)\/(.+?)(?:\.git)?$/);
if (!repoMatch) {
  throw new Error(`Could not infer GitHub repository from origin URL: ${remoteUrl}`);
}

const [, owner, repo] = repoMatch;
const githubToken = process.env.GITHUB_TOKEN ?? process.env.GH_TOKEN;

if (!githubToken && !dryRun) {
  throw new Error("Set GITHUB_TOKEN or GH_TOKEN to create GitHub releases.");
}

function listReleaseCommits() {
  if (requestedRefs.length > 0) {
    return requestedRefs;
  }

  return execFileSync(
    "git",
    ["log", "--grep", releaseCommitPattern, "--format=%H", "--reverse"],
    {
      cwd: repoRoot,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    },
  )
    .trim()
    .split("\n")
    .map((value) => value.trim())
    .filter(Boolean);
}

function buildReleasePayload(ref) {
  const output = execFileSync(
    "node",
    ["scripts/release/build-github-release.js", `--ref=${ref}`],
    {
      cwd: repoRoot,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "inherit"],
    },
  );

  return JSON.parse(output);
}

async function githubRequest(pathname, init = {}) {
  const response = await fetch(`https://api.github.com${pathname}`, {
    ...init,
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${githubToken}`,
      "X-GitHub-Api-Version": "2022-11-28",
      ...(init.headers ?? {}),
    },
  });

  if (response.status === 404) {
    return { ok: false, status: 404, data: null };
  }

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`GitHub API ${response.status} ${pathname}: ${body}`);
  }

  return {
    ok: true,
    status: response.status,
    data: await response.json(),
  };
}

async function createOrUpdateRelease(release) {
  const payload = {
    tag_name: release.tagName,
    target_commitish: release.targetCommitish,
    name: release.name,
    body: release.body,
    draft: false,
    prerelease: false,
    make_latest: "true",
  };

  if (dryRun) {
    console.log(`dry-run ${release.tagName}`);
    console.log(JSON.stringify(payload, null, 2));
    return;
  }

  const existing = await githubRequest(
    `/repos/${owner}/${repo}/releases/tags/${encodeURIComponent(release.tagName)}`,
  );

  if (existing.ok && !updateExisting) {
    console.log(`skip ${release.tagName} (already exists)`);
    return;
  }

  if (existing.ok) {
    await githubRequest(`/repos/${owner}/${repo}/releases/${existing.data.id}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: payload.name,
        body: payload.body,
        draft: payload.draft,
        prerelease: payload.prerelease,
        make_latest: payload.make_latest,
      }),
    });
    console.log(`updated ${release.tagName}`);
    return;
  }

  await githubRequest(`/repos/${owner}/${repo}/releases`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  console.log(`created ${release.tagName}`);
}

const refs = listReleaseCommits();

for (const ref of refs) {
  const release = buildReleasePayload(ref);
  if (!includeEmpty && (!Array.isArray(release.packages) || release.packages.length === 0)) {
    console.log(`skip ${release.tagName} (no public package releases)`);
    continue;
  }

  await createOrUpdateRelease(release);
}
