# LitSX SSR Hydration Demo

Minimal SSR app with five nested component levels mixing shadow DOM and light DOM.

Run it from the repository root:

```bash
node examples/ssr-hydration/render.mjs
node examples/ssr-hydration/dev.mjs
```

Open the URL printed by the dev server. The page is prerendered by
`@litsx/ssr` through `renderDocument(...)` / `createSsrDevServer(...)`, then
hydrated in the browser by `@litsx/ssr-client` through `hydratePage(...)`.
