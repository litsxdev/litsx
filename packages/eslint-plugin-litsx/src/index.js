import babelEslintParser from "@babel/eslint-parser";
import noDuplicateStaticHoist from "./rules/no-duplicate-static-hoist.js";
import noInvalidBindingValue from "./rules/no-invalid-binding-value.js";
import noNativeClassname from "./rules/no-native-classname.js";
import noOpaquePropMetadataInference from "./rules/no-opaque-prop-metadata-inference.js";
import noReactMemo from "./rules/no-react-memo.js";
import noReactCompatSurface from "./rules/no-react-compat-surface.js";
import noUnknownStaticHoist from "./rules/no-unknown-static-hoist.js";
import noUnknownBinding from "./rules/no-unknown-binding.js";
import preferDestructuredProps from "./rules/prefer-destructured-props.js";
import requireTopLevelHoistsFirst from "./rules/require-top-level-hoists-first.js";
import staticHoistsTopLevel from "./rules/static-hoists-top-level.js";
import { createLitsxProcessor } from "./processor.js";

const litsxProcessor = createLitsxProcessor({
  includeAuthoredDiagnostics: true,
});
const editorLitsxProcessor = createLitsxProcessor({
  includeAuthoredDiagnostics: false,
});
const recommendedRules = {};
const recommendedLintRules = {
  "@litsx/no-native-classname": "warn",
  "@litsx/no-invalid-binding-value": "error",
  "@litsx/no-unknown-binding": "warn",
  "@litsx/static-hoists-top-level": "error",
  "@litsx/no-duplicate-static-hoist": "error",
  "@litsx/no-react-memo": "warn",
};
const recommendedReactMigrationRules = {
  ...recommendedLintRules,
  "@litsx/no-react-compat-surface": "warn",
};
const strictRules = {
  ...recommendedLintRules,
  "@litsx/prefer-destructured-props": "warn",
  "@litsx/no-opaque-prop-metadata-inference": "warn",
  "@litsx/require-top-level-hoists-first": "warn",
};
const files = ["**/*.{js,jsx,mjs,cjs,ts,tsx,mts,cts,litsx}", "**/*.litsx.jsx"];
const legacyParserOptions = {
  ecmaVersion: "latest",
  sourceType: "module",
  ecmaFeatures: {
    jsx: true,
  },
  requireConfigFile: false,
  babelOptions: {
    babelrc: false,
    configFile: false,
    plugins: [
      "@babel/plugin-syntax-jsx",
      ["@babel/plugin-syntax-typescript", { isTSX: true }],
    ],
  },
};
const flatLanguageOptions = {
  ecmaVersion: "latest",
  sourceType: "module",
  parser: babelEslintParser,
  parserOptions: legacyParserOptions,
};

const plugin = {
  meta: {
    name: "@litsx/eslint-plugin",
    version: "0.1.0",
  },
  processors: {
    litsx: litsxProcessor,
    "litsx-editor": editorLitsxProcessor,
  },
  rules: {
    "no-duplicate-static-hoist": noDuplicateStaticHoist,
    "no-native-classname": noNativeClassname,
    "no-invalid-binding-value": noInvalidBindingValue,
    "no-opaque-prop-metadata-inference": noOpaquePropMetadataInference,
    "no-react-compat-surface": noReactCompatSurface,
    "no-unknown-binding": noUnknownBinding,
    "no-unknown-static-hoist": noUnknownStaticHoist,
    "prefer-destructured-props": preferDestructuredProps,
    "require-top-level-hoists-first": requireTopLevelHoistsFirst,
    "static-hoists-top-level": staticHoistsTopLevel,
    "no-react-memo": noReactMemo,
  },
  configs: {},
};

plugin.configs.recommended = {
  plugins: ["@litsx"],
  overrides: [
    {
      files,
      processor: "@litsx/litsx-editor",
      parser: "@babel/eslint-parser",
      parserOptions: legacyParserOptions,
      rules: recommendedRules,
    },
  ],
};

plugin.configs["recommended-react-migration"] = {
  plugins: ["@litsx"],
  overrides: [
    {
      files,
      processor: "@litsx/litsx",
      parser: "@babel/eslint-parser",
      parserOptions: legacyParserOptions,
      rules: recommendedReactMigrationRules,
    },
  ],
};

plugin.configs.strict = {
  plugins: ["@litsx"],
  overrides: [
    {
      files,
      processor: "@litsx/litsx",
      parser: "@babel/eslint-parser",
      parserOptions: legacyParserOptions,
      rules: strictRules,
    },
  ],
};

plugin.configs["recommended-flat"] = {
  name: "@litsx/recommended-flat",
  files,
  plugins: {
    "@litsx": plugin,
  },
  processor: "@litsx/litsx-editor",
  languageOptions: flatLanguageOptions,
  rules: recommendedRules,
};

plugin.configs["recommended-react-migration-flat"] = {
  name: "@litsx/recommended-react-migration-flat",
  files,
  plugins: {
    "@litsx": plugin,
  },
  processor: "@litsx/litsx",
  languageOptions: flatLanguageOptions,
  rules: recommendedReactMigrationRules,
};

plugin.configs["recommended-lint"] = {
  plugins: ["@litsx"],
  overrides: [
    {
      files,
      processor: "@litsx/litsx",
      parser: "@babel/eslint-parser",
      parserOptions: legacyParserOptions,
      rules: recommendedLintRules,
    },
  ],
};

plugin.configs["recommended-lint-flat"] = {
  name: "@litsx/recommended-lint-flat",
  files,
  plugins: {
    "@litsx": plugin,
  },
  processor: "@litsx/litsx",
  languageOptions: flatLanguageOptions,
  rules: recommendedLintRules,
};

plugin.configs["strict-flat"] = {
  name: "@litsx/strict-flat",
  files,
  plugins: {
    "@litsx": plugin,
  },
  processor: "@litsx/litsx",
  languageOptions: flatLanguageOptions,
  rules: strictRules,
};

export { createLitsxProcessor };
export default plugin;
