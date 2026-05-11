# `@litsx/ssr`

[![npm](https://img.shields.io/badge/npm-@litsx%2Fssr-CB3837)](https://www.npmjs.com/package/@litsx/ssr)
[![Release](https://img.shields.io/badge/release-public-2ea44f)](../../RELEASING.md)
[![Module](https://img.shields.io/badge/module-ESM%20%2B%20CJS-0366d6)](./package.json)
[![Provenance](https://img.shields.io/badge/npm_provenance-enabled-2ea44f)](../../RELEASING.md)

Scoped server-side rendering for LitSX.

This package renders Lit `TemplateResult`s and LitSX scoped component trees to
HTML without globally registering child components. It builds on Lit SSR for
final serialization while resolving `static elements` locally, with the same
shadowing semantics LitSX uses in the browser.

## Installation

```bash
npm install @litsx/ssr lit @litsx/core
```

If you are rendering LitSX-authored source through a build tool, you will also
need the relevant compiler integration such as
[`@litsx/vite-plugin`](../vite-plugin/README.md).

## Basic Usage

```tsx
import { renderToString } from "@litsx/ssr";
import { ProductCard } from "./ProductCard.litsx";

const result = await renderToString(
  <ProductCard .product={product} />,
);

result.html;
result.clientImports;
result.renderClientImports();
result.renderModulePreloads();
```

`renderToString(...)` returns:

- `html`: prerendered HTML, including Declarative Shadow DOM for LitSX elements
- `clientImports`: deduplicated client module imports collected from rendered
  LitSX elements
- `renderClientImports()`: `<script type="module">` tags for `clientImports`
- `renderModulePreloads()`: `<link rel="modulepreload">` tags for
  `clientImports`

## Authored Root Syntax

LitSX SSR roots preserve the authored binding model.

Use property bindings explicitly for component props:

```tsx
renderToString(<ProductCard .product={product} />);
```

Do not rely on implicit promotion from `product={product}` to
`.product={product}`. The SSR root transform keeps the authored binding
semantics intact.

## How Scoped Rendering Works

When LitSX lowers an SSR root, it wraps the generated Lit template in internal
scope metadata. The SSR runtime then:

- resolves root and nested custom elements from `static elements`
- prefers the most local matching scope when the same tag exists in parent and
  child scopes
- instantiates the LitSX element without `customElements.define(...)`
- marks the instance with SSR context so hooks run through
  `SsrEffectsController`
- delegates final HTML serialization to Lit SSR

That means:

- nested scoped LitSX elements render recursively
- `static styles` are emitted into Declarative Shadow DOM
- browser lifecycle/effect hooks do not run during SSR

## Asset Resolution

`clientImports` are collected from the generated LitSX module ids. You can
rewrite them to public URLs with `assetResolver(...)`:

```js
import { renderToString } from "@litsx/ssr";
import { createLitsxViteAssetResolver } from "@litsx/vite-plugin";

const assetResolver = createLitsxViteAssetResolver({
  root: process.cwd(),
  manifest,
  base: "/",
});

const result = await renderToString(<ProductCard .product={product} />, {
  assetResolver,
});
```

In dev, the resolver can map source module ids to `/src/...` style URLs. In
builds, it can map them through a Vite manifest to hashed asset paths.

If you want to emit those URLs directly into the SSR document:

```js
const result = await renderToString(<ProductCard .product={product} />, {
  assetResolver,
});

result.renderModulePreloads();
result.renderClientImports();
```

## Supported Input

The current API accepts:

- LitSX scoped templates
- plain Lit `TemplateResult`s
- arrays
- strings, numbers, booleans, `null`, and `undefined`

## Current Scope

This first SSR cut includes:

- scoped LitSX element rendering
- `SsrEffectsController` for SSR-safe hook execution
- Declarative Shadow DOM output
- `clientImports` collection

It does not yet include:

- hydration payload generation
- higher-level LitSX hydration payload orchestration
- module preload generation
- server-side components

For the current minimal client-side entrypoint, see
[`@litsx/ssr-client`](../ssr-client/README.md).
