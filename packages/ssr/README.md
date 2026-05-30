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

## Start Here

If you are starting from scratch, the normal SSR flow is:

1. render a full HTML document on the server with `renderDocument(...)`
2. point `clientEntry` at your normal browser entry
3. use `createSsrDevServer(...)` during local development

Minimal server entry:

```tsx
import { renderDocument } from "@litsx/ssr";
import { ProductCard } from "./ProductCard.litsx";

const result = await renderDocument(
  <ProductCard .product={product} />,
  {
    title: "Product Page",
    clientEntry: "/src/main.js",
  },
);

result.document;
```

Matching client entry:

```js
const { defineProductElements } = await import("./ProductCard.litsx");
defineProductElements();
```

`renderDocument(...)` emits the hydration bootstrap wrapper for you when
`clientEntry` is provided. The client entry can stay focused on registering
elements and running browser-only setup.

If you want a working reference project, start from
[`examples/ssr-starter`](../../examples/ssr-starter/README.md).

## Installation

```bash
npm install @litsx/ssr lit @litsx/core
```

If you are rendering LitSX-authored source through a build tool, you will also
need the relevant compiler integration such as
[`@litsx/vite-plugin`](../vite-plugin/README.md).

## Basic Usage

For most applications, `renderDocument(...)` should be your default server API:

```tsx
import { renderDocument } from "@litsx/ssr";
import { ProductCard } from "./ProductCard.litsx";

const result = await renderDocument(<ProductCard .product={product} />, {
  title: "Product Page",
  clientEntry: "/src/main.js",
});

result.document;
result.html;
result.hydrationData;
```

`renderDocument(...)` wraps the rendered fragment in a complete HTML document,
emits module preloads and hydration data, and can emit the standard LitSX SSR
hydration bootstrap automatically when `clientEntry` is provided.

If the built-in shell is not enough, pass `template(...)` to assemble the final
document yourself:

```tsx
const result = await renderDocument(<ProductCard .product={product} />, {
  title: "Product Page",
  clientEntry: "/src/main.js",
  template({ html, title, modulePreloads, hydrationScript, bootstrap }) {
    return `<!doctype html>
<html>
  <head>
    <title>${title}</title>
    ${modulePreloads}
    ${hydrationScript}
  </head>
  <body>
    <main class="page-shell">${html}</main>
    ${bootstrap}
  </body>
</html>`;
  },
});
```

For prerender/build scripts that start from authored source instead of an
already-imported component constructor, `renderDocument(...)` also accepts an
authored-entry configuration object:

```js
import { renderDocument } from "@litsx/ssr";

const result = await renderDocument({
  root: process.cwd(),
  template: "./index.html",
  clientEntry: "./src/main.js",
  elements(loader) {
    return {
      "app-root": async () =>
        (await loader("./src/App.litsx")).AppRoot,
    };
  },
  render({ html }) {
    return html`<app-root></app-root>`;
  },
});
```

If you need finer control over the HTML shell, `renderToString(...)` remains
available as the lower-level API:

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

It can also accept the same authored-entry configuration object used by
`renderDocument(...)` when you want the `elements(loader)` + `render(...)`
model without building a full document:

```js
const result = await renderToString({
  root: process.cwd(),
  elements(loader) {
    return {
      "product-card": async () =>
        (await loader("./src/ProductCard.litsx")).ProductCard,
    };
  },
  render({ html }) {
    return html`<product-card .product=${product}></product-card>`;
  },
});
```

For streaming responses, use `renderToStream(...)`:

```tsx
import { renderToStream } from "@litsx/ssr";

const { stream, allReady } = await renderToStream(<ProductCard .product={product} />);
const metadata = await allReady;
```

`stream` is a Web `ReadableStream<string>`. `allReady` resolves with the same
metadata helpers as `renderToString(...)` once rendering has completed.

`renderToStream(...)` also accepts the same authored-entry configuration object
when you want to stream authored LitSX SSR without first constructing the
render value yourself.

## Dev Helper

