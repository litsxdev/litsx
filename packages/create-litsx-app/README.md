# `create-litsx-app`

[![npm](https://img.shields.io/badge/npm-create--litsx--app-CB3837)](https://www.npmjs.com/package/create-litsx-app)
[![Release](https://img.shields.io/badge/release-public-2ea44f)](../../RELEASING.md)
[![CLI](https://img.shields.io/badge/entrypoint-CLI-8250df)](./package.json)
[![Provenance](https://img.shields.io/badge/npm_provenance-enabled-2ea44f)](../../RELEASING.md)

Scaffold a new LitSX project with the recommended editor, type-checking, and Vite build setup.

Generated projects come preconfigured for authored LitSX syntax such as:

- `@click`
- `.prop`
- `?attr`
- static hoists like `^styles(...)`

The official authoring posture is:

- **`.litsx`** as the primary authored source format
- **`.litsx.jsx`** as the explicit JavaScript variant
- plain `.jsx` / `.tsx` remain supported as compatibility paths

So the scaffold uses LitSX-authored source directly instead of treating JSX/TSX as the primary product surface.

## Installation

Run it directly with your package manager of choice:

```bash
npx create-litsx-app my-app
pnpm create litsx-app my-app
yarn create litsx-app my-app
```

## Shortest Path

If you just want the fastest route to a running LitSX app, start with the `app`
template:

```bash
npx create-litsx-app my-app --template app
cd my-app
npm install
npm run dev
```

That path gives you the smallest scaffold with:

- authored LitSX source in `src/<app>.litsx`
- `@click` event binding
- local state with `useState(...)`
- component-owned styling with `^styles(...)`
- `eslint.config.js` wired to `@litsx/eslint-plugin`

## What It Generates

The scaffold includes:

- `vite`
- `litsx`
- `vscode-litsx` as the intended VS Code extension companion
- `@litsx/vite-plugin`
- `@litsx/eslint-plugin`
- `@litsx/typescript-plugin`
- `eslint.config.js` with `recommended-flat`
- `prettier.config.js` wired to `prettier-plugin-litsx`
- `jsconfig.json` configured with `jsxImportSource: "litsx"` and arbitrary-extension imports enabled
- `npm run lint` wired to `eslint .`
- `npm run format` wired to `prettier --write .`
- `npm run typecheck` wired to `litsx-tsc -p jsconfig.json --noEmit`
- `.vscode/settings.json` to keep the workspace aligned with LitSX until the editor extension can cover those defaults by itself

Depending on the selected template, it can also include:

- Storybook with the Vite builder
- MDX docs for stories
- Playwright visual tests
- starter design-system or component-library structure

## Usage

```bash
npx create-litsx-app my-app
npx create-litsx-app my-design-system --template design-system
npx create-litsx-app my-components --template component
npx create-litsx-app my-app-shell --template app
npx create-litsx-app my-design-system --template design-system --visual-tests
```

## Templates

### `design-system` (default)

Includes:

- Storybook for web components
- MDX story docs
- starter design-system components
- shared design tokens

### `component`

Includes:

- component-library structure under `src/components`
- shared design tokens
- no Storybook setup

### `app`

Includes:

- a lighter Vite application scaffold
- runtime wiring only
- no Storybook setup

## Optional Flags

### `--visual-tests`

Adds:

- Playwright
- a visual smoke test against Storybook
- a Docker image for deterministic screenshot runs

Use this only with the design-system template, where Storybook is already present.

## Build and Tooling Model

Scaffolded projects use `@litsx/vite-plugin` as the supported compilation surface.

That is the public default for Vite-based LitSX projects.

That means generated apps do not need to know about:

- `@litsx/babel-parser`
- LitSX Babel plugin ordering
- sourcemap chaining details

The scaffold also wires Storybook through the Vite builder, so LitSX authored stories and demo components run through the same Vite plugin integration.

## Why the Scaffold Uses `.litsx`

Plain `tsc` still does not parse LitSX-authored forms such as `@click` or `^styles(...)` natively, and VS Code's built-in JSX grammars do not understand LitSX-authored attrs and hoists cleanly.

That is why generated projects use:

- `jsconfig.json` for editor support
- `@litsx/typescript-plugin` for language-service features
- `litsx-tsc` for CLI type-checking
- `vscode-litsx` for authored grammar/highlighting

This keeps the developer experience aligned with LitSX syntax while giving LitSX its own authored source format instead of patching standard JSX in place.

LitSX ships an official ESLint integration for authored syntax such as `@click`, `.value`, and `^styles(...)`:

- `@litsx/eslint-plugin`

For scaffolded projects, the supported baseline is therefore:

- `vscode-litsx` for highlighting and VS Code defaults
- `@litsx/typescript-plugin` in the editor
- `litsx-tsc` for authored static checking
- `@litsx/vite-plugin` for compilation
- `@litsx/eslint-plugin` for linting

The recommended lint preset in scaffolded apps is the editor-friendly one:

- `recommended-flat`

Use `recommended-lint-flat` instead if you want ESLint to repeat LitSX semantic checks in CI or editor linting.

Formatting is part of the baseline:

- `prettier`
- `prettier-plugin-litsx`

The scaffold wires `prettier-plugin-litsx` only for the official authored
formats:

- `*.litsx`
- `*.litsx.jsx`

That keeps the formatting story aligned with the official source extensions
instead of silently claiming support for every JSX-bearing compatibility file.

## Who This Package Is For

Use `create-litsx-app` when you want:

- a fast start for a LitSX app
- the recommended Vite integration
- a known-good Storybook setup for LitSX components

If you are integrating LitSX into an existing toolchain, use:

- [`@litsx/vite-plugin`](../vite-plugin/README.md) for Vite
- [`@litsx/compiler`](../compiler/README.md) for lower-level programmatic compilation

Treat individual parser and transform packages as advanced integration pieces rather than as the baseline app setup.
