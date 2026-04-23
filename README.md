# Litsx

Litsx is a Lit-oriented JSX toolkit with:

- a runtime package for authored Litsx components
- Babel transforms for native Litsx and React-compat pipelines
- a TypeScript language-service plugin for Litsx-authored JSX syntax
- a CLI type-checking path for authored Litsx syntax through `litsx-tsc`
- a project scaffolder for apps, component libraries and design systems

This repository is the Litsx workspace monorepo.

## Authored model

Litsx authored source is not just generic TSX with helper imports. The language model includes:

- Lit-flavoured JSX bindings such as `@event`, `.prop`, and `?attr`
- static hoists such as `^styles(...)`, `^properties(...)`, `^shadowRootOptions(...)`, and other direct `^name(...)` declarations
- `^expose(...)` for static class methods

Generic `^name(...)` hoists lower to memoized static getters on the generated class. `^expose(...)` is the exception: it lowers to real static methods.

Because plain `tsc` does not parse this authored syntax directly, editor support comes from `@litsx/typescript-plugin` and CLI type-checking comes from `litsx-tsc`.

## Workspace layout

### Core public packages

- [packages/litsx](/Users/rafabernad/Workspace/litsx/packages/litsx): main runtime package, JSX runtime entrypoints and native suspense primitives
- [packages/create-litsx-app](/Users/rafabernad/Workspace/litsx/packages/create-litsx-app): project scaffolder
- [packages/typescript-plugin-litsx](/Users/rafabernad/Workspace/litsx/packages/typescript-plugin-litsx): TypeScript language-service support for Litsx-authored JSX
- [packages/jsx-authoring](/Users/rafabernad/Workspace/litsx/packages/jsx-authoring): shared authored JSX language model and virtual-attribute remapping utilities
- [packages/babel-parser-litsx](/Users/rafabernad/Workspace/litsx/packages/babel-parser-litsx): Babel parser adapter for Litsx-authored JSX
- [packages/prop-types](/Users/rafabernad/Workspace/litsx/packages/prop-types): Lit-friendly prop-types runtime

### Native Litsx Babel toolchain

- [packages/babel-preset-litsx](/Users/rafabernad/Workspace/litsx/packages/babel-preset-litsx)
- [packages/babel-plugin-transform-litsx-scoped-elements](/Users/rafabernad/Workspace/litsx/packages/babel-plugin-transform-litsx-scoped-elements)
- [packages/babel-plugin-litsx-proptypes](/Users/rafabernad/Workspace/litsx/packages/babel-plugin-litsx-proptypes)
- [packages/babel-plugin-transform-jsx-html-template](/Users/rafabernad/Workspace/litsx/packages/babel-plugin-transform-jsx-html-template)

### React compatibility Babel surface

- [packages/babel-preset-react-compat](/Users/rafabernad/Workspace/litsx/packages/babel-preset-react-compat)

### Internal shared package

- [packages/shared/babel-plugin-shared-hooks](/Users/rafabernad/Workspace/litsx/packages/shared/babel-plugin-shared-hooks): shared transform helpers used by multiple Babel plugins

## Development

Install dependencies:

```sh
yarn install
```

Run the test suite:

```sh
yarn test
```

Build all public workspaces:

```sh
yarn workspaces foreach -A --no-private run build
```

## Build model

Most Babel plugin packages publish built output under `dist/`.

The workspace is configured to use `tsup` for package builds, producing:

- ESM output at `dist/index.js`
- CommonJS output at `dist/index.cjs`

## Current focus

The workspace currently prioritises:

- native Litsx JSX ergonomics
- React compatibility as a separate transform layer
- authored syntax support for Lit-flavoured JSX and static hoists
- editor support through `@litsx/typescript-plugin`
- CLI type-checking through `litsx-tsc`
- scaffolding for apps, component libraries and design systems

Each package directory contains its own `README.md` with package-specific details.
