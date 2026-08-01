import { readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const MINIMUM_BRANCH_COVERAGE = 80;
const enforce = process.argv.includes('--enforce');
const coveragePath = path.resolve('coverage/coverage-final.json');

function packageNameForFile(filePath) {
  const segments = path.relative(process.cwd(), filePath).split(path.sep);

  if (segments[0] !== 'packages' || segments[2] !== 'src') {
    return null;
  }

  return segments.slice(0, 2).join('/');
}

function collectBranchCoverage(coverage) {
  const packages = new Map();

  for (const [filePath, fileCoverage] of Object.entries(coverage)) {
    const packageName = packageNameForFile(filePath);
    if (!packageName) {
      continue;
    }

    const summary = packages.get(packageName) ?? { covered: 0, total: 0 };
    for (const hits of Object.values(fileCoverage.b)) {
      summary.total += hits.length;
      summary.covered += hits.filter((count) => count > 0).length;
    }
    packages.set(packageName, summary);
  }

  return packages;
}

const coverage = JSON.parse(await readFile(coveragePath, 'utf8'));
const packages = collectBranchCoverage(coverage);
const failures = [];

console.log(`Minimum branch coverage per package: ${MINIMUM_BRANCH_COVERAGE}%`);

for (const [packageName, { covered, total }] of [...packages].sort(([a], [b]) => a.localeCompare(b))) {
  const percentage = total === 0 ? 100 : (covered / total) * 100;
  const status = percentage >= MINIMUM_BRANCH_COVERAGE ? 'PASS' : 'FAIL';
  console.log(`${status} ${packageName}: ${percentage.toFixed(2)}% (${covered}/${total})`);

  if (percentage < MINIMUM_BRANCH_COVERAGE) {
    failures.push(packageName);
  }
}

if (enforce && failures.length > 0) {
  console.error(`\nPackages below ${MINIMUM_BRANCH_COVERAGE}% branch coverage: ${failures.join(', ')}`);
  process.exitCode = 1;
}
