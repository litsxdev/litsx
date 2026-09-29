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

function run(source, transformPlugin = createPlugin(), pluginOptions = {}) {
  const ast = parser.parse(source, {
    sourceType: "module",
    plugins: ["typescript"],
  });
  const result = transformFromAstSync(ast, source, {
    configFile: false,
    babelrc: false,
    plugins: [[transformPlugin, pluginOptions]],
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

  it("lowers local structural hooks and propagates nested structural dependencies", () => {
    const source = `
      import { defineHook, useStyle } from "@litsx/core";

      const useTheme = defineHook({
        mixin: (Base) => class extends Base {},
        use(name) {
          useStyle("--theme", name);
          return name;
        }
      });

      function useCardTheme(name) {
        return useTheme(name);
      }

      class Card extends HTMLElement {
        render() {
          return useCardTheme(this.theme);
        }
      }
    `;

    const code = run(source);

    assert.match(code, /readStructuralHook\(useTheme, \[name\]\)/);
    assert.match(code, /useCardTheme\[Symbol\.for\("litsx\.structuralHooks"\)\]/);
    assert.match(code, /class Card extends applyStructuralHooks\(HTMLElement/);
    assert.match(code, /renderWithHooks\(this/);
  });

  it("resolves named, namespaced, and structural custom hooks from imports", () => {
    const transformPlugin = createRuntimeHooksTransform({
      pluginName: "test-shared-hooks-runtime-imported-structural",
      runtimeModule: "@litsx/core",
      importSources: ["@litsx/core"],
      helperNames: (name) => name === "useStyle",
    });
    const resolver = ({ source, importedName }) => {
      if (source !== "./hooks.js") return false;
      if (importedName === "useLayout") return { kind: "structural-hook" };
      if (importedName === "useCard") return "structural-custom-hook";
      return false;
    };
    const source = `
      import { useLayout, useCard } from "./hooks.js";
      import * as hooks from "./hooks.js";

      class Card extends HTMLElement {
        render() {
          useLayout(this.size);
          hooks.useLayout(this.size);
          useCard(this.value);
          hooks.useCard(this.value);
          return null;
        }
      }
    `;

    const code = run(source, transformPlugin, {
      structuralHookResolver: resolver,
      customHookResolver: () => true,
    });

    assert.match(code, /readStructuralHook\(useLayout, \[this\.size\]\)/);
    assert.match(code, /readStructuralHook\(hooks\.useLayout, \[this\.size\]\)/);
    assert.match(code, /useCard\[Symbol\.for\("litsx\.structuralHooks"\)\]/);
    assert.match(code, /hooks\.useCard\[Symbol\.for\("litsx\.structuralHooks"\)\]/);
    assert.match(code, /applyStructuralHooks\(HTMLElement/);
  });

  it("rejects invalid structural hook definitions, aliases, containers, and dynamic namespace access", () => {
    const transformPlugin = createRuntimeHooksTransform({
      pluginName: "test-shared-hooks-runtime-structural-errors",
      runtimeModule: "@litsx/core",
      importSources: ["@litsx/core"],
      helperNames: ["useStyle"],
    });
    const options = {
      structuralHookResolver: ({ source, importedName }) =>
        source === "./hooks.js" && importedName === "useLayout",
    };

    assert.throws(
      () => run(`import { defineHook } from "@litsx/core"; const useBad = defineHook({ setup() {} });`, transformPlugin),
      /no longer accepts structural fields setup/,
    );
    assert.throws(
      () => run(`import { defineHook } from "@litsx/core"; const useBad = defineHook({});`, transformPlugin),
      /requires a mixin, a use/,
    );
    assert.throws(
      () => run(`import { useLayout } from "./hooks.js"; const alias = useLayout;`, transformPlugin, options),
      /cannot be created through an alias/,
    );
    assert.throws(
      () => run(`import { useLayout } from "./hooks.js"; const hooks = { useLayout };`, transformPlugin, options),
      /cannot be stored in object or array containers/,
    );
    assert.throws(
      () => run(`import { useLayout } from "./hooks.js"; const hooks = [useLayout];`, transformPlugin, options),
      /cannot be stored in object or array containers/,
    );
    assert.throws(
      () => run(`import * as hooks from "./hooks.js"; hooks["useLayout"]();`, transformPlugin, options),
      /must use a static property/,
    );
    assert.throws(
      () => run(`import { useLayout } from "./hooks.js"; useLayout();`, transformPlugin, options),
      /LITSX_HOOK_INVALID_SCOPE/,
    );
  });

  it("honors imported custom-hook resolution outcomes", () => {
    const transformPlugin = createRuntimeHooksTransform({
      pluginName: "test-shared-hooks-runtime-custom-resolution",
      runtimeModule: "@litsx/core",
      importSources: ["@litsx/core"],
      helperNames: ["useStyle"],
    });
    const source = `
      import { useRemote } from "remote-hooks";
      import * as remote from "remote-hooks";
      class Card { render() { useRemote(); remote.useRemote(); return null; } }
    `;

    assert.throws(
      () => run(source, transformPlugin, {
        customHookResolver: () => "unsupported-external-hook",
      }),
      /Cannot compile external hook/,
    );
    assert.throws(
      () => run(source, transformPlugin, {
        customHookResolver: () => "unresolved-custom-hook",
      }),
      /Unable to resolve imported custom hook/,
    );

    const untouched = run(source, transformPlugin, {
      customHookResolver: () => false,
    });
    assert.doesNotMatch(untouched, /renderWithHooks/);

    const transformed = run(source, transformPlugin, {
      customHookResolver: () => true,
    });
    assert.match(transformed, /renderWithHooks/);
  });

  it("supports preserved runtime imports and helper call metadata", () => {
    const transformPlugin = createRuntimeHooksTransform({
      pluginName: "test-shared-hooks-runtime-metadata",
      runtimeModule: "@litsx/core",
      importSources: ["react", "@litsx/core"],
      preservedRuntimeImportSources: ["react"],
      helperNames: (name) => name === "useStyle",
      callMetadataByHelper: new Map([
        ["useStyle", (_path, _state, types) => types.stringLiteral("meta")],
      ]),
    });
    const source = `
      import ReactDefault, { useStyle as style } from "react";
      class Card {
        render() {
          style("--a", 1);
          ReactDefault.useStyle("meta", "--b", 2);
          return null;
        }
      }
    `;

    const code = run(source, transformPlugin);
    assert.match(code, /from "react"/);
    assert.match(code, /style\("meta", "--a", 1\)/);
    assert.match(code, /ReactDefault\.useStyle\("meta", "--b", 2\)/);
  });
});
