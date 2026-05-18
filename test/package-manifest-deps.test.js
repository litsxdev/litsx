import assert from "assert";
import { describe, it } from "vitest";

import compilerPackageJson from "../packages/compiler/package.json" with { type: "json" };
import jsxTemplatePluginPackageJson from "../packages/babel-plugin-transform-jsx-html-template/package.json" with { type: "json" };
import propTypesPluginPackageJson from "../packages/babel-plugin-litsx-proptypes/package.json" with { type: "json" };
import scopedElementsPluginPackageJson from "../packages/babel-plugin-transform-litsx-scoped-elements/package.json" with { type: "json" };
import babelPresetLitsxPackageJson from "../packages/babel-preset-litsx/package.json" with { type: "json" };
import typescriptPackageJson from "../packages/typescript/package.json" with { type: "json" };
import { readPackageVersion } from "../scripts/release/package-version-map.js";

function parseSemver(version) {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(version);
  if (!match) {
    throw new Error(`Unsupported semver version: ${version}`);
  }

  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
  };
}

function compareSemver(left, right) {
  return (
    left.major - right.major ||
    left.minor - right.minor ||
    left.patch - right.patch
  );
}

function assertRangeResolvesCurrentPackageVersion(range, packageName) {
  assert.ok(
    typeof range === "string" && range.startsWith("^"),
    `Expected a caret range for ${packageName}, received ${String(range)}`,
  );

  const lowerBound = parseSemver(range.slice(1));
  const currentVersion = parseSemver(readPackageVersion(packageName));

  assert.ok(
    compareSemver(currentVersion, lowerBound) >= 0,
    `${packageName} range ${range} does not include current version ${readPackageVersion(packageName)}`,
  );

  if (lowerBound.major > 0) {
    assert.strictEqual(currentVersion.major, lowerBound.major);
    return;
  }

  if (lowerBound.minor > 0) {
    assert.strictEqual(currentVersion.major, 0);
    assert.strictEqual(currentVersion.minor, lowerBound.minor);
    return;
  }

  assert.strictEqual(currentVersion.major, 0);
  assert.strictEqual(currentVersion.minor, 0);
  assert.strictEqual(currentVersion.patch, lowerBound.patch);
}

describe("package manifests", () => {
  it("declares direct runtime imports used by published packages", () => {
    assert.strictEqual(
      propTypesPluginPackageJson.dependencies["@babel/helper-plugin-utils"],
      "^7.28.6",
    );
    assert.strictEqual(
      jsxTemplatePluginPackageJson.dependencies["@litsx/authoring"],
      "^0.4.0",
    );
    assert.strictEqual(
      compilerPackageJson.dependencies["source-map-js"],
      "^1.2.1",
    );
    assert.strictEqual(
      jsxTemplatePluginPackageJson.dependencies["source-map-js"],
      "^1.2.1",
    );
    assertRangeResolvesCurrentPackageVersion(
      scopedElementsPluginPackageJson.dependencies["@litsx/typescript-session"],
      "@litsx/typescript-session",
    );
    assert.strictEqual(
      babelPresetLitsxPackageJson.dependencies["@litsx/authoring"],
      "^0.4.0",
    );
    assert.strictEqual(
      compilerPackageJson.dependencies["@babel/types"],
      "^7.29.0",
    );
    assertRangeResolvesCurrentPackageVersion(
      compilerPackageJson.dependencies["@litsx/typescript"],
      "@litsx/typescript",
    );
    assert.strictEqual(
      typescriptPackageJson.dependencies["@litsx/authoring"],
      "^0.4.0",
    );
    assertRangeResolvesCurrentPackageVersion(
      typescriptPackageJson.dependencies["@litsx/typescript-session"],
      "@litsx/typescript-session",
    );
  });
});
