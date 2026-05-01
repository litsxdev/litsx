export const RELEASE_VERSION = "0.1.0";

export const npmReleasePackages = [
  "packages/litsx",
  "packages/compiler",
  "packages/vite-plugin",
  "packages/typescript-plugin-litsx",
  "packages/eslint-plugin-litsx",
  "packages/create-litsx-app",
  "packages/prettier-plugin-litsx",
  "packages/litsx-playground",
  "packages/light-dom-registry",
  "packages/babel-parser-litsx",
  "packages/jsx-authoring",
  "packages/prop-types",
  "packages/babel-preset-litsx",
  "packages/babel-preset-react-compat",
  "packages/babel-plugin-transform-jsx-html-template",
  "packages/babel-plugin-transform-litsx-scoped-elements",
  "packages/babel-plugin-litsx-proptypes",
  "packages/shared/babel-plugin-shared-hooks",
];

export const vscodeReleasePackage = "packages/vscode-litsx";

export const excludedPrivatePackages = [
  "packages/vitepress",
  "packages/shared/typescript-session",
  "packages/dx-smoke-app",
];
