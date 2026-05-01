import assert from "assert";
import babelCore from "@babel/core";
import parser from "../packages/babel-parser-litsx/src/index.mjs";
import { beforeAll, describe, it } from "vitest";
import { interopDefault } from "./helpers/interop-default.js";

const { transformFromAstSync } = babelCore;
let plugin;

beforeAll(async () => {
  const mod = await import(
    "../packages/babel-preset-react-compat/src/internal/react-context.js"
  );
  plugin = interopDefault(mod);
});

describe("react compat internal context", () => {
  function run(code) {
    const ast = parser.parse(code, { sourceType: "module", plugins: ["jsx", "typescript"] });
    const result = transformFromAstSync(ast, code, {
      configFile: false,
      babelrc: false,
      plugins: [plugin],
      generatorOpts: { decoratorsBeforeExport: true },
    });
    return result.code;
  }

  it("rewrites aliased React context helpers and context JSX members", () => {
    const source = [
      "import React, { createContext as createCtx, useContext as consumeCtx, useMemo } from 'react';",
      "",
      "const ThemeContext = createCtx('light');",
      "",
      "export function Example() {",
      "  const memo = useMemo(() => 'ok', []);",
      "  const theme = consumeCtx(ThemeContext);",
      "  return (",
      "    <ThemeContext.Provider value={theme + memo}>",
      "      <ThemeContext.Consumer>{value => <span>{value}</span>}</ThemeContext.Consumer>",
      "    </ThemeContext.Provider>",
      "  );",
      "}",
    ].join("\n");

    const code = run(source);

    assert.match(
      code,
      /import \{ createContext as createCtx, useContext as consumeCtx, renderContext, LitsxContextProviderElement as LitsxContextProvider \} from "litsx\/context";|import \{ createContext as createCtx, useContext as consumeCtx, LitsxContextProviderElement as LitsxContextProvider, renderContext \} from "litsx\/context";|import \{ createContext as createCtx, renderContext, useContext as consumeCtx, LitsxContextProviderElement as LitsxContextProvider \} from "litsx\/context";/
    );
    assert.match(code, /import \{ useMemo \} from 'react';|import \{\s*useMemo\s*\} from "react";/);
    assert.match(code, /const ThemeContext = createContext\('light'\);/);
    assert.match(code, /const theme = useContext\(ThemeContext\);/);
    assert.match(code, /<LitsxContextProvider \.context=\{ThemeContext\} \.value=\{theme \+ memo\}>/);
    assert.match(
      code,
      /\{renderContext\(this, ThemeContext, value => <span>\{value\}<\/span>\)\}/
    );
  });

  it("supports React namespace forms and preserves host-aware useContext calls", () => {
    const source = [
      "import * as React from 'react';",
      "",
      "const ThemeContext = React.createContext('light');",
      "",
      "export function Example() {",
      "  const one = React.useContext(ThemeContext);",
      "  const two = React.useContext(this, ThemeContext);",
      "  return <ThemeContext.Provider value={one + two}><div>{one}</div></ThemeContext.Provider>;",
      "}",
    ].join("\n");

    const code = run(source);

    assert.match(code, /import \{ createContext, useContext, LitsxContextProviderElement as LitsxContextProvider \} from "litsx\/context";/);
    assert.match(code, /const ThemeContext = createContext\('light'\);/);
    assert.match(code, /const one = useContext\(ThemeContext\);/);
    assert.match(code, /const two = useContext\(this, ThemeContext\);/);
    assert.doesNotMatch(code, /React\.createContext/);
    assert.doesNotMatch(code, /React\.useContext/);
  });

  it("errors on invalid Provider shapes", () => {
    const missingValue = [
      "import { createContext } from 'react';",
      "const ThemeContext = createContext('light');",
      "export const Example = () => <ThemeContext.Provider><div /></ThemeContext.Provider>;",
    ].join("\n");

    assert.throws(() => run(missingValue), /Provider requires a value prop/);

    const spreadAttr = [
      "import { createContext } from 'react';",
      "const ThemeContext = createContext('light');",
      "export const Example = () => <ThemeContext.Provider {...props} value='dark'><div /></ThemeContext.Provider>;",
    ].join("\n");

    assert.throws(() => run(spreadAttr), /does not support spread attributes/);

    const unsupportedProp = [
      "import { createContext } from 'react';",
      "const ThemeContext = createContext('light');",
      "export const Example = () => <ThemeContext.Provider value='dark' mode='test'><div /></ThemeContext.Provider>;",
    ].join("\n");

    assert.throws(() => run(unsupportedProp), /does not support the "mode" prop/);
  });

  it("errors on invalid Consumer children", () => {
    const nonFunction = [
      "import { createContext } from 'react';",
      "const ThemeContext = createContext('light');",
      "export const Example = () => <ThemeContext.Consumer><span>bad</span></ThemeContext.Consumer>;",
    ].join("\n");

    assert.throws(() => run(nonFunction), /Consumer requires a function child/);

    const multipleChildren = [
      "import { createContext } from 'react';",
      "const ThemeContext = createContext('light');",
      "export const Example = () => <ThemeContext.Consumer>{value => <span>{value}</span>}<span>extra</span></ThemeContext.Consumer>;",
    ].join("\n");

    assert.throws(() => run(multipleChildren), /requires exactly one function child/);
  });

  it("ignores empty JSX comments around the Consumer function child", () => {
    const source = [
      "import { createContext } from 'react';",
      "const ThemeContext = createContext('light');",
      "export const Example = () => (",
      "  <ThemeContext.Consumer>",
      "    {/* leading */}",
      "    {value => <span>{value}</span>}",
      "    {/* trailing */}",
      "  </ThemeContext.Consumer>",
      ");",
    ].join("\n");

    const code = run(source);

    assert.match(code, /renderContext\(this, ThemeContext, value => <span>\{value\}<\/span>\)/);
  });

  it("preserves Provider keys and lowers Consumer to a plain call outside JSX", () => {
    const source = [
      "import { createContext } from '@litsx/react';",
      "const ThemeContext = createContext('light');",
      "export function Example() {",
      "  const rendered = <ThemeContext.Consumer>{function (value) { return <span>{value}</span>; }}</ThemeContext.Consumer>;",
      "  return <ThemeContext.Provider key={routeKey} value='dark'>{rendered}</ThemeContext.Provider>;",
      "}",
    ].join("\n");

    const code = run(source);

    assert.match(
      code,
      /import \{ createContext, renderContext, LitsxContextProviderElement as LitsxContextProvider \} from "litsx\/context";|import \{ createContext, LitsxContextProviderElement as LitsxContextProvider, renderContext \} from "litsx\/context";/
    );
    assert.match(code, /const rendered = renderContext\(this, ThemeContext, function \(value\) \{/);
    assert.match(code, /<LitsxContextProvider \.context=\{ThemeContext\} key=\{routeKey\} \.value=\{"dark"\}>/);
  });

  it("errors on unsupported displayName and class contextType usage", () => {
    const displayNameSource = [
      "import { createContext } from 'react';",
      "const ThemeContext = createContext('light');",
      "ThemeContext.displayName = 'Theme';",
    ].join("\n");

    assert.throws(() => run(displayNameSource), /displayName is not supported/);

    const computedDisplayNameSource = [
      "import { createContext } from 'react';",
      "const ThemeContext = createContext('light');",
      "ThemeContext['displayName'] = 'Theme';",
    ].join("\n");

    assert.throws(() => run(computedDisplayNameSource), /displayName is not supported/);

    const classPropertySource = [
      "import { createContext } from 'react';",
      "const ThemeContext = createContext('light');",
      "class Example {",
      "  static contextType = ThemeContext;",
      "}",
    ].join("\n");

    assert.throws(() => run(classPropertySource), /contextType is not supported/);

    const assignmentSource = [
      "import { createContext } from 'react';",
      "const ThemeContext = createContext('light');",
      "class Example {}",
      "Example.contextType = ThemeContext;",
    ].join("\n");

    assert.throws(() => run(assignmentSource), /contextType is not supported/);
  });
});
