![LitSX](https://litsx.dev/title.svg)

[![Test](https://github.com/litsxdev/litsx/actions/workflows/test.yml/badge.svg)](https://github.com/litsxdev/litsx/actions/workflows/test.yml)
[![Release Validate](https://github.com/litsxdev/litsx/actions/workflows/release-validate.yml/badge.svg)](https://github.com/litsxdev/litsx/actions/workflows/release-validate.yml)
[![Release](https://github.com/litsxdev/litsx/actions/workflows/release.yml/badge.svg)](https://github.com/litsxdev/litsx/actions/workflows/release.yml)
[![Docs](https://img.shields.io/badge/docs-litsx.dev-0a7ea4)](https://litsx.dev/)
[![License](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](./LICENSE)

LitSX is a Lit-first compiler and tooling workspace for authoring web components with modern JSX, static hoists, and an optional React-compat migration layer.

This repository contains the runtime, Babel presets, authoring support, editor tooling, and scaffolding packages that make up the LitSX toolchain.

The documentation site lives at [`litsx.dev`](https://litsx.dev/) and is maintained from the separate [`litsxdev/litsx.dev`](https://github.com/litsxdev/litsx.dev) repository.
The VS Code extension lives in the separate [`litsxdev/vscode-litsx`](https://github.com/litsxdev/vscode-litsx) repository.

## Authored model

LitSX source is not just generic TSX with helper imports. The authored model includes:

- Lit-flavoured JSX bindings such as `@event`, `.prop`, and `?attr`
- static hoists such as `^styles(...)`, `^properties(...)`, `^shadowRootOptions(...)`, and other direct `^name(...)` declarations
- `^expose(...)` for static class methods

Generic `^name(...)` hoists lower to memoized static getters on the generated class. `^expose(...)` is the exception: it lowers to real static methods.

Because plain `tsc` does not parse this authored syntax directly, editor support comes from `@litsx/typescript-plugin` and CLI type-checking comes from `litsx-tsc`.

## Workspace layout

### Core public packages

- [`packages/litsx`](./packages/litsx): main runtime package, JSX runtime entrypoints, async boundaries, and runtime infrastructure
- [`packages/compiler`](./packages/compiler): public programmatic compilation facade
- [`packages/create-litsx-app`](./packages/create-litsx-app): project scaffolder
- [`packages/eslint-plugin-litsx`](./packages/eslint-plugin-litsx): official ESLint integration for LitSX-authored source
- [`packages/prettier-plugin-litsx`](./packages/prettier-plugin-litsx): official Prettier integration for `.litsx` and `.litsx.jsx`
- [`packages/typescript-plugin-litsx`](./packages/typescript-plugin-litsx): TypeScript language-service support for LitSX-authored JSX
- [`packages/jsx-authoring`](./packages/jsx-authoring): shared authored JSX language model and parser helpers
- [`packages/babel-parser-litsx`](./packages/babel-parser-litsx): Babel parser adapter for LitSX-authored JSX
- [`packages/light-dom-registry`](./packages/light-dom-registry): contextual light DOM registry runtime
- [`packages/vite-plugin`](./packages/vite-plugin): Vite integration

### Babel toolchain

- [`packages/babel-preset-litsx`](./packages/babel-preset-litsx): native LitSX lowering pipeline
- [`packages/babel-preset-react-compat`](./packages/babel-preset-react-compat): React compatibility lowering pipeline
- [`packages/babel-plugin-transform-litsx-scoped-elements`](./packages/babel-plugin-transform-litsx-scoped-elements): scoped elements transform that remains public as a standalone plugin
- [`packages/babel-plugin-transform-jsx-html-template`](./packages/babel-plugin-transform-jsx-html-template): JSX to Lit `html` template lowering
- [`packages/babel-plugin-litsx-proptypes`](./packages/babel-plugin-litsx-proptypes): React `prop-types` compat lowering to native property hoists

### Additional public tooling

- [`packages/babel-plugin-shared-hooks`](./packages/babel-plugin-shared-hooks): shared transform helpers consumed by the public Babel packages
- [`packages/typescript-session`](./packages/typescript-session): shared TypeScript session plumbing used by editor and type-check tooling

## Development

Install dependencies:

```sh
yarn install
```

Run the test suite:

```sh
yarn test
```

Build the workspace:

```sh
yarn build
```

## Focus

The workspace focuses on:

- native LitSX JSX ergonomics
- React compatibility as a separate transform layer
- authored syntax support for Lit-flavoured JSX and static hoists
- editor support through `@litsx/typescript-plugin`
- CLI type-checking through `litsx-tsc`
- scaffolding and editor tooling

Each package directory contains its own `README.md` with package-specific details.
