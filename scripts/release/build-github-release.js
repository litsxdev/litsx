import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { npmReleasePackages } from "./release-packages.js";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

function readJsonAtGitRef(ref, filePath) {
  const content = execFileSync("git", ["show", `${ref}:${filePath}`], {
    cwd: repoRoot,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  });
  return JSON.parse(content);
}

function readCurrentJson(filePath) {
  return JSON.parse(fs.readFileSync(path.join(repoRoot, filePath), "utf8"));
}

function tryReadCurrentText(filePath) {
  try {
    return fs.readFileSync(path.join(repoRoot, filePath), "utf8");
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
    const previousPackage = readJsonAtGitRef("HEAD^", packageJsonPath);

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
  return execFileSync("git", ["rev-parse", "HEAD"], {
    cwd: repoRoot,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  }).trim();
}

function getReleaseCommitDate() {
  return execFileSync("git", ["show", "-s", "--format=%cs", "HEAD"], {
    cwd: repoRoot,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  }).trim();
}

function getPreviousReleaseCommitSha() {
  try {
    const previous = execFileSync(
      "git",
      [
        "log",
        "--grep=^chore\\(release\\): version packages \\[skip ci\\]$",
        "--format=%H",
        "-n",
        "2",
      ],
      {
        cwd: repoRoot,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      },
    )
      .trim()
      .split("\n")
      .filter(Boolean);

    return previous[1] ?? null;
  } catch {
    return null;
  }
}

function buildReleaseBody(changes, previousReleaseSha) {
  const lines = [];

  lines.push("## Published packages");
  lines.push("");
  for (const change of changes) {
    lines.push(`- \`${change.name}@${change.version}\``);
  }

  if (previousReleaseSha) {
    lines.push("");
    lines.push(`Previous release commit: \`${previousReleaseSha.slice(0, 7)}\``);
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
const previousReleaseSha = getPreviousReleaseCommitSha();

const releaseData = {
  tagName: `release-${shortSha}`,
  targetCommitish: releaseCommitSha,
  name: `LitSX release ${releaseCommitDate}`,
  body: buildReleaseBody(changes, previousReleaseSha),
  commitSha: releaseCommitSha,
  previousReleaseCommitSha: previousReleaseSha,
  packages: changes.map(({ name, version, packageDir, tagName }) => ({
    name,
    version,
    packageDir,
    tagName,
  })),
};

process.stdout.write(`${JSON.stringify(releaseData, null, 2)}\n`);
