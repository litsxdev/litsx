# `@litsx/ssr-client`

[![npm](https://img.shields.io/badge/npm-@litsx%2Fssr--client-CB3837)](https://www.npmjs.com/package/@litsx/ssr-client)
[![Release](https://img.shields.io/badge/release-public-2ea44f)](../../RELEASING.md)
[![Module](https://img.shields.io/badge/module-ESM%20%2B%20CJS-0366d6)](./package.json)
[![Provenance](https://img.shields.io/badge/npm_provenance-enabled-2ea44f)](../../RELEASING.md)

Client-side hydration helpers for LitSX SSR.

This package keeps hydration intentionally small:

- it installs Lit's SSR hydration support before loading client modules
- it can run your root-registration/bootstrap entry
- it can load the `clientImports` produced by `@litsx/ssr`
- it can validate and resolve SSR root boundaries from LitSX hydration metadata
- it can attach root-scoped hydration payloads to their matching DOM roots

## Installation

```bash
npm install @litsx/ssr-client @litsx/ssr lit @litsx/core
```

## Basic Usage

```js
import { hydrate } from "@litsx/ssr-client";

await hydrate(document, {
  register: () => import("./main.js"),
  clientImports,
});
```

`hydrate(...)` does three things in order:

1. loads Lit's hydration support side effect
2. runs your optional `register()` bootstrap
3. reads and applies the SSR hydration payload when present
4. imports the client modules you pass in `clientImports`

That order matters because Lit's hydration support must be installed before the
LitElement modules you want to hydrate are evaluated.

## Document and Root Helpers

The package also exposes a slightly higher-level surface:

```js
import {
  hydrateDocument,
  hydrateRoot,
  readHydrationPayload,
  readClientImports,
  readHydrationData,
  resolveHydrationRoot,
  resolveHydrationRoots,
} from "@litsx/ssr-client";
```

- `hydrateRoot(root, options)` hydrates one explicit root and validates its
  LitSX SSR root attribute against the SSR payload when present
- `hydrateDocument(options)` defaults the root to `document` and returns the
  resolved roots when the payload declares them
- `readClientImports(...)` reads imports from options or a JSON script tag
- `readHydrationData(...)` reads the JSON hydration payload emitted by
  `@litsx/ssr`
- `readHydrationPayload(...)` extracts and validates the payload object inside
  the SSR hydration data
- `resolveHydrationRoots(...)` resolves every declared root boundary to a DOM
  element
- `resolveHydrationRoot(...)` resolves one declared root by id

By default the JSON script ids are:

- `__LITSX_CLIENT_IMPORTS__`
- `__LITSX_HYDRATION__`

Example:

```html
<script type="application/json" id="__LITSX_CLIENT_IMPORTS__">
  ["/assets/app.js", "/assets/card.js"]
</script>
```

```js
await hydrateDocument({
  register: () => import("./main.js"),
});
```

When LitSX scoped roots are rendered on the server, the HTML also carries a
root attribute on each root host:

```html
<product-card data-litsx-root="litsx-root-0">...</product-card>
```

The matching payload emitted by `renderHydrationData()` looks like this:

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

That lets the client validate and resolve boundaries explicitly:

```js
const roots = resolveHydrationRoots(document);
const cardRoot = resolveHydrationRoot(document, "litsx-root-0");
```

Do not strip Lit comments from hydrated SSR HTML. Lit hydration depends on its
own comment markers, and inserting extra comments between Lit markers and
hosts can break Lit's hydration mapping.

## Working with `@litsx/ssr`

```js
import { renderToString } from "@litsx/ssr";
import { hydrate } from "@litsx/ssr-client";

const result = await renderToString(<AppRoot .data={data} />);

document.body.innerHTML = `
  ${result.html}
  ${result.renderModulePreloads()}
`;

await hydrate(document, {
  register: () => import("./main.js"),
  clientImports: result.clientImports,
});
```

In that setup:

- your SSR HTML already contains Declarative Shadow DOM
- `register()` should define the root custom elements for the page
- `clientImports` can be passed explicitly or embedded in the hydration data
- `renderHydrationData()` and `hydrateDocument(...)` can coordinate explicit
  root boundaries and root-scoped payloads without global registry scans

## Scope

The client helper installs Lit hydration support, supports optional bootstrap
callbacks, loads deduplicated client module imports, resolves root boundaries,
validates hydration metadata, and attaches root-scoped payloads. It still leaves
application-specific custom element registration to your bootstrap code.
