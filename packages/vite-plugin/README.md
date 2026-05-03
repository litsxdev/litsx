# `@litsx/vite-plugin`

[![npm](https://img.shields.io/badge/npm-@litsx%2Fvite--plugin-CB3837)](https://www.npmjs.com/package/@litsx/vite-plugin)
[![Release](https://img.shields.io/badge/release-public-2ea44f)](../../RELEASING.md)
[![Module](https://img.shields.io/badge/module-ESM%20%2B%20CJS-0366d6)](./package.json)
[![Provenance](https://img.shields.io/badge/npm_provenance-enabled-2ea44f)](../../RELEASING.md)

Official Vite integration for LitSX.

This package is the recommended default for:

- Vite apps
- Storybook using the Vite builder
- any Vite-based toolchain that needs to compile authored LitSX source

Internally it uses [`@litsx/compiler`](../compiler/README.md), so callers do not need to wire Babel parser setup, sourcemap chaining, or Lit template sourcemap patching manually.

## Installation

```bash
npm install -D @litsx/vite-plugin vite
```

Your project will also need the usual runtime dependencies used by compiled LitSX output, such as `lit`, `@litsx/litsx`, and, when targeting browsers without native scoped registries, `@webcomponents/scoped-custom-element-registry`.

## Basic Usage

```js
import { defineConfig } from "vite";
import { litsx } from "@litsx/vite-plugin";

export default defineConfig({
  plugins: [litsx()],
});
```

This transforms authored `.jsx` and `.tsx` modules before the rest of the Vite pipeline.

## What the Plugin Handles

The plugin applies the supported LitSX compilation pipeline through `@litsx/compiler`, including:

- `@litsx/babel-parser`
- LitSX Babel plugin ordering
- virtualization sourcemap chaining
- final Lit-style attribute sourcemap patching

That means Vite consumers do not need to know about:

- `getLitsxVirtualizationMetadata(...)`
- `inputSourceMap`
- `patchLitAttributeSourcemap(...)`

## API

### `litsx(options?)`

Returns a Vite plugin with:

- `name: "litsx"`
- `enforce: "pre"`

Default behavior:

- transforms `.jsx`, `.tsx`, `.litsx`, and `.litsx.jsx`
- returns `{ code, map }`
- delegates compilation to `@litsx/compiler`

## Options

`@litsx/vite-plugin` accepts all `@litsx/compiler` options except `filename`, which is supplied from the Vite module id.

### `include?: RegExp | ((id: string) => boolean)`

Controls which module ids are transformed.

Default behavior:

```js
/\.(jsx|tsx|litsx)$/
```

Examples:

```js
litsx({
  include: /\.demo$/,
});
```

```js
litsx({
  include(id) {
    return id.endsWith(".jsx") || id.endsWith(".tsx") || id.endsWith(".litsx");
  },
});
```

### `sourceMaps?: boolean`

Enables sourcemap emission from the compiler facade.

Example:

```js
export default defineConfig({
  plugins: [
    litsx({
      sourceMaps: true,
    }),
  ],
});
```

### `parserPlugins?: string[]`

Extra parser plugins forwarded to `@litsx/compiler`.

`.tsx` files automatically enable the TypeScript parser plugin when no explicit parser plugin list is provided.

### `jsxTemplate?: boolean`

Controls whether JSX is lowered to Lit template literals.

Default: `true`

### `jsxTemplateOptions?: object`

Forwarded to `@litsx/babel-plugin-transform-jsx-html-template`.

### `authoringPlugins?: unknown[]`

Extra Babel plugins applied after LitSX virtualization/parsing and before the built-in LitSX lowering pipeline.

### `outputPlugins?: unknown[]`

Extra Babel plugins appended after the built-in LitSX transform pipeline.

## Storybook Example

For `@storybook/web-components-vite`:

```js
import { litsx } from "@litsx/vite-plugin";

export default {
  framework: "@storybook/web-components-vite",
  stories: ["../src/**/*.stories.@(js|jsx|mdx)", "../src/**/*.docs.mdx"],
  async viteFinal(config) {
    return {
      ...config,
      plugins: [...(config.plugins ?? []), litsx()],
    };
  },
};
```

## When to Use `@litsx/compiler` Instead

Use `@litsx/compiler` directly when:

- you are writing a custom build tool integration
- you need programmatic compilation outside Vite
- you need direct access to compilation `metadata`

If you are already on Vite, `@litsx/vite-plugin` should be the default choice.

## Scope

This package only provides Vite integration.

It does not:

- own docs-site-specific module resolution
- provide Rollup or esbuild plugins
- replace runtime dependencies such as `lit` or `litsx`

## Stability

`@litsx/vite-plugin` is the supported public integration surface for Vite-based consumers.

The underlying implementation details remain internal to `@litsx/compiler`, so consumers should not need to reproduce the LitSX Babel pipeline themselves.
