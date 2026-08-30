# `@litsx/vite-plugin`

[![npm](https://img.shields.io/badge/npm-@litsx%2Fvite--plugin-CB3837)](https://www.npmjs.com/package/@litsx/vite-plugin)
[![Release](https://img.shields.io/badge/release-public-2ea44f)](../../RELEASING.md)
[![Module](https://img.shields.io/badge/module-ESM%20%2B%20CJS-0366d6)](./package.json)
[![Provenance](https://img.shields.io/badge/npm_provenance-enabled-2ea44f)](../../RELEASING.md)

Official Vite integration for LitSX.

The plugin compiles the standard source language defined by the repository's
[native authoring contract](../../AUTHORING.md).

This package is the recommended default for:

- Vite apps
- Storybook using the Vite builder
- any Vite-based toolchain that needs to compile JSX/TSX components through LitSX

Internally it uses [`@litsx/compiler`](../compiler/README.md), so callers do not need to wire Babel parser setup, sourcemap chaining, or Lit template sourcemap patching manually.

## Installation

```bash
npm install -D @litsx/vite-plugin vite
```

Your project will also need the usual runtime dependencies used by compiled LitSX output, such as `lit`, `@litsx/core`, and, when targeting browsers without native scoped registries, `@webcomponents/scoped-custom-element-registry`.

## Basic Usage

```js
import { defineConfig } from "vite";
import { litsx } from "@litsx/vite-plugin";

export default defineConfig({
  plugins: [litsx()],
});
```

This transforms project-local `.js`, `.jsx`, `.ts`, and `.tsx` modules before
the rest of the Vite pipeline. Processing ordinary Lit modules lets the plugin
emit hydration boundaries when a Lit template consumes a LitSX light-DOM
component. Dependencies remain excluded unless explicitly allowlisted.

When a project module imports an external native LitSX custom hook, the compiler
may verify that exact export and its transitive ESM hook graph without adding
the package to an allowlist. This bounded analysis lets the caller compile and
does not make Vite transform or scan the rest of `node_modules`. Library authors
should still publish JavaScript produced by `@litsx/compiler`; raw TypeScript
dependencies require a separate Vite integration that deliberately transpiles
them. `reactCompat.transformDependencies` remains reserved for source packages
that must actually pass through the React migration pipeline.

The same bounded analysis leaves a package export such as `useFormat(value)` as
an ordinary function when its reachable implementation is fully visible and
contains no LitSX or React hooks. Opaque and React-backed `use*` graphs retain
the external-hook diagnostic.

## What the Plugin Handles

The plugin applies the supported LitSX compilation pipeline through `@litsx/compiler`, including:

- standard JSX binding inference and `on:event` lowering
- LitSX Babel plugin ordering
- authored-source sourcemap chaining
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

- transforms project-local `.js`, `.jsx`, `.ts`, and `.tsx`
- leaves modules outside the Vite root untouched unless selected through
  `include` or `reactCompat.transformDependencies`
- limits optimize-deps compilation to authored project files; dependency,
  prebundle-cache, generated-chunk, asset, and virtual module ids are not
  treated as LitSX authoring input
- returns `{ code, map }`
- delegates compilation to `@litsx/compiler`

### `createLitsxViteAssetResolver(options?)`

Creates an `assetResolver(moduleId)` function suitable for passing to
`@litsx/ssr`.

Use it when SSR output needs stable client module URLs:

```js
import { createLitsxViteAssetResolver, litsx } from "@litsx/vite-plugin";
import { renderToString } from "@litsx/ssr";

const assetResolver = createLitsxViteAssetResolver({
  root: process.cwd(),
  manifest,
  base: "/",
});

const result = await renderToString(<ProductCard .product={product} />, {
  assetResolver,
});
```

Behavior:

- in dev, resolves source module ids under `root` to browser-facing paths
- in build, resolves those module ids through the Vite manifest when available
- falls back to the incoming `moduleId` when it cannot make the path
  project-relative

## SSR development adapter

The opt-in `@litsx/vite-plugin/ssr` entrypoint composes Vite with
`@litsx/ssr` without making the SSR package depend on a specific bundler.

```js
import { createSsrDevServer } from "@litsx/vite-plugin/ssr";

const server = await createSsrDevServer({
  root: process.cwd(),
  template: "./index.html",
  clientEntry: "./src/main.js",
  elements(loader) {
    return {
      "demo-app": async () =>
        (await loader("./src/components.tsx")).DemoApp,
    };
  },
  render({ html }) {
    return html`<demo-app .title=${"Hello SSR"}></demo-app>`;
  },
});

await server.listen();
server.printUrls();
```

This subpath requires `@litsx/ssr`, declared as an optional peer so normal
client-only Vite users do not install SSR. It owns Vite server creation,
`ssrLoadModule(...)`, LitSX SSR plugin configuration, asset resolution,
`transformIndexHtml(...)`, and development error/console presentation.

`@litsx/ssr` remains usable without Vite and accepts a generic
`loadModule(resolvedPath)` integration hook. Importing
`createSsrDevServer` from `@litsx/ssr` is no longer supported; migrate the
import to `@litsx/vite-plugin/ssr`.

## Options

`@litsx/vite-plugin` accepts all `@litsx/compiler` options except `filename`, which is supplied from the Vite module id.

### `include?: RegExp | ((id: string) => boolean)`

Controls which module ids are transformed.

Default behavior:

```js
/\.[jt]sx$/
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
    return id.endsWith(".jsx") || id.endsWith(".tsx");
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

### `defaultDomMode?: "shadow" | "light"`

Selects shadow or light DOM for native components. The default is `"shadow"`.

### `lightDomStyles?: "scoped" | "global" | "none" | { strategy: ... }`

Forwards the compiler's generic light-DOM style route to style integrations.
`scoped` emits a stable component boundary, `global` targets an
integration-owned document sheet, and `none` disables automatic generated
styles. Authored `Component.styles` remain active.

### `authoringPlugins?: unknown[]`

Extra Babel plugins applied after standard JSX/TSX parsing and before the built-in LitSX lowering pipeline.

### `outputPlugins?: unknown[]`

Extra Babel plugins appended after the built-in LitSX transform pipeline.

### `reactCompat?: boolean | object`

Selects the optional React compatibility pipeline. `true` uses its defaults: light DOM, final Lit template lowering, and React `key` compatibility enabled.

The compatibility pipeline forces generated light-DOM styles through the
`global` route, preserving React's document-level CSS semantics.

The object form accepts the compatibility options that select React-specific behavior:

| Option | Type | Default |
| --- | --- | --- |
| `domMode` | `"light" \| "shadow"` | `"light"` |
| `reactKeys` | `boolean` | `true` |
| `transformDependencies` | `string[]` | `[]` |

`jsxTemplate` and `jsxTemplateOptions` remain top-level `litsx(...)` options because final template generation belongs to the compiler integration, not specifically to React compatibility.

For example, this keeps React-compatible light DOM while compiling a React-authored hook package with the application:

```js
export default defineConfig({
  plugins: [
    litsx({
      reactCompat: {
        transformDependencies: ["resize-hooks"],
      },
    }),
  ],
});
```

Allowlisted dependency modules are transformed even when they use `.js` or `.ts`, excluded from
Vite dependency prebundling, and added to `ssr.noExternal`. The compiler follows custom-hook imports
inside each selected package, lowers supported React hooks, and reports the exact unsupported hook
boundary instead of leaving a React dispatcher call in the output.

Use `reactCompat: { domMode: "shadow" }` when migrated application components should use shadow roots. The option applies equally to Vite's client and SSR transformation pipelines. See the [`@litsx/babel-preset-react-compat` option reference](../babel-preset-react-compat/README.md#options) for detailed semantics and limitations.

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

The main entrypoint does not:

- own docs-site-specific module resolution
- provide Rollup or esbuild plugins
- replace runtime dependencies such as `lit` or `@litsx/core`
- render HTML by itself; the opt-in `/ssr` adapter composes `@litsx/ssr`

## Stability

`@litsx/vite-plugin` is the supported public integration surface for Vite-based consumers.

The underlying implementation details remain internal to `@litsx/compiler`, so consumers should not need to reproduce the LitSX Babel pipeline themselves.
