# LitSX SSR Starter

Minimal SSR example using the productized public APIs:

- `renderDocument(...)`
- `createSsrDevServer(...)`
- automatic hydration bootstrap via `clientEntry`

This example is intended as the shortest end-to-end walkthrough of the current
LitSX SSR flow.

The split of responsibility is:

- `dev.mjs` tells the dev helper which authored root to render
- `index.html` owns the surrounding document shell
- `render.mjs` prerenders the same root into the same shell for static output

## File Layout

- `src/components.litsx`
  Defines the LitSX components rendered on the server and hydrated in the
  browser.
- `index.html`
  Shared document shell used by the dev server and by `render.mjs`.
- `src/main.js`
  Browser entry that registers the custom elements and runs browser-only setup.
- `render.mjs`
  Produces a static HTML document with `renderDocument(...)`,
  reusing the same `index.html` shell, and writes it to `dist/index.html`.
- `dev.mjs`
  Starts a local Vite-based SSR server with `createSsrDevServer(...)`, loading
  `index.html` and injecting the rendered SSR fragment plus hydration markup.

Run it from the repository root:

```bash
node examples/ssr-starter/render.mjs
node examples/ssr-starter/dev.mjs
```

Open the URL printed by the dev server. The page is rendered on the server and
then hydrated in the browser using the authored LitSX source.

## What To Look For

- the HTML document is generated on the server before the page loads
- the counter is interactive after hydration
- the browser entry stays small because `renderDocument(...)` emits the
  hydration bootstrap wrapper for the declared `clientEntry`

This starter reflects the current SSR v1 scope: it demonstrates the
productized LitSX-authored SSR flow, not generic SSR for arbitrary third-party
Lit component libraries.
