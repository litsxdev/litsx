# `create-litsx-app`

[![npm](https://img.shields.io/badge/npm-create--litsx--app-CB3837)](https://www.npmjs.com/package/create-litsx-app)
[![Release](https://img.shields.io/badge/release-public-2ea44f)](../../RELEASING.md)
[![CLI](https://img.shields.io/badge/entrypoint-CLI-8250df)](./package.json)
[![Provenance](https://img.shields.io/badge/npm_provenance-enabled-2ea44f)](../../RELEASING.md)

Scaffold a new LitSX project with standard TSX, TypeScript type-checking, and the recommended Vite build setup.

Generated code follows the repository's [native authoring contract](../../AUTHORING.md).

Generated projects demonstrate:

- ordinary JSX prop names with compiler-driven Lit binding inference
- `on:event` listeners such as `on:click` and `on:primary-action`
- standard static assignments such as `Component.styles = css\`...\``
- Lit-native refs with `.value` and `undefined` cleanup
- Lit directives such as `repeat()` for keyed collection identity
- `.tsx` source checked directly by `tsc`

The official authoring posture is:

- **`.tsx`** as the primary generated source format
- **`.jsx`** as the equivalent JavaScript authoring format

The generated source is standard TSX, while the LitSX Vite plugin still performs the required Lit and web-component compilation.

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

- standard TSX source in `src/<app>.tsx`
- `on:click` event binding
- local state with `useState(...)`
- component-owned styling with `Component.styles = css\`...\``
- `eslint.config.js` wired to `@litsx/eslint-plugin`

## What It Generates

The scaffold includes:

- `vite`
- `lit`
- `@litsx/core`
- `@litsx/vite-plugin`
- `@litsx/eslint-plugin`
- `@webcomponents/scoped-custom-element-registry`
- `eslint.config.js` with `recommended-flat`
- `tsconfig.json` configured with `jsxImportSource: "@litsx/core"`
- `npm run lint` wired to `eslint .`
- `npm run format` wired to `prettier --write .`
- `npm run typecheck` wired directly to `tsc`

Depending on the selected template, it can also include:

- Storybook with the Vite builder
- MDX docs for stories
- Playwright visual tests
- starter design-system or component-library structure
- first-party Tailwind CSS or UnoCSS integration

## Usage

```bash
npx create-litsx-app my-app
npx create-litsx-app my-design-system --template design-system
npx create-litsx-app my-components --template component
npx create-litsx-app my-app-shell --template app
npx create-litsx-app my-ssr-app --template ssr
npx create-litsx-app my-tailwind-app --styles tailwind
npx create-litsx-app my-uno-system --template design-system --styles unocss
npx create-litsx-app my-design-system --template design-system --visual-tests
```

## Templates

### `app` (default)

Includes:

- the same starter home layout as the design-system scaffold
- shared hero, guide and button primitives
- no Storybook setup

### `design-system`

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

### `ssr`

Includes:

- document-first SSR with `@litsx/ssr`
- browser hydration with `@litsx/ssr/hydration`
- a local SSR dev server entry in `dev.mjs`
- a static document render entry in `render.mjs`
- a minimal authored LitSX SSR component under `src/`

## Optional Flags

### `--styles css|tailwind|unocss`

Selects the generated styling profile. `css` is the backward-compatible
default and keeps authored `Component.styles` as the primary styling surface.
`tailwind` wires `@litsx/tailwind`, Tailwind CSS 4 and the official Vite
adapter. `unocss` wires `@litsx/unocss` with the Wind 3 preset.

The selected integration is applied consistently to the app build, browser
tests, Storybook when present, and SSR development/prerendering. Generated
components include statically discoverable utility classes in the Tailwind and
UnoCSS profiles while retaining authored CSS for the starter's bespoke visual
details.

### `--visual-tests`

Adds:

- Playwright
- a visual smoke test against Storybook
- a Docker image for deterministic screenshot runs

Use this only with the design-system template, where Storybook is already present.

## Build and Tooling Model

Scaffolded projects use `@litsx/vite-plugin` as the supported compilation surface. Standard syntax removes the parser and editor setup burden; it does not remove compilation.

That is the public default for Vite-based LitSX projects.

Generated apps do not need to know about:

- LitSX Babel plugin ordering
- sourcemap chaining details

The scaffold also wires Storybook through the Vite builder, so LitSX components can be documented through standard CSF/MDX Storybook files while demos still run through the same Vite plugin integration.

For the `design-system` template, standard `*.stories.tsx` files use Storybook's normal indexer and the LitSX Vite integration registers referenced component constructors before rendering.

LitSX also ships an ESLint integration for framework-aware diagnostics:

- `@litsx/eslint-plugin`

For scaffolded projects, the supported baseline is:

- standard TypeScript and TSX editor support
- `tsc` for static checking
- `@litsx/vite-plugin` for compilation
- `@litsx/eslint-plugin` for linting

The recommended lint preset in scaffolded apps is:

- `recommended-flat`

Formatting uses standard Prettier TSX support. No LitSX-specific Prettier plugin is needed for generated projects.

## Who This Package Is For

Use `create-litsx-app` when you want:

- a fast start for a LitSX app
- the recommended Vite integration
- a known-good Storybook setup for LitSX components

If you are integrating LitSX into an existing toolchain, use:

- [`@litsx/vite-plugin`](../vite-plugin/README.md) for Vite
- [`@litsx/compiler`](../compiler/README.md) for lower-level programmatic compilation

Treat individual transform packages as advanced integration pieces rather than as the baseline app setup.
