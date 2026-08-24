![LitSX](https://litsx.dev/title.svg)

[![Test](https://github.com/litsxdev/litsx/actions/workflows/test.yml/badge.svg)](https://github.com/litsxdev/litsx/actions/workflows/test.yml)
[![Release Validate](https://github.com/litsxdev/litsx/actions/workflows/release-validate.yml/badge.svg)](https://github.com/litsxdev/litsx/actions/workflows/release-validate.yml)
[![Release](https://github.com/litsxdev/litsx/actions/workflows/release.yml/badge.svg)](https://github.com/litsxdev/litsx/actions/workflows/release.yml)
[![Docs](https://img.shields.io/badge/docs-litsx.dev-0a7ea4)](https://litsx.dev/)
[![License](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](./LICENSE)

LitSX is a Lit-first compiler and tooling workspace for authoring web components with standard JSX/TSX and an optional React-compat migration layer.

This repository contains the runtime, compiler, Babel presets, lint rules, and scaffolding packages that make up the LitSX toolchain.

The documentation site lives at [`litsx.dev`](https://litsx.dev/) and is maintained from the separate [`litsxdev/litsx.dev`](https://github.com/litsxdev/litsx.dev) repository.

## Authored model

The recommended LitSX source model is ordinary `.jsx` or `.tsx`:

- use ordinary attribute and prop names; the compiler inspects the destination API and chooses Lit attribute, boolean-attribute, or property bindings
- use `on:event` for DOM and custom-element listeners, for example `on:click` and `on:primary-action`
- attach component metadata with standard assignments such as `Button.styles = css\`...\`` and `Button.properties = {...}`
- import `css` from `@litsx/core` when declaring component styles

LitSX compilation is still required: it lowers functions and JSX to Lit elements and templates. Authored code is standard JSX/TSX and uses the normal TypeScript, editor, and formatting toolchain. The unreleased `.litsx`, `@event`, `.prop`, `?attr`, in-function `static ...`, `staticProps(...)`, and `staticStyles(...)` authoring experiments have been removed rather than carried as a compatibility surface.

The complete native syntax, binding, event, spread, ref, and identity contract is
defined in [`AUTHORING.md`](./AUTHORING.md). Treat that document as the source of
truth when updating the website documentation.

## Workspace layout

### Core public packages

- [`packages/core`](./packages/core): main runtime package, JSX runtime entrypoints, async boundaries, elements, and rendering helpers
- [`packages/compiler`](./packages/compiler): public programmatic compilation facade
- [`packages/create-litsx-app`](./packages/create-litsx-app): project scaffolder
- [`packages/eslint-plugin-litsx`](./packages/eslint-plugin-litsx): official ESLint integration for LitSX-authored source
- [`packages/authoring`](./packages/authoring): shared standard JSX semantics and internal generated-template helpers
- [`packages/scoped-registry-shim`](./packages/scoped-registry-shim): internal shimmed scoped-registry runtime used by shadow hosts and renderer mounts
- [`packages/vite-plugin`](./packages/vite-plugin): Vite integration
- [`packages/unocss`](./packages/unocss): UnoCSS integration with destination-routed document and component styles
- [`packages/tailwind`](./packages/tailwind): bundler-neutral Tailwind integration protocol plus an official Vite adapter for isolated shadow and scoped/global light DOM utilities

### Babel toolchain

- [`packages/babel-preset-litsx`](./packages/babel-preset-litsx): native LitSX lowering pipeline
- [`packages/babel-preset-react-compat`](./packages/babel-preset-react-compat): React compatibility lowering pipeline
- [`packages/babel-plugin-transform-litsx-scoped-elements`](./packages/babel-plugin-transform-litsx-scoped-elements): scoped elements transform that remains public as a standalone plugin
- [`packages/babel-plugin-transform-jsx-html-template`](./packages/babel-plugin-transform-jsx-html-template): JSX to Lit `html` template lowering
- [`packages/babel-plugin-litsx-proptypes`](./packages/babel-plugin-litsx-proptypes): React `prop-types` compat lowering to generated Lit property metadata

### Additional public tooling

- [`packages/babel-plugin-shared-hooks`](./packages/babel-plugin-shared-hooks): shared transform helpers consumed by the public Babel packages
- [`packages/typescript-session`](./packages/typescript-session): internal TypeScript session plumbing used for compiler inference

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
- standards-compatible JSX/TSX authoring with Lit binding inference
- ordinary TypeScript, editor, and formatter interoperability
- scaffolding and lint tooling

Each package directory contains its own `README.md` with package-specific details.
