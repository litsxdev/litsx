import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { npmReleasePackages } from "./release-packages.js";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const requestedRefArg = process.argv.find((arg) => arg.startsWith("--ref="));
const releaseRef = requestedRefArg ? requestedRefArg.slice("--ref=".length) : "HEAD";
const previousRef = `${releaseRef}^`;

function readJsonAtGitRef(ref, filePath) {
  const content = execFileSync("git", ["show", `${ref}:${filePath}`], {
    cwd: repoRoot,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  });
  return JSON.parse(content);
}

function readCurrentJson(filePath) {
  if (releaseRef === "HEAD") {
    return JSON.parse(fs.readFileSync(path.join(repoRoot, filePath), "utf8"));
  }

  return readJsonAtGitRef(releaseRef, filePath);
}

function tryReadCurrentText(filePath) {
  try {
    if (releaseRef === "HEAD") {
      return fs.readFileSync(path.join(repoRoot, filePath), "utf8");
    }

    return execFileSync("git", ["show", `${releaseRef}:${filePath}`], {
      cwd: repoRoot,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
  } catch {
    return null;
  }
}

function extractChangelogEntry(changelogText, version) {
  if (typeof changelogText !== "string" || !changelogText.trim()) {
    return null;
  }

  const heading = `## ${version}`;
  const start = changelogText.indexOf(heading);
  if (start < 0) {
    return null;
  }

  const afterHeading = changelogText.indexOf("\n", start);
  if (afterHeading < 0) {
    return null;
  }

  const remainder = changelogText.slice(afterHeading + 1);
  const nextHeadingMatch = remainder.match(/\n##\s+/);
  const end = nextHeadingMatch
    ? afterHeading + 1 + nextHeadingMatch.index
    : changelogText.length;

  return changelogText.slice(afterHeading + 1, end).trim();
}

function getChangedPackages() {
  const changes = [];

  for (const packageDir of npmReleasePackages) {
    const packageJsonPath = `${packageDir}/package.json`;
    const currentPackage = readCurrentJson(packageJsonPath);
    const previousPackage = readJsonAtGitRef(previousRef, packageJsonPath);

    if (currentPackage.version === previousPackage.version) {
      continue;
    }

    const changelogPath = `${packageDir}/CHANGELOG.md`;
    const changelogEntry = extractChangelogEntry(
      tryReadCurrentText(changelogPath),
      currentPackage.version,
    );

    changes.push({
      name: currentPackage.name,
      version: currentPackage.version,
      packageDir,
      tagName: `${currentPackage.name}@${currentPackage.version}`,
      notes: changelogEntry,
    });
  }

  return changes;
}

function getReleaseCommitSha() {
  return execFileSync("git", ["rev-parse", releaseRef], {
    cwd: repoRoot,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  }).trim();
}

function getReleaseCommitDate() {
  return execFileSync("git", ["show", "-s", "--format=%cs", releaseRef], {
    cwd: repoRoot,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  }).trim();
}

function buildReleaseBody(changes) {
  const lines = [];

  lines.push("## Published packages");
  lines.push("");
  for (const change of changes) {
    lines.push(`- \`${change.name}@${change.version}\``);
  }

  const packagesWithNotes = changes.filter((change) => change.notes);
  if (packagesWithNotes.length > 0) {
    lines.push("");
    lines.push("## Package notes");
    lines.push("");

    for (const change of packagesWithNotes) {
      lines.push(`### \`${change.name}@${change.version}\``);
      lines.push("");
      lines.push(change.notes);
      lines.push("");
    }
  }

  return lines.join("\n").trim();
}

const changes = getChangedPackages();
const releaseCommitSha = getReleaseCommitSha();
const releaseCommitDate = getReleaseCommitDate();
const shortSha = releaseCommitSha.slice(0, 7);

const releaseData = {
  tagName: `release-${shortSha}`,
  targetCommitish: releaseCommitSha,
  name: `LitSX release ${releaseCommitDate}`,
  body: buildReleaseBody(changes),
  commitSha: releaseCommitSha,
  packages: changes.map(({ name, version, packageDir, tagName }) => ({
    name,
    version,
    packageDir,
    tagName,
  })),
};

process.stdout.write(`${JSON.stringify(releaseData, null, 2)}\n`);
