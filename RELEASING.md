# Releasing LitSX

This repository ships a single first-wave public release line at `0.1.0`.

## Release set

### npm packages

- `litsx`
- `@litsx/compiler`
- `@litsx/vite-plugin`
- `@litsx/typescript-plugin`
- `@litsx/eslint-plugin`
- `create-litsx-app`
- `prettier-plugin-litsx`
- `@litsx/playground`
- `@litsx/light-dom-registry`
- `@litsx/babel-parser`
- `@litsx/jsx-authoring`
- `@litsx/prop-types`
- `@litsx/babel-preset-litsx`
- `@litsx/babel-preset-react-compat`
- `@litsx/babel-plugin-transform-jsx-html-template`
- `@litsx/babel-plugin-transform-litsx-scoped-elements`
- `@litsx/babel-plugin-litsx-proptypes`
- `@litsx/babel-plugin-shared-hooks`

### VS Code Marketplace

- `vscode-litsx`

### Not in the first public wave

- `@litsx/vitepress`
- `@litsx/typescript-session`
- `dx-smoke-app`
- generated docs artifacts and local workspace noise

## Validation commands

Run these before publish:

```sh
yarn release:check
yarn release:smoke:scaffolds
yarn release:test
```

## Manual release checks

### npm packages

For each package in the npm release set:

- verify `npm pack --dry-run` output is clean
- verify `main`, `exports`, `files`, and `bin` point to real files in the tarball
- verify README examples match the current public surface

### `create-litsx-app`

Generate each template and verify:

- `app`
- `component`
- `design-system`

For at least one generated project per template, run:

- `install`
- `dev`
- `build`
- `lint`
- `format`
- `typecheck`

### `vscode-litsx`

Before Marketplace publish:

- build the extension bundle:
  - `yarn release:vscode:build`
- package a `.vsix`
  - `yarn release:vscode:package`
- install it into a clean VS Code profile
- verify `.litsx` highlighting
- verify `.litsx.jsx` highlighting
- verify the TSX/JSX suggestion flow
- verify the README still reflects the current TS language-service limits

## First public release notes

The first public release should communicate:

- LitSX is a Lit-first authored JSX surface for web components
- official authored files are `.litsx` and `.litsx.jsx`
- first-wave tooling includes:
  - `vscode-litsx`
  - `@litsx/typescript-plugin` and `litsx-tsc`
  - `@litsx/eslint-plugin`
  - `prettier-plugin-litsx`
  - `@litsx/vite-plugin`
  - `create-litsx-app`
- intentional limits in `0.1.0`:
  - no plain `tsx/jsx` Prettier formatting claim
  - dedicated LitSX VS Code language modes do not replace the full built-in TS service
