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

## Current Scope

SSR v1 is designed around LitSX-authored components and LitSX runtime
primitives.

- LitSX-authored components participate fully in the scoped SSR and hydration
  pipeline
- plain Lit templates are supported as render input
- third-party Lit components are not yet treated as full LitSX SSR components
  unless they are part of the LitSX-authored tree model

In practice, that means you can render arbitrary Lit templates, but the
documented SSR guarantees in this package apply to LitSX-authored component
trees. Support for third-party Lit components with their own light/shadow DOM
semantics is intentionally out of scope for this first iteration.

## Installation

```bash
npm install @litsx/ssr lit @litsx/core
```

If you are rendering LitSX-authored source through a build tool, you will also
need the relevant compiler integration such as
[`@litsx/vite-plugin`](../vite-plugin/README.md).

## Basic Usage

For full HTML documents, use `renderDocument(...)`:

```tsx
import { renderDocument } from "@litsx/ssr";
import { ProductCard } from "./ProductCard.litsx";

const result = await renderDocument(<ProductCard .product={product} />, {
  title: "Product Page",
  bootstrap: "/src/main.js",
});

result.document;
result.html;
result.hydrationData;
```

`renderDocument(...)` wraps the rendered fragment in a complete HTML document,
emits module preloads and hydration data, and can inject a configurable client
bootstrap script.

For lower-level integrations, `renderToString(...)` remains available:

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
- `hydrationData`: LitSX root-boundary metadata plus root payload, state
  payload, and client imports when scoped LitSX roots are rendered, otherwise
  `null`
- `renderClientImports()`: `<script type="module">` tags for `clientImports`
- `renderClientImportsData()`: a JSON script tag readable by
  `@litsx/ssr-client`
- `renderModulePreloads()`: `<link rel="modulepreload">` tags for
  `clientImports`
- `renderHydrationData()`: a JSON hydration-payload script tag for scoped LitSX
  roots; empty for non-LitSX roots

For streaming responses, use `renderToStream(...)`:

```tsx
import { renderToStream } from "@litsx/ssr";

const { stream, allReady } = await renderToStream(<ProductCard .product={product} />);
const metadata = await allReady;
```

`stream` is a Web `ReadableStream<string>`. `allReady` resolves with the same
metadata helpers as `renderToString(...)` once rendering has completed.

## Dev Helper

`@litsx/ssr` also exposes `createSsrDevServer(...)` for authored LitSX SSR
examples and local development. It compiles an authored server entry, renders a
document through `renderDocument(...)`, and serves it through Vite with LitSX
client sourcemaps enabled.

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
result.renderClientImportsData();
```

That JSON helper emits:

```html
<script type="application/json" id="__LITSX_CLIENT_IMPORTS__">[...]</script>
```

which `@litsx/ssr-client` can consume through `hydrateDocument(...)` or
`readClientImports(...)`.

When scoped LitSX roots are rendered, `renderHydrationData()` emits a matching
root payload:

```json
{
  "version": 1,
  "roots": [
    {
      "id": "litsx-root-0",
      "tagName": "product-card",
      "moduleId": "/src/ProductCard.litsx"
    }
  ],
  "payload": {
    "roots": {
      "litsx-root-0": {
        "props": {
          "product": {
            "name": "Trail Shoe"
          }
        }
      }
    },
    "instances": {}
  },
  "clientImports": ["/assets/ProductCard.js"]
}
```

The rendered host element carries a LitSX SSR root attribute so the client can
correlate DOM boundaries with that payload without inserting extra comments
into Lit's hydration marker sequence:

```html
<product-card data-litsx-root="litsx-root-0">...</product-card>
```

Do not strip Lit comments from hydrated SSR HTML. Lit itself uses comment
markers for hydration.

## Supported Input

The current API accepts:

- LitSX scoped templates
- plain Lit `TemplateResult`s
- arrays
- strings, numbers, booleans, `null`, and `undefined`

## Scope

SSR support includes scoped LitSX element rendering, server components,
SSR-safe hook execution, Declarative Shadow DOM output, client import
collection, root-boundary metadata, JSON-safe root prop payloads, hook state
payloads, and Web Streams output.

The scoped SSR lifecycle described here is guaranteed for LitSX-authored
components. Third-party Lit components can still appear inside rendered
templates, but they are not yet promoted into the full LitSX SSR component
model by default.

For the client-side entrypoint, see
[`@litsx/ssr-client`](../ssr-client/README.md).
