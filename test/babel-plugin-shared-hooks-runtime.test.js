import assert from "assert";
import babelCore from "@babel/core";
import parser from "../packages/babel-parser-litsx/src/index.mjs";
import { describe, it } from "vitest";
import { createRuntimeHooksTransform } from "../packages/shared/babel-plugin-shared-hooks/src/index.js";

const { transformFromAstSync } = babelCore;

function createPlugin() {
  return createRuntimeHooksTransform({
    pluginName: "test-shared-hooks-runtime",
    runtimeModule: "litsx",
    importSources: ["react", "litsx"],
    helperNames: ["useAfterUpdate", "useOnCommit", "useStyle"],
  });
}

function run(source) {
  const ast = parser.parse(source, {
    sourceType: "module",
    plugins: ["typescript"],
  });
  const result = transformFromAstSync(ast, source, {
    configFile: false,
    babelrc: false,
    plugins: [createPlugin()],
  });
  return result.code;
}

describe("@litsx/babel-plugin-shared-hooks createRuntimeHooksTransform", () => {
  it("validates required options", () => {
    assert.throws(() => createRuntimeHooksTransform({}), /requires pluginName/);
    assert.throws(
      () => createRuntimeHooksTransform({ pluginName: "x" }),
      /requires runtimeModule/
    );
    assert.throws(
      () => createRuntimeHooksTransform({
        pluginName: "x",
        runtimeModule: "litsx",
      }),
      /requires importSources/
    );
    assert.throws(
      () => createRuntimeHooksTransform({
        pluginName: "x",
        runtimeModule: "litsx",
        importSources: ["react"],
      }),
      /requires helperNames/
    );
  });

  it("rewrites runtime helpers from namespace and default imports and injects prepareEffects", () => {
    const source = `
      import runtimeDefault from "react";
      import * as runtimeNs from "litsx";

      class Card {
        render() {
          runtimeDefault.useAfterUpdate(() => this.sync(), []);
          runtimeNs.useStyle("--accent", this.accent);
          return this.accent;
        }
      }
    `;

    const code = run(source);

    assert.match(code, /import runtimeDefault, \* as runtimeNs from "litsx";|import \* as runtimeNs, runtimeDefault from "litsx";/);
    assert.match(code, /prepareEffects\(this\);/);
    assert.match(code, /runtimeDefault\.useAfterUpdate\(this, \(\) => this\.sync\(\), \[]\);/);
    assert.match(code, /runtimeNs\.useStyle\(this, "--accent", this\.accent\);/);
  });

  it("rewrites local custom hooks called from render and merges duplicate runtime imports", () => {
    const source = `
      import { useAfterUpdate } from "react";
      import { useOnCommit } from "litsx";

      const useCounterEffects = () => {
        useAfterUpdate(() => sideEffect(), []);
        useOnCommit(() => commitEffect(), []);
      };

      class Card {
        render() {
          useCounterEffects();
          return 1;
        }
      }
    `;

    const code = run(source);

    assert.match(code, /import \{[^}]*useAfterUpdate[^}]*prepareEffects[^}]*useOnCommit[^}]*\} from "litsx";|import \{[^}]*useAfterUpdate[^}]*useOnCommit[^}]*prepareEffects[^}]*\} from "litsx";|import \{[^}]*prepareEffects[^}]*useAfterUpdate[^}]*useOnCommit[^}]*\} from "litsx";|import \{[^}]*useOnCommit[^}]*prepareEffects[^}]*useAfterUpdate[^}]*\} from "litsx";/);
    assert.strictEqual((code.match(/from "litsx";/g) || []).length, 1);
    assert.match(code, /const useCounterEffects = _host => \{/);
    assert.match(code, /useAfterUpdate\(_host, \(\) => sideEffect\(\), \[]\);/);
    assert.match(code, /useOnCommit\(_host, \(\) => commitEffect\(\), \[]\);/);
    assert.match(code, /useCounterEffects\(this\);/);
    assert.match(code, /prepareEffects\(this\);/);
  });

  it("does not rewrite blocked custom hooks imported from react namespaces or existing host-aware calls", () => {
    const source = `
      import * as ReactRuntime from "react";
      import { useAfterUpdate } from "litsx";

      class Card {
        render() {
          useAfterUpdate(this, () => this.sync(), []);
          ReactRuntime.useFancyHook(value);
          return value;
        }
      }
    `;

    const code = run(source);

    assert.match(code, /useAfterUpdate\(this, \(\) => this\.sync\(\), \[]\);/);
    assert.match(code, /ReactRuntime\.useFancyHook\(value\);/);
    assert.doesNotMatch(code, /ReactRuntime\.useFancyHook\(this,/);
    assert.match(code, /prepareEffects\(this\);/);
  });

  it("adds a standalone prepareEffects import when the runtime is only imported as a namespace", () => {
    const source = `
      import * as runtime from "litsx";

      class Card {
        render() {
          runtime.useStyle("--accent", this.accent);
          return this.accent;
        }
      }
    `;

    const code = run(source);

    assert.match(code, /import \* as runtime from "litsx";/);
    assert.match(
      code,
      /import \{ prepareEffects, useStyle \} from "litsx";|import \{ useStyle, prepareEffects \} from "litsx";/
    );
    assert.match(code, /runtime\.useStyle\(this, "--accent", this\.accent\);/);
    assert.match(code, /prepareEffects\(this\);/);
  });

  it("handles class expressions and merges runtime imports into namespace and named groups", () => {
    const source = `
      import runtimeDefault from "react";
      import { useAfterUpdate } from "react";
      import * as runtimeNs from "litsx";
      import { useOnCommit } from "litsx";

      export const Card = class extends BaseElement {
        render() {
          runtimeDefault.useAfterUpdate(() => this.sync(), []);
          runtimeNs.useOnCommit(() => this.measure(), []);
          return this.value;
        }
      };
    `;

    const code = run(source);

    assert.strictEqual((code.match(/from "litsx";/g) || []).length, 2);
    assert.match(code, /import runtimeDefault, \* as runtimeNs from "litsx";|import \* as runtimeNs, runtimeDefault from "litsx";/);
    assert.match(
      code,
      /import \{[^}]*prepareEffects[^}]*useAfterUpdate[^}]*useOnCommit[^}]*\} from "litsx";|import \{[^}]*useAfterUpdate[^}]*useOnCommit[^}]*prepareEffects[^}]*\} from "litsx";|import \{[^}]*useOnCommit[^}]*prepareEffects[^}]*useAfterUpdate[^}]*\} from "litsx";/
    );
    assert.match(code, /runtimeDefault\.useAfterUpdate\(this, \(\) => this\.sync\(\), \[]\);/);
    assert.match(code, /runtimeNs\.useOnCommit\(this, \(\) => this\.measure\(\), \[]\);/);
    assert.match(code, /prepareEffects\(this\);/);
  });
});