`@litsx/ssr` also exposes `createSsrDevServer(...)` for authored LitSX SSR
examples and local development. It resolves authored `.litsx` modules through
`elements(loader)`, renders a fragment through your `render(...)` callback,
injects that fragment into an HTML template, and serves the result through Vite
with LitSX client sourcemaps enabled.

Minimal example:

```js
import { createSsrDevServer } from "@litsx/ssr";

const server = await createSsrDevServer({
  root: process.cwd(),
  template: "./index.html",
  clientEntry: "./src/main.js",
  elements(loader) {
    return {
      "demo-app": async () =>
        (await loader("./src/components.litsx")).DemoApp,
    };
  },
  render({ html }) {
    return html`<demo-app .title=${"Hello SSR"}></demo-app>`;
  },
});

await server.listen();
server.printUrls();
```

Use this helper for local development and examples. Use `renderDocument(...)`
or `renderToString(...)` directly in production integrations.

When you provide a template file, `createSsrDevServer(...)` expects
`<!--app-html-->` and will also fill `<!--app-head-->`,
`<!--app-bootstrap-->`, and `<!--app-title-->` when present.

For the simple case, `elements(loader)` is just the scoped registry for the
tags returned by `render(...)`. The `loader(...)` helper exists so authored
`.litsx` modules resolve through the same SSR-aware Vite pipeline the dev
helper already uses internally.

If you need total control over the emitted bootstrap script, pass `bootstrap`
explicitly. That low-level override takes precedence over `clientEntry`.

## Authored Config Contract

`renderDocument(...)`, `renderToString(...)`, and `renderToStream(...)` all
accept the same authored LitSX configuration object:

- `root`: filesystem base used to resolve authored modules and template files
- `clientEntry`: optional browser bootstrap module, normalized relative to
  `root`
- `elements(loader)`: scoped element registry, or a factory that receives the
  SSR-aware `loader(...)`
- `render({ html, clientEntry, root })`: callback that returns the Lit render
  value for the request

That shape is the intended public contract for framework-style integrations
that want LitSX to resolve authored modules without globally registering them.

## `loader(...)` Contract

When you provide `elements(loader)`, LitSX passes a SSR-aware loader with this
behavior:

- `loader(specifier)` resolves `specifier` relative to `root`
- in dev, it loads the authored module through Vite SSR
- outside the dev server, it compiles the authored module to a temporary SSR
  module and imports that result
- it returns the SSR-ready module namespace for the authored file

That means authored `.litsx` modules work through the same API in:

- `renderDocument(...)`
- `renderToString(...)`
- `renderToStream(...)`
- `createSsrDevServer(...)`

## Template Marker Contract

When `createSsrDevServer(...)` receives `template: "./index.html"`, the
template file follows a small explicit contract:

- `<!--app-html-->` is required and is replaced with the rendered SSR fragment
- `<!--app-title-->` is optional and is replaced with the escaped document
  title when present
- `<!--app-head-->` is optional and is replaced with head content, module
  preloads, and hydration data when present
- `<!--app-bootstrap-->` is optional and is replaced with the emitted bootstrap
  script when present

If `<!--app-head-->` is missing, LitSX injects the head markup before
`</head>` when that closing tag exists. If `<!--app-bootstrap-->` is missing,
LitSX injects the bootstrap markup before `</body>` when that closing tag
exists.

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

## Hydration Contract

The public hydration protocol between `@litsx/ssr` and `@litsx/ssr-client` is:

- `renderClientImportsData()` emits `__LITSX_CLIENT_IMPORTS__`
- `renderHydrationData()` emits `__LITSX_HYDRATION__`
- each LitSX SSR root host carries `data-litsx-root="<root-id>"`
- `hydrationData.roots` maps those root ids to tag names and module ids
- `hydrationData.payload` carries serialized root props and hook state

In the standard `clientEntry` flow, the emitted bootstrap script then:

1. installs Lit hydration support
2. runs your client bootstrap/register entry
3. reads and applies the LitSX hydration payload
4. imports the emitted client modules

Framework integrations can rely on that order when wiring their own hydration
entry around `@litsx/ssr-client`.

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
