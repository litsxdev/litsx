---
"@litsx/ssr": minor
"@litsx/core": minor
"@litsx/babel-preset-litsx": minor
"@litsx/babel-plugin-transform-litsx-scoped-elements": minor
"@litsx/vite-plugin": patch
"@litsx/compiler": patch
"@litsx/babel-plugin-transform-jsx-html-template": patch
"@litsx/babel-preset-react-compat": patch
"@litsx/babel-plugin-shared-hooks": patch
---

Add phase 1 SSR support for generic custom elements across the LitSX SSR and
compiler pipelines.

LitSX now recognizes hydratable non-Lit custom element constructors, carries
their SSR metadata through compiled scoped-element registries and SSR root
rewrites, and supports host-only SSR plus hydration payload collection for
generic `HTMLElement` roots.

`@litsx/ssr` also exposes a new `renderCustomElementSsr(...)` hook so consumer
frameworks can take over SSR for hydratable non-Lit custom elements, contribute
client imports, preloads, head tags, and opaque adapter artifacts, while
preserving LitSX root metadata and hydration orchestration.
