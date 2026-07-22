---
"@litsx/ssr": patch
---

Make `@litsx/ssr/hydration` install Lit's SSR hydration support as its first
top-level import so framework consumers can rely on the public hydration
entrypoint without manually importing
`@lit-labs/ssr-client/lit-element-hydrate-support.js`.
