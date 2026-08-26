# `@litsx/compiler`

[![npm](https://img.shields.io/badge/npm-@litsx%2Fcompiler-CB3837)](https://www.npmjs.com/package/@litsx/compiler)
[![Release](https://img.shields.io/badge/release-public-2ea44f)](../../RELEASING.md)
[![Module](https://img.shields.io/badge/module-ESM%20%2B%20CJS-0366d6)](./package.json)
[![Provenance](https://img.shields.io/badge/npm_provenance-enabled-2ea44f)](../../RELEASING.md)

Build-facing LitSX compilation facade.

The compiler consumes the standard source language defined by the repository's
[native authoring contract](../../AUTHORING.md).

Use this package when you need to compile standard JSX/TSX to Lit elements and templates programmatically and want the correct pipeline applied by default:

- standard Babel JSX/TSX parsing and authored-source analysis
- generated Lit-template IR reparsing and AST remapping between compiler passes
- LitSX Babel transforms in the supported order
- sourcemap chaining across compiler passes
- final Lit template sourcemap patching

For Vite apps and Storybook setups using the Vite builder, prefer [`@litsx/vite-plugin`](../vite-plugin/README.md).

For raw Babel-native integration without the compiler facade, prefer [`@litsx/babel-preset-litsx`](../babel-preset-litsx/README.md).

## Installation

```bash
npm install @litsx/compiler
```

Typical consumers also need the runtime packages used by their compiled output, such as `lit`, `@litsx/core`, and, when targeting browsers without native scoped registries, `@webcomponents/scoped-custom-element-registry`.

## What It Solves

The compilation path handles:

- ordinary JSX props with destination-aware Lit binding inference
- explicit `on:event` listeners and component static assignments
- compiler-generated Lit binding forms such as `@click`, `.value`, and `?disabled`
- Babel plugin ordering
- sourcemap composition across generated-template reparsing and template lowering

You can wire those pieces together manually, but this package exists so callers do not need to know about:

- `getLitsxVirtualizationMetadata(...)`
- `inputSourceMap` chaining
- `patchLitAttributeSourcemap(...)`

If you do want to wire Babel directly, `@litsx/babel-preset-litsx` is the canonical source of truth for the native LitSX plugin order.

The compiler's `lightDomStyles` option controls generic component-output
routing. Integration-specific destination policies, such as preflight layers
and document CSS ownership, are documented by each integration; see
[`@litsx/unocss`](../unocss/README.md#vite-api) and
[`@litsx/tailwind`](../tailwind/README.md).

For advanced integrations that need authored-input preparation without using the full compiler facade, `@litsx/compiler` also exports low-level helpers such as `prepareLitsxAuthoredInput(...)` and `ensureLitsxParserPlugins(...)`. Generated-template virtualization remains an internal compiler concern, not an authored-source parser.

## Basic Usage

```js
import { transformLitsx } from "@litsx/compiler";

const source = `
  export const Counter = ({ label = "Save" }) => {
    return <button on:click={save}>{label}</button>;
  };
`;

const result = await transformLitsx(source, {
  filename: "/src/Counter.jsx",
  sourceMaps: true,
});

console.log(result.code);
console.log(result.map);
console.log(result.metadata);
```

Synchronous usage is also available:

```js
import { transformLitsxSync } from "@litsx/compiler";

const result = transformLitsxSync(source, {
  filename: "/src/Counter.jsx",
});
```

## API

### `transformLitsx(source, options?)`

Asynchronously compiles authored LitSX source and returns:

```ts
type TransformLitsxResult = {
  code: string;
  map: object | null;
  metadata: Record<string, unknown>;
};
```

### `transformLitsxSync(source, options?)`

Synchronous equivalent of `transformLitsx(...)`.

### `createLitsxCompilationSession(options?)`

Creates a reusable compiler session for build tools that transform many modules:

```js
import { createLitsxCompilationSession } from "@litsx/compiler";

const session = createLitsxCompilationSession({
  projectPath: process.cwd(),
  transformOptions: { sourceMaps: true },
});

const result = await session.transform(source, { filename });
session.invalidate([filename]);
session.dispose();
```

The session reuses TypeScript analysis and compiler caches. Call `invalidate()`
when watched files change and `dispose()` when the build or development server
shuts down. `transformSync()` is also available on the session.

## Options

### `filename?: string`

Filename used for Babel metadata and sourcemaps. Provide this whenever possible.

### `parserPlugins?: string[]`

Additional Babel parser plugins. If omitted, `.ts`, `.mts`, `.cts`, `.tsx`,
`.mtsx`, and `.ctsx` filenames automatically enable the `typescript` parser
plugin. Vite query strings are ignored when resolving the extension.

### `requireJsx?: boolean`

Explicitly overrides whether authored-input preparation enables Babel's JSX
parser. When omitted, `.ts`, `.mts`, and `.cts` use TypeScript-only parsing;
`.jsx`, `.tsx`, `.mtsx`, and `.ctsx` enable JSX. Other extensions preserve the
previous JSX-enabled default. Set this option when a custom filename convention
needs different behavior.

### `ssr?: boolean`

Enables the SSR form of final JSX template lowering. Build integrations should
set this for their server pipeline and keep it disabled for browser output.

### `sourceMaps?: boolean`

When `true`, emits a final sourcemap aligned to the original authored source.
The emitted map keeps the original authored filename in `sources` and the
original authored JSX/TSX text in `sourcesContent`, so downstream bundlers can
chain the map without replacing DevTools source views with transformed JS.

When `false` or omitted:

- `map` is `null`
- no sourcemap chaining work is performed

### `jsxTemplate?: boolean`

Controls whether JSX is lowered to Lit template literals through `@litsx/babel-plugin-transform-jsx-html-template`.

Default: `true`

Set this to `false` only if you need the LitSX class/property transform stages without the final JSX-to-template lowering.

### `jsxTemplateOptions?: object`

Options passed directly to `@litsx/babel-plugin-transform-jsx-html-template`.

Example:

```js
const result = await transformLitsx(source, {
  filename: "/src/icon.jsx",
  jsxTemplateOptions: {
    tag: "svg",
  },
});
```

### `defaultDomMode?: "shadow" | "light"`

Selects the generated render root for native components. The default is
`"shadow"`; an explicit `Component.lightDom = true` still selects light DOM for
that component.

### `lightDomStyles?: "scoped" | "global" | "none" | { strategy: ... }`

Controls how generic style integrations route automatically generated styles
for light-DOM components:

- `scoped` is the default and emits a stable per-component scope.
- `global` lets the integration contribute those styles to a document sheet.
- `none` disables automatic component style generation.

This option does not remove authored `Component.styles`. Integrations decide
how their generated output implements the selected route; `@litsx/unocss`
supports all three modes.

### `authoringPlugins?: unknown[]`

Additional Babel plugins applied after standard JSX/TSX parsing and before the built-in LitSX lowering pipeline.

Use this when you need to introduce extra authored syntax or conventions on top of LitSX source without patching the core preset ordering.

### `reactCompat?: boolean | object`

Selects `@litsx/babel-preset-react-compat` instead of the native preset. `true` uses the compatibility defaults (`domMode: "light"` and `reactKeys: true`). The object form accepts `domMode`, `reactKeys`, and `transformDependencies`; see the [complete react-compat option reference](../babel-preset-react-compat/README.md#options).

React-compatible compilation forces `lightDomStyles: "global"` so migrated
components preserve React's document-level CSS cascade. Shadow-mode components
still receive their required local integration styles.

`jsxTemplate` and `jsxTemplateOptions` remain top-level compiler options. They control the compiler's shared final output pass after either the native or react-compat feature pipeline has run.

Build-tool integrations must ensure that every package named by `transformDependencies` is passed to the compiler in both client and SSR pipelines. `@litsx/vite-plugin` handles transformation, dependency-optimization exclusion, and SSR externalization automatically.

### `outputPlugins?: unknown[]`

Additional Babel plugins appended after the default LitSX pipeline.

Use this for bounded, consumer-specific post-processing on already-lowered output. Do not use it to replace the core LitSX transforms.

## Utility CSS integration API

`@litsx/compiler/utility-css` exposes the shared static-analysis primitives used
by the official UnoCSS and Tailwind integrations. It can collect finite utility
class candidates from component markup, resolve imported static guards, identify
dynamic class patterns, and read compiler-emitted light-DOM metadata.

This entrypoint is for CSS integration authors. Applications should install
[`@litsx/unocss`](../unocss/README.md) or
[`@litsx/tailwind`](../tailwind/README.md) instead of calling helpers such as
`collectUtilityClassCandidates()` or `createStaticGuardResolver()` directly.

## Output Contract

The compiler parses authored standard JSX/TSX directly through Babel. Internal generated templates may use Lit binding prefixes during lowering, but those prefixes are not part of the authored language.

In particular, application source uses ordinary prop names, `on:event`,
`ref={...}`, and top-level `Component.styles`/`Component.properties`
assignments. `.prop`, `?attr`, and `@event` only describe the Lit template output
chosen by the compiler.

Generated components extend inherited styles and scoped element maps. An
ordinary `Component.styles = value` becomes a Lit `static styles` group with
`super.styles` first; `Component.styles = replaceStyles(value)` explicitly
cuts that chain. Reactive properties retain Lit's own inheritance semantics,
while inferred and authored options belonging to the same component are
combined before the class is emitted.

When `sourceMaps: true`, the returned map includes:

- the transform chain sourcemap from Babel
- the final patching needed for Lit-style attributes after JSX has been lowered to `html\`\``

`metadata` is the raw Babel metadata object from the transform run. It is returned for advanced integrations, but consumers should not depend on private LitSX metadata keys unless they control the full toolchain.

## Example: Build Tool Integration

```js
import { transformLitsx } from "@litsx/compiler";

export async function compile(id, source) {
  if (!/\.(jsx|tsx)$/.test(id)) {
    return null;
  }

  const result = await transformLitsx(source, {
    filename: id,
    sourceMaps: true,
  });

  return {
    code: result.code,
    map: result.map,
  };
}
```

## Scope

This package is the low-level public facade for LitSX compilation.

It does not:

- provide a dev server
- register a Vite plugin by itself
- add non-Vite build system integrations

If you are integrating with Vite, the recommended entrypoint is `@litsx/vite-plugin`.

## Versioning and Stability

`@litsx/compiler` is intended to be the stable public entrypoint for third-party build integration.

The canonical raw-Babel entrypoint for native authored source is:

- `@litsx/babel-preset-litsx`

Lower-level packages such as:

- `@litsx/babel-preset-litsx`
- `@litsx/babel-plugin-transform-jsx-html-template`

remain usable, but they expose more internal detail and require more setup knowledge.
