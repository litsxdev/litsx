import babelEslintParser from "@babel/eslint-parser";
import noNativeClassname from "./rules/no-native-classname.js";
import noReactMemo from "./rules/no-react-memo.js";
import rulesOfHooks from "./rules/rules-of-hooks.js";
import validComponentName from "./rules/valid-component-name.js";

const files = ["**/*.{js,jsx,mjs,cjs,ts,tsx,mts,cts}"];
const parserOptions = {
  ecmaVersion: "latest",
  sourceType: "module",
  ecmaFeatures: { jsx: true },
  requireConfigFile: false,
  babelOptions: {
    babelrc: false,
    configFile: false,
    parserOpts: {
      plugins: ["jsx", "typescript"],
    },
  },
};
const languageOptions = {
  ecmaVersion: "latest",
  sourceType: "module",
  parser: babelEslintParser,
  parserOptions,
};
const recommendedRules = {
  "@litsx/no-native-classname": "warn",
  "@litsx/no-react-memo": "warn",
  "@litsx/rules-of-hooks": "error",
  "@litsx/valid-component-name": "error",
};

const plugin = {
  meta: {
    name: "@litsx/eslint-plugin",
    version: "0.4.0",
  },
  rules: {
    "no-native-classname": noNativeClassname,
    "no-react-memo": noReactMemo,
    "rules-of-hooks": rulesOfHooks,
    "valid-component-name": validComponentName,
  },
  configs: {},
};

plugin.configs.recommended = {
  plugins: ["@litsx"],
  overrides: [{
    files,
    parser: "@babel/eslint-parser",
    parserOptions,
    rules: recommendedRules,
  }],
};

plugin.configs["recommended-flat"] = {
  name: "@litsx/recommended-flat",
  files,
  plugins: { "@litsx": plugin },
  languageOptions,
  rules: recommendedRules,
};

export default plugin;
