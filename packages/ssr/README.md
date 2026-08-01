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
result.modulePreloads;
result.bootstrap;
```

`renderDocument(...)` wraps the rendered fragment in a complete HTML document,
emits module preloads and hydration data, and can emit the standard LitSX SSR
hydration bootstrap automatically when `clientEntry` is provided.

The returned object also exposes the resolved shell metadata that frameworks
usually need to reuse or inspect:

- `document`: final HTML document string
- `html`: rendered application fragment
- `bootstrap`: final bootstrap script markup
- `head`: normalized extra head markup
- `modulePreloads`: rendered preload markup
- `hydrationScript`: rendered hydration JSON script
- `lang`, `title`, `htmlAttributes`, `bodyAttributes`
- `htmlAttributesString`, `bodyAttributesString`
- `defaultDocument`: the built-in shell output before any custom
  `template(...)` override

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
import { createEntry, renderDocument } from "@litsx/ssr";

const result = await renderDocument(createEntry({
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
}));
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

## Dynamic `<noscript>` fallback content

LitSX supports dynamic JSX inside the native `<noscript>` intrinsic during SSR:

```tsx
<noscript>
  <section>
    <h2>{title}</h2>
    {items.map((item) => <a href={item.href}>{item.label}</a>)}
  </section>
</noscript>
```

The compiler lowers this intrinsic to an internal, lazy fallback primitive.
`@litsx/ssr` renders that fallback with normal Lit escaping but as a
server-only subtree: it has no hydration markers, client metadata, or updates.
With JavaScript enabled the browser keeps native `<noscript>` behavior; with
JavaScript disabled it parses and displays the SSR fallback HTML.

Fallback trees support native HTML, text, attributes, arrays, conditionals, and
direct LitSX components. A component used directly in the fallback is resolved
through an ephemeral SSR-only scoped registry: it does not need to appear in
the parent host's `static elements`, is never globally registered, and does
not enter hydration metadata. Its declarative shadow DOM can therefore be
available to browsers that parse DSD with JavaScript disabled. Member-expression
components are rejected because the compiler cannot assign them a stable
fallback tag/constructor pair.

On the client the fallback does not retain a constructor reference. LitSX does
not remove the source import automatically, because doing so could change ESM
side-effect semantics. A bundler may still tree-shake it when it can prove the
module is side-effect free.

This is intentionally not implemented by changing parse5's global scripting
mode, and it does not use `unsafeHTML` or unescaped user content.

`renderToString(...)` returns:

- `html`: prerendered HTML, including Declarative Shadow DOM for LitSX elements
- `clientImports`: deduplicated client module imports collected from rendered
  LitSX elements
- `hydrationData`: LitSX root-boundary metadata plus root payload, state,
  optional library resource snapshots, and client imports when hydration data
  was collected, otherwise `null`
- `renderClientImports()`: `<script type="module">` tags for `clientImports`
- `renderClientImportsData()`: a JSON script tag readable by
  `@litsx/ssr/hydration`
- `renderModulePreloads()`: `<link rel="modulepreload">` tags for
  `clientImports`
- `renderHydrationData()`: a JSON hydration-payload script tag for scoped LitSX
  roots or library resource snapshots; empty when neither was collected

It can also accept the same authored-entry configuration object used by
`renderDocument(...)` when you want the `elements(loader)` + `render(...)`
model without building a full document:

```js
const result = await renderToString(createEntry({
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
}));
```

Frameworks that want to assemble the final shell themselves can pair
`renderToString(...)` with `createDocumentContext(...)` and
`renderBootstrap(...)`:

```tsx
import {
  createDocumentContext,
  renderBootstrap,
  renderToString,
} from "@litsx/ssr";

const fragment = await renderToString(<ProductCard .product={product} />, {
  assetResolver(moduleId) {
    return manifest[moduleId] ?? moduleId;
  },
});
const shell = createDocumentContext(fragment, {
  title: "Product Page",
});

const bootstrap = renderBootstrap({
  clientEntry: "/src/main.js",
  assetResolver(moduleId) {
    return manifest[moduleId] ?? moduleId;
  },
});

const document = `<!doctype html>
<html lang="en">
  <head>
    <title>${shell.title}</title>
    ${shell.modulePreloads}
    ${shell.hydrationScript}
  </head>
  <body>
    <main>${fragment.html}</main>
    ${bootstrap}
  </body>
</html>`;
```

Use `createDocumentContext(...)` when the framework wants the same normalized
shell metadata as `renderDocument(...)` without delegating the final document
assembly to the SSR package.

For streaming responses, use `renderToStream(...)`:

```tsx
import { renderToStream } from "@litsx/ssr";

