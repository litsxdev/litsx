import assert from "assert";
import { describe, it } from "vitest";

import compilerPackageJson from "../packages/compiler/package.json" with { type: "json" };
import jsxTemplatePluginPackageJson from "../packages/babel-plugin-transform-jsx-html-template/package.json" with { type: "json" };
import propTypesPluginPackageJson from "../packages/babel-plugin-litsx-proptypes/package.json" with { type: "json" };
import scopedElementsPluginPackageJson from "../packages/babel-plugin-transform-litsx-scoped-elements/package.json" with { type: "json" };
import babelPresetLitsxPackageJson from "../packages/babel-preset-litsx/package.json" with { type: "json" };
import typescriptPackageJson from "../packages/typescript/package.json" with { type: "json" };

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
    assert.strictEqual(
      scopedElementsPluginPackageJson.dependencies["@litsx/typescript-session"],
      "^0.2.1",
    );
    assert.strictEqual(
      babelPresetLitsxPackageJson.dependencies["@litsx/authoring"],
      "^0.4.0",
    );
    assert.strictEqual(
      compilerPackageJson.dependencies["@babel/types"],
      "^7.29.0",
    );
    assert.strictEqual(
      compilerPackageJson.dependencies["@litsx/typescript"],
      "^0.6.3",
    );
    assert.strictEqual(
      typescriptPackageJson.dependencies["@litsx/authoring"],
      "^0.4.0",
    );
    assert.strictEqual(
      typescriptPackageJson.dependencies["@litsx/typescript-session"],
      "^0.2.1",
    );
  });
});
