# Litsx

Litsx is a Lit-first compiler and tooling workspace for authoring web components with modern JSX, static hoists, and an optional React-compat migration layer.

This repository contains the runtime, Babel presets, authoring support, playground, docs tooling, and scaffolding packages that make up the LitSX toolchain.

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
- [`packages/create-litsx-app`](./packages/create-litsx-app): project scaffolder
- [`packages/typescript-plugin-litsx`](./packages/typescript-plugin-litsx): TypeScript language-service support for LitSX-authored JSX
- [`packages/jsx-authoring`](./packages/jsx-authoring): shared authored JSX language model and parser helpers
- [`packages/babel-parser-litsx`](./packages/babel-parser-litsx): Babel parser adapter for LitSX-authored JSX
- [`packages/light-dom-registry`](./packages/light-dom-registry): contextual light DOM registry runtime
- [`packages/litsx-playground`](./packages/litsx-playground): embedded playground and preview runtime
- [`packages/vite-plugin`](./packages/vite-plugin): Vite integration
- [`packages/vitepress`](./packages/vitepress): docs integration and theme helpers

### Babel toolchain

- [`packages/babel-preset-litsx`](./packages/babel-preset-litsx): native LitSX lowering pipeline
- [`packages/babel-preset-react-compat`](./packages/babel-preset-react-compat): React compatibility lowering pipeline
- [`packages/babel-plugin-transform-litsx-scoped-elements`](./packages/babel-plugin-transform-litsx-scoped-elements): scoped elements transform that remains public as a standalone plugin
- [`packages/babel-plugin-transform-jsx-html-template`](./packages/babel-plugin-transform-jsx-html-template): JSX to Lit `html` template lowering
- [`packages/babel-plugin-litsx-proptypes`](./packages/babel-plugin-litsx-proptypes): React `prop-types` compat lowering to native property hoists

### Internal shared package

- [`packages/shared/babel-plugin-shared-hooks`](./packages/shared/babel-plugin-shared-hooks): shared transform helpers used by multiple Babel pipelines

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

Build docs:

```sh
yarn docs:build
```

## Focus

The workspace currently focuses on:

- native LitSX JSX ergonomics
- React compatibility as a separate transform layer
- authored syntax support for Lit-flavoured JSX and static hoists
- editor support through `@litsx/typescript-plugin`
- CLI type-checking through `litsx-tsc`
- scaffolding, playground tooling, and docs infrastructure

Each package directory contains its own `README.md` with package-specific details.