const { stream, allReady } = await renderToStream(<ProductCard .product={product} />);
const metadata = await allReady;
```

`stream` is a Web `ReadableStream<string>`. The current implementation starts
emitting chunks after the SSR pass has stabilized across suspense retries.
`allReady` resolves with the same metadata helpers as `renderToString(...)`
once rendering has completed.

`renderToStream(...)` also accepts the same authored-entry configuration object
when you want to stream authored LitSX SSR without first constructing the
render value yourself.

Today `renderToStream(...)` is still a stabilized-response API, not a
progressive Suspense streaming contract. LitSX waits for the SSR pass to
stabilize across soft-suspense retries before chunks are emitted, so framework
integrations should currently treat streaming as a transport shape over the
same blocking SSR result rather than as incremental HTML reveal.

## Request Execution Context

Each public SSR call (`renderToString(...)`, `renderDocument(...)`, and
`renderToStream(...)`) creates one request-scoped execution context
internally. That execution context is:

- stable for the entire SSR request
- reused across suspense retries in that request
- shared by nested server-component calls in that request
- isolated from concurrent requests

## Suspense Retries And Errors

Rootless soft suspense retries are bounded by `maxSuspensePasses`, which
defaults to `25`.

If SSR does not converge within that limit, LitSX throws
`LitsxSsrMaxSuspensePassesError` with:

- `name: "LitsxSsrMaxSuspensePassesError"`
- `code: "LITSX_SSR_MAX_SUSPENSE_PASSES_EXCEEDED"`
- `maxPasses`

Frameworks can catch that error type directly to attach diagnostics, timeouts,
or framework-specific failure handling without relying on message matching.

Read it from runtime or hooks with `@litsx/core`:

```js
import {
  createExecutionContextKey,
  getCurrentExecutionContext,
} from "@litsx/core";

const USER_KEY = createExecutionContextKey("user");

export async function ProductPage(props, ssrContext) {
  getCurrentExecutionContext()?.set(USER_KEY, { id: "123" });
  return <AppRoot />;
}
```

`options.context` in `@litsx/ssr` remains SSR metadata config such as
`idPrefix`. It is not the request execution context and does not inject one.

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

During development, console calls evaluated while rendering on the server keep
their normal terminal output and are also replayed in the browser console with
the `[LitSX SSR]` prefix. If rendering fails, the response is a readable error
page with the fixed SSR stack trace instead of an empty or generic Vite
response.

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

## `Component.elements` Contract

Async server components may attach a static `Component.elements` map when they
return plain Lit `html\`\`` templates instead of authored JSX:

```js
import ProductCard from "./ProductCard.js";

export default async function ProductPage({ product }) {
  return html`<product-card .product=${product}></product-card>`;
}

ProductPage.elements = {
  "product-card": ProductCard,
};
```

That contract currently means:

- LitSX uses `Component.elements` during SSR compilation to build the scoped
  SSR registry for the returned template
- direct imports, `const` aliases, and static object-member lookups that
  collapse to one stable constructor are resolved automatically
- resolvable entries are decorated with `tagName` and `moduleId` hydration
  metadata in the compiled SSR artifact
- ambiguous or dynamic entries fail at compile time unless the consumer
  supplies explicit metadata, for example through
  `annotateHydratableCustomElement(...)`, or handles them through an adapter

`Component.elements` does not, by itself, guarantee automatic browser-side
registration for arbitrary third-party Lit modules. The emitted metadata lives
in the SSR artifact, not in the imported browser module namespace. That means:

- modules that already call `customElements.define(...)` remain the simplest
  interoperable case; importing them during hydration is sufficient
- LitSX-authored hydratable modules can be discovered by
  `registerHydrationModule(...)` and `registerHydrationModules(...)`
- plain Lit or third-party custom-element modules that do not self-register
  still need explicit client registration or an adapter-controlled bootstrap

In short: `Component.elements` is the SSR registry contract. Client-side
registration is automatic only when the imported browser module already carries
the required hydratable metadata or self-registers.

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

which `@litsx/ssr/hydration` can consume through `hydrateDocument(...)` or
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

`hydrationData.version` is the versioned public wire-format discriminator for
that payload. Version `1` currently guarantees:

- `roots`: ordered root descriptors with `id`, `tagName`, and `moduleId`
- `payload`: JSON-serializable root props plus hook-instance state
- `clientImports`: the client module URLs associated with the rendered result

Compatibility rules for the current protocol are:

- consumers must reject unknown top-level versions rather than guessing
- additive fields may appear within a known version and should be ignored when
  not understood
- changing the meaning, shape, or required presence of `roots`, `payload`, or
  `clientImports` requires a new `version`
- `moduleId` is part of the hydration contract for roots that LitSX expects to
  auto-load; if a root cannot produce a stable module id, the integration must
  supply registration by some other explicit means

The rendered host element carries a LitSX SSR root attribute so the client can
correlate DOM boundaries with that payload without inserting extra comments
into Lit's hydration marker sequence:

```html
<product-card data-litsx-root="litsx-root-0">...</product-card>
```

Do not strip Lit comments from hydrated SSR HTML. Lit itself uses comment
markers for hydration.

## Hydration Contract

The public hydration protocol between `@litsx/ssr` and `@litsx/ssr/hydration` is:

