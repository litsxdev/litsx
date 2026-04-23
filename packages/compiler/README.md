# `@litsx/compiler`

Build-facing LitSX compilation facade.

Use this package when you need to compile authored LitSX source programmatically and want the correct compilation pipeline applied by default:

- LitSX-authored source virtualization and AST remapping
- LitSX Babel transforms in the supported order
- virtualization sourcemap chaining
- final Lit template sourcemap patching

For Vite apps and Storybook setups using the Vite builder, prefer [`@litsx/vite-plugin`](../vite-plugin/README.md).

For raw Babel-native integration without the compiler facade, prefer [`@litsx/babel-preset-litsx`](../babel-preset-litsx/README.md).

## Installation

```bash
npm install @litsx/compiler
```

Typical consumers also need the runtime packages used by their compiled output, such as `lit`, `litsx`, and `@open-wc/scoped-elements`, depending on which LitSX features they use.

## What It Solves

LitSX authored JSX is not plain JSX. The compilation path needs to handle:

- Lit-style attributes such as `@click`, `.value`, and `?disabled`
- LitSX macros and authored syntax that are virtualized before parsing
- Babel plugin ordering
- sourcemap composition across virtualization and template lowering

You can wire those pieces together manually, but this package exists so callers do not need to know about:

- `getLitsxVirtualizationMetadata(...)`
- `inputSourceMap` chaining
- `patchLitAttributeSourcemap(...)`

If you do want to wire Babel directly, `@litsx/babel-preset-litsx` is the canonical source of truth for the native LitSX plugin order.

For advanced integrations that need to share LitSX virtualization and authored-input preparation without using the full compiler facade, `@litsx/compiler` also exports low-level helpers such as `prepareLitsxAuthoredInput(...)` and `ensureLitsxParserPlugins(...)`.

## Basic Usage

```js
import { transformLitsx } from "@litsx/compiler";

const source = `
  export const Counter = ({ label = "Save" }) => {
    return <button @click={save}>{label}</button>;
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

## Options

### `filename?: string`

Filename used for Babel metadata and sourcemaps. Provide this whenever possible.

### `parserPlugins?: string[]`

Additional Babel parser plugins. If omitted, `.tsx` filenames automatically enable the `typescript` parser plugin.

### `sourceMaps?: boolean`

When `true`, emits a final sourcemap aligned to the original authored source.

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

### `authoringPlugins?: unknown[]`

Additional Babel plugins applied after LitSX virtualization/parsing and before the built-in LitSX lowering pipeline.

Use this when you need to introduce extra authored syntax or conventions on top of LitSX source without patching the core preset ordering.

### `outputPlugins?: unknown[]`

Additional Babel plugins appended after the default LitSX pipeline.

Use this for bounded, consumer-specific post-processing on already-lowered output. Do not use it to replace the core LitSX transforms.

## Output Contract

The compiler always parses authored source through the standard Babel parser plus LitSX's virtualization/remap layer, and always applies the supported LitSX transform chain internally.

When `sourceMaps: true`, the returned map includes:

- the authored-to-virtual sourcemap from attribute virtualization
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
