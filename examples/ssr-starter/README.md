# LitSX SSR Starter

Minimal SSR example using the productized public APIs:

- `renderDocument(...)`
- `createSsrDevServer(...)`
- `hydratePage(...)`

Run it from the repository root:

```bash
node examples/ssr-starter/render.mjs
node examples/ssr-starter/dev.mjs
```

Open the URL printed by the dev server. The page is rendered on the server and
then hydrated in the browser using the authored LitSX source.

This starter reflects the current SSR v1 scope: it demonstrates the
productized LitSX-authored SSR flow, not generic SSR for arbitrary third-party
Lit component libraries.