- `renderClientImportsData()` emits `__LITSX_CLIENT_IMPORTS__`
- `renderHydrationData()` emits `__LITSX_HYDRATION__`
- each LitSX SSR root host carries `data-litsx-root="<root-id>"`
- `hydrationData.roots` maps those root ids to tag names and module ids
- `hydrationData.payload` carries serialized root props, hook state, and an
  optional `resources` object keyed by library-owned resource identity

In the standard `clientEntry` flow, the emitted bootstrap script then:

1. imports the LitSX hydration runtime, which installs Lit hydration support
2. reads the payload and makes global resource snapshots available
3. applies root payloads and runs your client bootstrap/register entry
4. imports the emitted client modules

Framework integrations can rely on that order when wiring their own hydration
entry around `@litsx/ssr/hydration`.

The SSR/hydration invariants for that contract are:

- scoped registry lookup prefers the most local matching registry for any tag
- hydration must preserve the SSR host DOM boundary; integrations must not
  duplicate or replace already-rendered root DOM before Lit hydration runs
- Lit comment markers and Declarative Shadow DOM emitted by SSR are part of the
  hydrated DOM contract and must not be stripped or reordered
- root props and hook payload state must stay JSON-serializable
- resource snapshots are captured after the final SSR pass and must stay
  JSON-serializable
- root registration must happen before LitSX applies the hydration payload to
  the DOM
- light DOM and slot projection follow the DOM produced by SSR; client
  bootstraps must not reshuffle projected children between registration and
  hydration

Importing `@litsx/ssr/hydration` is also the supported client bootstrap entry:
it installs `@lit-labs/ssr-client/lit-element-hydrate-support.js` as its first
top-level side effect, before pulling `@litsx/core`, so framework consumers do
not need to import Lit's hydration patch manually.

### Library resource snapshots

Libraries with a global resolved-resource cache can call
`useSsrResourceSnapshot({ key, capture, restore })` from their own LitSX hook.
`capture()` runs only after the final SSR render pass so it observes everything
resolved during suspense retries. On the client, `restore(snapshot)` runs
synchronously and once for that snapshot before registration or module loading
can cause the first component render.

Registrations are held in the current SSR request's async context, so concurrent
renders cannot see one another's captures. Payloads created before this feature
remain valid because `payload.resources` is optional. This API is intended for
library runtimes; applications should not add adapters or manual bootstrap
registration for it.

Frameworks applying incremental SSR fragments can call the public
`prepareHydrationResources(hydrationData)` helper before inserting the fragment
or registering its modules. It installs the same opaque resource payload used
internally by `hydrate()`, `hydratePage()`, and `hydrateRoot()`; framework code
must not inspect the individual resource values or recreate the bridge.

### Module Registration

`@litsx/ssr/hydration` also exposes a small registration primitive for
frameworks that want LitSX to own hydratable custom-element registration while
keeping DOM hydration separate:

```ts
import {
  registerHydrationModule,
  registerHydrationModules,
  hydratePage,
} from "@litsx/ssr/hydration";

await registerHydrationModules([
  () => import("/_nextsx/client/app/components/feature-card.mjs"),
  () => import("/_nextsx/client/app/components/hero-banner.mjs"),
]);

await hydratePage();
```

`registerHydrationModule(module)` and `registerHydrationModules(modules)`:

- inspect module namespace exports only
- register every exported LitSX component class that carries public hydratable
  tag metadata
- are idempotent for the same tag and constructor
- throw when the same tag is already associated with a different constructor
- do not read `document`
- do not read `hydrationData`
- do not apply hydration payloads
- do not call `hydratePage(...)`

### Design Note

The registration API uses compiler-emitted static metadata on LitSX component
classes to identify hydratable exports. That signal is explicit, survives
renames and default exports, and lets the runtime inspect already-imported
module namespaces without guessing from export names or framework manifests.

This API belongs in `@litsx/ssr/hydration` because module registration is part
of the public client-side SSR hydration runtime contract: the same package
already owns hydration support installation and payload application, so it is
the right place to own LitSX-specific root registration semantics as well.

Registration and hydration stay separate on purpose. Frameworks need control
over which client URLs to load and when to load them, while LitSX should own
how hydratable custom elements are discovered and registered. Keeping those
steps split preserves that boundary and avoids coupling module loading to DOM
reads or payload application.

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

The intended integration models today are:

- LitSX-authored hydratable components:
  compiler-emitted metadata, automatic SSR registry wiring, automatic client
  import discovery, and hydration through `@litsx/ssr/hydration`
- Standard Lit or third-party custom elements:
  SSR can render them when the integration provides a resolvable registry
  constructor or adapter, but client registration remains explicit unless the
  imported module self-registers or otherwise exposes hydratable metadata

Public validation currently lives across:

- transform tests for compiler output and registry metadata emission
- SSR result tests for HTML, client imports, and hydration payload shape
- browser hydration tests for end-to-end DOM claiming and event continuity
- authored-entry and asset-resolution tests for framework-facing integration
  paths

Source-map and authored-compilation behavior are also covered in the broader
compiler and integration suites, but they are not a separate SSR-specific
browser contract.

For the browser hydration entrypoint, see `@litsx/ssr/hydration`.
