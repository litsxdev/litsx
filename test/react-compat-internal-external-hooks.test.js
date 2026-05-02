import assert from "assert";
import * as babelCore from "@babel/core";
import jsxPluginModule from "@babel/plugin-syntax-jsx";
import parser from "../packages/babel-parser-litsx/src/index.mjs";
import { beforeAll, describe, it } from "vitest";
import { interopDefault } from "./helpers/interop-default.js";
import { reactUseState } from "../packages/babel-preset-react-compat/src/internal/react-shared-hooks.js";

const { transformFromAstSync } = babelCore;
const JSX_PLUGIN = interopDefault(jsxPluginModule);
let useStatePlugin;
let effectsPlugin;

beforeAll(async () => {
  const effectsMod = await import("../packages/babel-preset-react-compat/src/internal/react-hooks.js");
  useStatePlugin = reactUseState;
  effectsPlugin = interopDefault(effectsMod);
});

function runTransform(source, options = {}) {
  const ast = parser.parse(source, { sourceType: "module", plugins: ["jsx"] });
  const result = transformFromAstSync(ast, source, {
    configFile: false,
    babelrc: false,
    plugins: [JSX_PLUGIN, effectsPlugin, useStatePlugin],
    ...options,
  });
  return result.code;
}

describe("react compat internal external hooks", () => {
  it("rewrites a module that exports custom hooks and their consumers", () => {
    const hooksSource = [
      "import { useState } from 'react';",
      "",
      "export function useCounter(initial) {",
      "  const [count, setCount] = useState(initial);",
      "  return [count, setCount];",
      "}",
      "",
      "export const useAlias = (initial = 0) => {",
      "  const [value, setValue] = useCounter(initial + 1);",
      "  return { value, setValue };",
      "};",
      "",
      "export default function useDefault(initial = 0) {",
      "  const [state, setState] = useState(initial);",
      "  return [state, setState];",
      "}",
    ].join("\n");

    const hooksCode = runTransform(hooksSource, {
      plugins: [JSX_PLUGIN, effectsPlugin, useStatePlugin],
    });

    assert.match(hooksCode, /export function useCounter\(_[A-Za-z0-9]+, initial\)/);
    assert.match(hooksCode, /useState\(_[A-Za-z0-9]+, initial\);/);
    assert.match(
      hooksCode,
      /const \[value, setValue\] = useCounter\(_[A-Za-z0-9]+, initial \+ 1\);/
    );
    assert.match(
      hooksCode,
      /export default function useDefault\(_[A-Za-z0-9]+, initial\s*=\s*0\)/
    );
    assert.doesNotMatch(hooksCode, /from 'react';?/);

    const consumerSource = [
      "import { LitElement, html } from 'lit';",
      "import useDefault, { useCounter, useAlias } from './hooks.js';",
      "import * as hooks from './hooks.js';",
      "",
      "function useExternal(initial) {",
      "  const [value, setValue] = useCounter(initial);",
      "  return { value, setValue };",
      "}",
      "",
      "class DemoCounter extends LitElement {",
      "  render() {",
      "    const [primary] = useCounter(0);",
      "    const [secondary] = useDefault(1);",
      "    const aliasResult = useAlias(2);",
      "    const [namespaced] = hooks.useCounter(3);",
      "    const namespacedAlias = hooks.useAlias(4);",
      "    const external = useExternal(5);",
      "    return html`${primary}${secondary}${aliasResult.value}${namespaced}${namespacedAlias.value}${external.value}`;",
      "  }",
      "}",
    ].join("\n");

    const consumerCode = runTransform(consumerSource, {
      generatorOpts: { decoratorsBeforeExport: true },
    });

    assert.match(consumerCode, /prepareEffects\(this\);/);
    assert.match(consumerCode, /const \[primary\] = useCounter\(this, 0\);/);
    assert.match(consumerCode, /const \[secondary\] = useDefault\(this, 1\);/);
    assert.match(consumerCode, /const aliasResult = useAlias\(this, 2\);/);
    assert.match(consumerCode, /hooks\.useCounter\(this, 3\);/);
    assert.match(consumerCode, /hooks\.useAlias\(this, 4\);/);
    assert.match(consumerCode, /function useExternal\(_[A-Za-z0-9]+, initial\)/);
    assert.match(consumerCode, /useCounter\(_[A-Za-z0-9]+, initial\);/);
  });

  it("supports modules that only export custom hooks", () => {
    const hooksSource = [
      "import { useState } from 'react';",
      "",
      "export function useSpinner(initial = false) {",
      "  const [active, setActive] = useState(initial);",
      "  return { active, setActive };",
      "}",
      "",
      "export const useToggle = (initial = false) => {",
      "  const [on, setOn] = useState(initial);",
      "  return [on, () => setOn((prev) => !prev)];",
      "};",
      "",
      "export const useAliasToggle = useToggle;",
      "",
      "export function useComposite(initial = 0) {",
      "  const [value, setValue] = useToggle(initial);",
      "  const [derived] = useToggle(value);",
      "  return { value, derived, setValue };",
      "}",
      "",
      "export const useNamespace = { useSpinner, useToggle };",
      "",
      "export { useSpinner as renamedSpinner };",
    ].join("\n");

    const hooksCode = runTransform(hooksSource);

    assert.match(
      hooksCode,
      /export function useSpinner\(_[A-Za-z0-9]+, initial\s*=\s*false\)/
    );
    assert.match(hooksCode, /useState\(_[A-Za-z0-9]+, initial\);/);
    assert.match(
      hooksCode,
      /export const useToggle = \(_[A-Za-z0-9]+, initial\s*=\s*false\) =>/
    );
    assert.match(hooksCode, /useToggle\(_[A-Za-z0-9]+/);
    assert.match(hooksCode, /export const useAliasToggle = useToggle;/);
    assert.match(
      hooksCode,
      /export function useComposite\(_[A-Za-z0-9]+, initial\s*=\s*0\)/
    );
    assert.match(
      hooksCode,
      /const \[value, setValue\] = useToggle\(_[A-Za-z0-9]+, initial\);/
    );
    assert.match(
      hooksCode,
      /const \[derived\] = useToggle\(_[A-Za-z0-9]+, value\);/
    );
    assert.match(
      hooksCode,
      /export const useNamespace = \{\s*useSpinner,\s*useToggle\s*\};/
    );
    assert.match(hooksCode, /export \{ useSpinner as renamedSpinner \};/);
  });
});
