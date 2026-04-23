# Tooling

Lit<sup>sx</sup> has its own tooling stack for authoring JSX that targets Lit and web components:

- `@litsx/vite-plugin`
- `@litsx/compiler`
- `litsx/jsx-runtime` and `litsx/jsx-dev-runtime`
- `@litsx/typescript-plugin`
- `create-litsx-app`

## Tooling Setup

The baseline setup for a project is:

- `litsx` runtime
- `@litsx/vite-plugin` for Vite-based compilation
- `@litsx/typescript-plugin`
- `jsxImportSource: "litsx"`
- `litsx-tsc` for CLI type-checking of authored Lit<sup>sx</sup> syntax
- the scaffold from `create-litsx-app`

That stack is enough to treat Lit<sup>sx</sup> as its own framework in the editor and build pipeline.

For editor DX, the important piece is `@litsx/typescript-plugin`.

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

That is why the scaffolding now exposes:

- `npm run typecheck`

Plain `tsc --noEmit` is still fine for standard TS/JSX, but it will not parse Lit<sup>sx</sup>-specific authored syntax by itself.

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
