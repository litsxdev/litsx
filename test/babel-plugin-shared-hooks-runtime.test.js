import assert from "assert";
import * as babelCore from "@babel/core";
import parser from "./helpers/litsx-parser.js";
import { describe, it } from "vitest";
import { createRuntimeHooksTransform } from "../packages/babel-plugin-shared-hooks/src/index.js";

const { transformFromAstSync } = babelCore;

function createPlugin() {
  return createRuntimeHooksTransform({
    pluginName: "test-shared-hooks-runtime",
    runtimeModule: "@litsx/core",
    importSources: ["react", "@litsx/core"],
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
        runtimeModule: "@litsx/core",
      }),
      /requires importSources/
    );
    assert.throws(
      () => createRuntimeHooksTransform({
        pluginName: "x",
        runtimeModule: "@litsx/core",
        importSources: ["react"],
      }),
      /requires helperNames/
    );
  });

  it("rewrites runtime helpers behind a bounded render context", () => {
    const source = `
      import runtimeDefault from "react";
      import * as runtimeNs from "@litsx/core";

      class Card {
        render() {
          runtimeDefault.useAfterUpdate(() => this.sync(), []);
          runtimeNs.useStyle("--accent", this.accent);
          return this.accent;
        }
      }
    `;

    const code = run(source);

    assert.match(code, /import runtimeDefault, \* as runtimeNs from "@litsx\/core";|import \* as runtimeNs, runtimeDefault from "@litsx\/core";/);
    assert.match(code, /renderWithHooks\(this, \(\) => \{/);
    assert.match(code, /runtimeDefault\.useAfterUpdate\(\(\) => this\.sync\(\), \[]\);/);
    assert.match(code, /runtimeNs\.useStyle\("--accent", this\.accent\);/);
    assert.doesNotMatch(code, /prepareEffects/);
  });

  it("rewrites local custom hooks called from render and merges duplicate runtime imports", () => {
    const source = `
      import { useAfterUpdate } from "react";
      import { useOnCommit } from "@litsx/core";

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

    assert.match(code, /import \{[^}]*useAfterUpdate[^}]*useOnCommit[^}]*renderWithHooks[^}]*\} from "@litsx\/core";/);
    assert.strictEqual((code.match(/from "@litsx\/core";/g) || []).length, 1);
    assert.match(code, /const useCounterEffects = \(\) => \{/);
    assert.match(code, /useAfterUpdate\(\(\) => sideEffect\(\), \[]\);/);
    assert.match(code, /useOnCommit\(\(\) => commitEffect\(\), \[]\);/);
    assert.match(code, /useCounterEffects\[Symbol\.for\("litsx\.hook"\)\] = true;/);
    assert.match(code, /useCounterEffects\(\);/);
    assert.doesNotMatch(code, /prepareEffects|_host/);
  });

  it("marks structural custom hooks with direct structural metadata assignments", () => {
    const plugin = createRuntimeHooksTransform({
      pluginName: "test-shared-hooks-runtime-structural",
      runtimeModule: "@litsx/core",
      importSources: ["@litsx/core"],
      helperNames: ["defineHook", "readStructuralHook"],
      structuralHookResolver() {
        return false;
      },
    });

    const source = `
      import { defineHook } from "@litsx/core";

      const useLocale = defineHook({
        use(locale) {
          return locale;
        }
      });

      export function useMessage(name) {
        return useLocale(name);
      }
    `;

    const ast = parser.parse(source, {
      sourceType: "module",
      plugins: ["typescript"],
    });
    const result = transformFromAstSync(ast, source, {
      configFile: false,
      babelrc: false,
      plugins: [plugin],
    });
    const code = result.code;

    assert.match(
      code,
      /useMessage\[Symbol\.for\("litsx\.structuralHooks"\)\] = \[/,
    );
    assert.match(code, /useMessage\[Symbol\.for\("litsx\.hook"\)\] = true;/);
    assert.doesNotMatch(code, /defineStructuralHookEntries\(/);
    assert.doesNotMatch(code, /getStructuralHookEntries\(/);
  });

  it("does not reprocess custom hooks already marked as compiled", () => {
    const source = `
      export function useCounterEffects() {
        useAfterUpdate(() => sideEffect(), []);
      }

      useCounterEffects[Symbol.for("litsx.hook")] = true;

      class Card {
        render() {
          useCounterEffects();
          return this.value;
        }
      }
    `;

    const code = run(source);

    assert.strictEqual((code.match(/useCounterEffects\[Symbol\.for\("litsx\.hook"\)\] = true;/g) || []).length, 1);
    assert.match(code, /export function useCounterEffects\(\)/);
    assert.match(code, /useCounterEffects\(\);/);
  });

  it("does not reprocess classes already marked as compiled LitSX components", () => {
    const source = `
      import { LitElement } from "lit";

      export class Card extends LitElement {
        static [Symbol.for("litsx.component")] = true;
        static [Symbol.for("litsx.hostTypeId")] = "litsx-host-type-card";

        render() {
          return <div>ok</div>;
        }
      }
    `;

    const code = run(source);

    assert.strictEqual((code.match(/static \[Symbol\.for\("litsx\.component"\)\] = true;/g) || []).length, 1);
    assert.doesNotMatch(code, /prepareEffects\(this\);/);
  });

  it("treats host-like authored parameters as ordinary hook parameters", () => {
    const source = `
      import { useAfterUpdate } from "@litsx/core";

      const useCounterEffects = (host, count) => {
        useAfterUpdate(() => syncCount(count), []);
      };

      class Card {
        render() {
          useCounterEffects(this.count);
          return this.count;
        }
      }
    `;

    const code = run(source);

    assert.match(code, /const useCounterEffects = \(host, count\) => \{/);
    assert.match(code, /useAfterUpdate\(\(\) => syncCount\(count\), \[]\);/);
    assert.match(code, /useCounterEffects\(this\.count\);/);
    assert.doesNotMatch(code, /prepareEffects/);
  });

  it("does not rewrite blocked custom hooks imported from React namespaces", () => {
    const source = `
      import * as ReactRuntime from "react";
      import { useAfterUpdate } from "@litsx/core";

      class Card {
        render() {
          useAfterUpdate(() => this.sync(), []);
          ReactRuntime.useFancyHook(value);
          return value;
        }
      }
    `;

    const code = run(source);

    assert.match(code, /useAfterUpdate\(\(\) => this\.sync\(\), \[]\);/);
    assert.match(code, /ReactRuntime\.useFancyHook\(value\);/);
    assert.doesNotMatch(code, /ReactRuntime\.useFancyHook\(this,/);
    assert.match(code, /renderWithHooks\(this, \(\) => \{/);
  });

  it("adds a render-boundary import when the runtime is only a namespace", () => {
    const source = `
      import * as runtime from "@litsx/core";

      class Card {
        render() {
          runtime.useStyle("--accent", this.accent);
          return this.accent;
        }
      }
    `;

    const code = run(source);

    assert.match(code, /import \* as runtime from "@litsx\/core";/);
    assert.match(code, /import \{[^}]*useStyle[^}]*\} from "@litsx\/core";/);
    assert.match(code, /import \{[^}]*renderWithHooks[^}]*\} from "@litsx\/core";/);
    assert.match(code, /runtime\.useStyle\("--accent", this\.accent\);/);
    assert.doesNotMatch(code, /prepareEffects/);
  });

  it("does not require the removed public prepareEffects helper", () => {
    const source = `
      import { useAfterUpdate } from "@litsx/core";

      class Card {
        render() {
          useAfterUpdate(() => this.sync(), []);
          return this.value;
        }
      }
    `;

    const code = run(source);

    assert.match(code, /import \{[^}]*useAfterUpdate[^}]*\} from "@litsx\/core";/);
    assert.match(code, /import \{[^}]*renderWithHooks[^}]*\} from "@litsx\/core";/);
    assert.match(code, /useAfterUpdate\(\(\) => this\.sync\(\), \[]\);/);
    assert.doesNotMatch(code, /prepareEffects/);
  });

  it("handles class expressions and merges runtime imports into namespace and named groups", () => {
    const source = `
      import runtimeDefault from "react";
      import { useAfterUpdate } from "react";
      import * as runtimeNs from "@litsx/core";
      import { useOnCommit } from "@litsx/core";

      export const Card = class extends BaseElement {
        render() {
          runtimeDefault.useAfterUpdate(() => this.sync(), []);
          runtimeNs.useOnCommit(() => this.measure(), []);
          return this.value;
        }
      };
    `;

    const code = run(source);

    assert.strictEqual((code.match(/from "@litsx\/core";/g) || []).length, 2);
    assert.match(code, /import runtimeDefault, \* as runtimeNs from "@litsx\/core";|import \* as runtimeNs, runtimeDefault from "@litsx\/core";/);
    assert.match(
      code,
      /import \{[^}]*useAfterUpdate[^}]*useOnCommit[^}]*renderWithHooks[^}]*\} from "@litsx\/core";/
    );
    assert.match(code, /runtimeDefault\.useAfterUpdate\(\(\) => this\.sync\(\), \[]\);/);
    assert.match(code, /runtimeNs\.useOnCommit\(\(\) => this\.measure\(\), \[]\);/);
    assert.doesNotMatch(code, /prepareEffects/);
  });

  it("collapses duplicate default and namespace runtime imports after rewriting source modules", () => {
    const source = `
      import ReactDefault from "react";
      import RuntimeDefault from "@litsx/core";
      import * as ReactNs from "react";
      import * as RuntimeNs from "@litsx/core";

      class Card {
        render() {
          ReactDefault.useAfterUpdate(() => this.sync(), []);
          ReactNs.useOnCommit(() => this.measure(), []);
          return RuntimeDefault && RuntimeNs;
        }
      }
    `;

    const code = run(source);

    assert.strictEqual((code.match(/import [^;]+ from "@litsx\/core";/g) || []).length, 2);
    assert.match(
      code,
      /import ReactDefault, \* as ReactNs from "@litsx\/core";|import \* as ReactNs, ReactDefault from "@litsx\/core";/
    );
    assert.doesNotMatch(code, /import RuntimeDefault from/);
    assert.doesNotMatch(code, /import \* as RuntimeNs from/);
    assert.match(
      code,
      /import \{[^}]*useAfterUpdate[^}]*useOnCommit[^}]*renderWithHooks[^}]*\} from "@litsx\/core";/
    );
  });

  it("rewrites namespace custom hooks from non-blocked imports and injects runtime helpers into the existing import", () => {
    const source = `
      import { useAfterUpdate } from "@litsx/core";
      import * as hooks from "./hooks";

      class Card {
        render() {
          hooks.useCounter();
          useAfterUpdate(() => this.sync(), []);
          return this.value;
        }
      }
    `;

    const code = run(source);

    assert.match(code, /import \{[^}]*useAfterUpdate[^}]*\} from "@litsx\/core";/);
    assert.match(code, /import \{[^}]*renderWithHooks[^}]*\} from "@litsx\/core";/);
    assert.match(code, /hooks\.useCounter\(\);/);
    assert.match(code, /useAfterUpdate\(\(\) => this\.sync\(\), \[]\);/);
    assert.doesNotMatch(code, /prepareEffects/);
  });

  it("adds a runtime import when none exists and rejects hooks outside render scope", () => {
    const hookSource = `
      import * as hooks from "./hooks";

      class Card {
        render() {
          hooks.useCounter();
          return this.value;
        }
      }
    `;

    const hookCode = run(hookSource);
    assert.match(hookCode, /import \{[^}]*renderWithHooks[^}]*\} from "@litsx\/core";/);
    assert.match(hookCode, /hooks\.useCounter\(\);/);
    assert.doesNotMatch(hookCode, /prepareEffects/);

    const untouchedSource = `
      import { useAfterUpdate } from "react";

      class Card {
        connectedCallback() {
          useAfterUpdate(() => this.sync(), []);
        }
      }
    `;

    assert.throws(
      () => run(untouchedSource),
      (error) => error?.code === "LITSX_HOOK_INVALID_SCOPE",
    );
  });

  it("adds a render boundary when render only uses a local custom hook", () => {
    const source = `
      function useCounterEffects() {
        return measure();
      }

      class Card {
        render() {
          useCounterEffects();
          return this.value;
        }
      }
    `;

    const code = run(source);

    assert.match(code, /import \{[^}]*renderWithHooks[^}]*\} from "@litsx\/core";/);
    assert.match(code, /function useCounterEffects\(\) \{/);
    assert.match(code, /useCounterEffects\(\);/);
    assert.doesNotMatch(code, /prepareEffects|_host/);
  });

  it("rewrites function-expression custom hooks declared in variable initializers", () => {
    const source = `
      import { useAfterUpdate } from "@litsx/core";

      const useCounterEffects = function () {
        useAfterUpdate(() => syncCount(), []);
      };

      class Card {
        render() {
          useCounterEffects();
          return this.value;
        }
      }
    `;

    const code = run(source);

    assert.match(code, /const useCounterEffects = function \(\) \{/);
    assert.match(code, /useAfterUpdate\(\(\) => syncCount\(\), \[]\);/);
    assert.match(code, /useCounterEffects\(\);/);
  });

  it("merges rewritten runtime default and namespace imports even when no named helpers are needed", () => {
    const source = `
      import ReactDefault from "react";
      import RuntimeDefault from "@litsx/core";
      import * as ReactNs from "react";
      import * as RuntimeNs from "@litsx/core";

      class Card {
        render() {
          return ReactDefault || RuntimeDefault || ReactNs || RuntimeNs;
        }
      }
    `;

    const code = run(source);

    assert.strictEqual((code.match(/from "@litsx\/core";/g) || []).length, 1);
    assert.match(
      code,
      /import ReactDefault, \* as ReactNs from "@litsx\/core";|import \* as ReactNs, ReactDefault from "@litsx\/core";/
    );
    assert.doesNotMatch(code, /prepareEffects/);
  });
});
