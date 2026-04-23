import assert from "assert";
import babelCore from "@babel/core";
import parser from "../packages/babel-parser-litsx/src/index.mjs";
import { describe, it } from "vitest";
import { createEffectHooksTransform } from "../packages/shared/babel-plugin-shared-hooks/src/index.js";

const { transformFromAstSync } = babelCore;

const plugin = createEffectHooksTransform({
  pluginName: "test-shared-hooks-effects",
  importSources: ["react"],
  runtimeModule: "litsx",
});

function run(source) {
  const ast = parser.parse(source, { sourceType: "module" });
  const result = transformFromAstSync(ast, source, {
    configFile: false,
    babelrc: false,
    plugins: [plugin],
  });
  return result.code;
}

describe("@litsx/babel-plugin-shared-hooks createEffectHooksTransform", () => {
  it("rewrites useEffect and useLayoutEffect and injects prepareEffects exactly once", () => {
    const source = [
      "import { LitElement } from 'lit';",
      "import { useEffect, useLayoutEffect } from 'react';",
      "",
      "class EffectsCard extends LitElement {",
      "  render() {",
      "    useEffect(() => this.sync(), [this.value]);",
      "    useLayoutEffect(() => this.measure(), []);",
      "    return this.value;",
      "  }",
      "}",
    ].join("\n");

    const code = run(source);

    assert.match(code, /import \{[^}]*prepareEffects[^}]*useAfterUpdate[^}]*useOnCommit[^}]*\} from "litsx"|import \{[^}]*prepareEffects[^}]*useOnCommit[^}]*useAfterUpdate[^}]*\} from "litsx"|import \{[^}]*useAfterUpdate[^}]*prepareEffects[^}]*useOnCommit[^}]*\} from "litsx"/);
    assert.match(code, /prepareEffects\(this\);/);
    assert.strictEqual((code.match(/prepareEffects\(this\);/g) || []).length, 1);
    assert.match(code, /useAfterUpdate\(this, \(\) => this\.sync\(\), \[this\.value\]\);/);
    assert.match(code, /useOnCommit\(this, \(\) => this\.measure\(\), \[]\);/);
    assert.doesNotMatch(code, /from ['"]react['"]/);
  });

  it("keeps unrelated React imports when only the effect hooks are transformed", () => {
    const source = [
      "import { LitElement } from 'lit';",
      "import { useEffect, useMemo } from 'react';",
      "",
      "class EffectsCard extends LitElement {",
      "  render() {",
      "    useEffect(() => this.sync(), []);",
      "    return useMemo(() => this.value, [this.value]);",
      "  }",
      "}",
    ].join("\n");

    const code = run(source);

    assert.match(code, /import \{ useMemo \} from 'react';|import \{ useMemo \} from "react";/);
    assert.doesNotMatch(code, /import \{[^}]*useEffect[^}]*\} from ['"]react['"]/);
    assert.match(code, /useAfterUpdate\(this, \(\) => this\.sync\(\), \[]\);/);
    assert.match(code, /return useMemo\(\(\) => this\.value, \[this\.value\]\);/);
  });

  it("leaves unsupported dependency arrays unchanged", () => {
    const source = [
      "import { LitElement } from 'lit';",
      "import { useEffect } from 'react';",
      "",
      "class EffectsCard extends LitElement {",
      "  render() {",
      "    useEffect(() => this.sync(), [...this.deps]);",
      "    return this.value;",
      "  }",
      "}",
    ].join("\n");

    const code = run(source);

    assert.match(code, /useEffect\(\(\) => this\.sync\(\), \[\.\.\.this\.deps\]\);/);
    assert.doesNotMatch(code, /prepareEffects\(this\);/);
    assert.doesNotMatch(code, /useAfterUpdate\(/);
    assert.match(code, /import \{ useEffect \} from 'react';|import \{ useEffect \} from "react";/);
  });
});
