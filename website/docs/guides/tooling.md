# Tooling

Lit<sup>sx</sup> has its own tooling stack for authoring JSX that targets Lit and web components:

- `@litsx/vite-plugin`
- `@litsx/compiler`
- `@litsx/litsx/jsx-runtime` and `@litsx/litsx/jsx-dev-runtime`
- `vscode-litsx`
- `@litsx/typescript-plugin`
- `create-litsx-app`

## Tooling Setup

The baseline setup for a project is:

- `litsx` runtime
- `@litsx/vite-plugin` for Vite-based compilation
- `vscode-litsx` for editor highlighting and workspace defaults
- `@litsx/typescript-plugin`
- `jsxImportSource: "@litsx/litsx"`
- `litsx-tsc` for CLI type-checking of authored Lit<sup>sx</sup> syntax
- the scaffold from `create-litsx-app`

The official authored source extensions are:

- `*.litsx`
- `*.litsx.jsx`

This is not just branding. VS Code's built-in JSX grammars still treat Lit<sup>sx</sup>
authored attributes such as `@click`, `.value`, and `?disabled` as illegal tokens,
so the official editor path uses dedicated Lit<sup>sx</sup> language modes instead of
trying to patch `typescriptreact` or `javascriptreact`.

That stack is enough to treat Lit<sup>sx</sup> as its own framework in the editor and build pipeline.

For editor DX, the stack is split intentionally:

- `vscode-litsx` for syntax highlighting and VS Code defaults
- `@litsx/typescript-plugin` for hover, completions, diagnostics, and rename

For `tsx` and `jsx` files, `vscode-litsx` does not hijack the standard VS Code
language mode globally. Instead, it allows the LitSX language modes to be
selected manually and can suggest switching when Lit<sup>sx</sup>-authored
syntax is detected in a `typescriptreact` or `javascriptreact` document.

For app builds on Vite, the public compilation surface is `@litsx/vite-plugin`.

For lower-level programmatic compilation outside Vite, the public facade is `@litsx/compiler`.

Packages such as `@litsx/babel-parser` and the individual Babel transforms are still available, but they belong to advanced integrations and infrastructure work rather than to the normal baseline setup for applications.

For CLI type-checking, use the virtualized entrypoint instead of plain `tsc` when the codebase includes Lit<sup>sx</sup>-specific authored syntax such as:

- `@event`
- `.prop`
- `?attr`
- `^name(...)`

Typical scaffolded usage:

```sh
litsx-tsc -p jsconfig.json --noEmit
```

That is why the scaffolding exposes:

- `npm run typecheck`

Plain `tsc --noEmit` is still fine for standard TS/JSX, but it will not parse Lit<sup>sx</sup>-specific authored syntax by itself, including files such as `*.litsx`.

That split is deliberate:

- editor DX comes from `@litsx/typescript-plugin`
- CLI type-checking for authored Lit<sup>sx</sup> syntax comes from `litsx-tsc`
- Vite compilation comes from `@litsx/vite-plugin`
- lower-level compilation comes from `@litsx/compiler`

The important thing is that tooling is not just parsing JSX. It also understands the authored contract of the framework:

- prop types drive generated Lit property descriptors
- `^properties(...)` refines those descriptors
- `^styles(...)` is treated as static component CSS
- `^name(...)` hoists are validated as top-level-only component statements
- `useStyle(...)` stays in the dynamic runtime surface

Type declarations also carry the native styling helpers, so editor tooling can distinguish:

- `useStyle("--panel-gap", value)`
- `useStyle("--panel-gap", () => value, [deps])`

That means the editor can catch the computed form when the dependency array is missing.

The TypeScript-aware transform also uses prop types as the source of truth for generated Lit property descriptors. That is what lets Lit<sup>sx</sup> infer class property metadata from authored props and then merge `^properties(...)` on top when needed.

When the compiler has to recover property metadata from opaque member access like `props.title`, it still emits a usable descriptor, but it also records a warning in transform metadata (`metadata.litsxWarnings`) so tooling can surface that the fallback inference was weaker than a typed or destructured signature.

In other words, the build pipeline is responsible for preserving the Lit<sup>sx</sup> programming model, not just for emitting valid JavaScript.

