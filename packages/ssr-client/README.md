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

It does not currently generate or consume a LitSX-specific hydration payload.

## Installation

```bash
npm install @litsx/ssr-client @litsx/ssr lit @litsx/litsx
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
3. imports the client modules you pass in `clientImports`

That order matters because Lit's hydration support must be installed before the
LitElement modules you want to hydrate are evaluated.

## Document and Root Helpers

The package also exposes a slightly higher-level surface:

```js
import {
  hydrateDocument,
  hydrateRoot,
  readClientImports,
  readHydrationData,
} from "@litsx/ssr-client";
```

- `hydrateRoot(root, options)` is an explicit alias for hydrating one root
- `hydrateDocument(options)` defaults the root to `document`
- `readClientImports(...)` reads imports from options or a JSON script tag
- `readHydrationData(...)` reads an optional JSON hydration payload

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
- `clientImports` loads the modules discovered while rendering scoped LitSX
  elements

## Current Scope

This first client helper cut:

- installs Lit hydration support
- supports optional bootstrap callbacks
- supports loading deduplicated client module imports
- supports document/root helpers and JSON script readers

It does not yet:

- walk SSR roots automatically
- manage a LitSX hydration payload
- register root elements for you
