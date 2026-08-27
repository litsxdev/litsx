import { readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const MINIMUM_BRANCH_COVERAGE = 80;
const PACKAGE_BRANCH_THRESHOLDS = {
  'packages/authoring': 93,
  'packages/babel-plugin-litsx-proptypes': 87,
  'packages/babel-plugin-shared-hooks': 90,
  'packages/babel-plugin-transform-jsx-html-template': 94,
  'packages/babel-plugin-transform-litsx-scoped-elements': 90,
  'packages/babel-preset-litsx': 89,
  'packages/babel-preset-react-compat': 88,
  'packages/compiler': 90,
  'packages/core': 91,
  'packages/create-litsx-app': 99,
  'packages/eslint-plugin-litsx': 81,
  'packages/prop-types': 90,
  'packages/scoped-registry-shim': 83,
  'packages/ssr': 87,
  'packages/storybook': 89,
  'packages/tailwind': 93,
  'packages/typescript-session': 94,
  'packages/unocss': 91,
  'packages/vite-plugin': 95,
};
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

console.log(`Default minimum branch coverage per package: ${MINIMUM_BRANCH_COVERAGE}%`);

for (const [packageName, { covered, total }] of [...packages].sort(([a], [b]) => a.localeCompare(b))) {
  const percentage = total === 0 ? 100 : (covered / total) * 100;
  const threshold = PACKAGE_BRANCH_THRESHOLDS[packageName] ?? MINIMUM_BRANCH_COVERAGE;
  const status = percentage >= threshold ? 'PASS' : 'FAIL';
  console.log(`${status} ${packageName}: ${percentage.toFixed(2)}% (${covered}/${total}; minimum ${threshold}%)`);

  if (percentage < threshold) {
    failures.push(packageName);
  }
}

if (enforce && failures.length > 0) {
  console.error(`\nPackages below their branch coverage threshold: ${failures.join(', ')}`);
  process.exitCode = 1;
}