## Linting And Formatting

Lit<sup>sx</sup> ships an official ESLint integration:

- `@litsx/eslint-plugin`

The current shape is intentionally processor-first:

- authored Lit<sup>sx</sup> source is virtualized before ESLint parses it
- findings are remapped back to the original source positions
- Lit<sup>sx</sup>-specific semantic rules run with normal ESLint rule ids

The recommended linting baseline is:

- `vscode-litsx` for syntax highlighting and workspace defaults
- `@litsx/typescript-plugin` for editor understanding
- `litsx-tsc` for authored type-checking
- `@litsx/vite-plugin` for compilation
- `@litsx/eslint-plugin` for linting

The plugin covers authored forms such as:

- `@event`
- `.prop`
- `?attr`
- `^name(...)`

and includes rules such as:

- `@litsx/no-native-classname`
- `@litsx/no-invalid-binding-value`
- `@litsx/no-unknown-binding`
- `@litsx/static-hoists-top-level`
- `@litsx/no-react-memo`
- `@litsx/no-duplicate-static-hoist`

The plugin also ships multiple presets:

- `plugin:@litsx/recommended`
- `plugin:@litsx/recommended-react-migration`
- `plugin:@litsx/strict`

and flat-config equivalents:

- `configs["recommended-flat"]`
- `configs["recommended-lint-flat"]`
- `configs["recommended-react-migration-flat"]`
- `configs["strict-flat"]`

The intended split is:

- `recommended`
  - editor-friendly baseline
  - avoids duplicating inline feedback already provided by `@litsx/typescript-plugin`
- `recommended-lint`
  - enables Lit<sup>sx</sup> semantic lint rules directly in ESLint
  - useful for CI or teams that want the same checks enforced by lint

## What Comes From Where

- Syntax highlighting and VS Code defaults: `vscode-litsx`
- Hover, completion, diagnostics, rename, definition: `@litsx/typescript-plugin`
- Lint and policy enforcement: `@litsx/eslint-plugin`
- Authored CLI type-checking: `litsx-tsc`
- Compilation: `@litsx/vite-plugin`

Formatting has an official starting point:

- `prettier-plugin-litsx`

The v1 surface is intentionally narrow:

- `*.litsx`
- `*.litsx.jsx`

It preserves Lit<sup>sx</sup>-authored syntax directly and formats static
`^styles(\`...\`)` templates as CSS. Plain `tsx/jsx` compatibility formatting remains
intentionally out of scope in this first pass.

So the authoritative story today is:

- use the ESLint plugin for linting
- use `litsx-tsc` and the compiler toolchain for authored correctness
- use `prettier-plugin-litsx` for official authored-source formatting

## Public Surfaces

Most users only need these public entrypoints:

- `@litsx/vite-plugin` for Vite and Storybook-with-Vite setups
- `@litsx/compiler` for custom programmatic compilation
- `@litsx/typescript-plugin` for editor support
- `create-litsx-app` for the recommended starting point

Treat parser internals and individual transform packages as advanced building blocks, not as the default setup to wire by hand.

## Legacy Compatibility

If you are migrating an existing React codebase, you can add the React compatibility transforms on top of the native Lit<sup>sx</sup> tooling.

The canonical Babel entrypoint for that layer is:

- `@litsx/babel-preset-react-compat`

That preset handles the React-shaped migration surface and lowers it into native Lit<sup>sx</sup> JSX/runtime primitives.
Most React lowering stages are internal to the preset. The supported React migration surface is the preset itself.

That does not change the execution model:

- components still compile to Lit-compatible output
- the runtime target is still web components
- React stays as an authored compatibility layer, not as the runtime

For component libraries and design systems, the scaffold can also wire:

- Storybook
- MDX docs
- Playwright-based visual testing in a containerized flow

## Documentation Generation

This documentation site is intentionally mixed:

- guides are handwritten
- API pages are generated from package metadata and public entry files
- example walkthroughs are curated under `website/docs/examples/`
- transform pages are derived from the transform test suites

That keeps the docs close to the code and reduces duplication.

## Next

- [Getting Started](../getting-started.md)
- [Property Inference](./property-inference.md)
- [Examples](../examples/)
