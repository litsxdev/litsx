# `create-litsx-app`

Scaffold a new LitSX project with the recommended editor, type-checking, and Vite build setup.

Generated projects are JavaScript-first and come preconfigured for authored LitSX syntax such as:

- `@click`
- `.prop`
- `?attr`
- static hoists like `^styles(...)`

## Installation

Run it directly with your package manager of choice:

```bash
npx create-litsx-app my-app
pnpm create litsx-app my-app
yarn create litsx-app my-app
```

## What It Generates

The scaffold includes:

- `vite`
- `litsx`
- `@litsx/vite-plugin`
- `@litsx/typescript-plugin`
- `jsconfig.json` configured with `jsxImportSource: "litsx"`
- `npm run typecheck` wired to `litsx-tsc -p jsconfig.json --noEmit`

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

## Why the Scaffold Is JavaScript-First

Plain `tsc` still does not parse LitSX-authored forms such as `@click` or `^styles(...)` natively.

That is why generated projects use:

- `jsconfig.json` for editor support
- `@litsx/typescript-plugin` for language-service features
- `litsx-tsc` for CLI type-checking

This keeps the developer experience aligned with LitSX syntax without requiring a custom TypeScript source format.

## Who This Package Is For

Use `create-litsx-app` when you want:

- a fast start for a LitSX app
- the recommended Vite integration
- a known-good Storybook setup for LitSX components

If you are integrating LitSX into an existing toolchain, use:

- [`@litsx/vite-plugin`](../vite-plugin/README.md) for Vite
- [`@litsx/compiler`](../compiler/README.md) for lower-level programmatic compilation

Treat individual parser and transform packages as advanced integration pieces rather than as the baseline app setup.
