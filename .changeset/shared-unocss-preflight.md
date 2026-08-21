---
"@litsx/unocss": minor
"@litsx/storybook": minor
"@litsx/core": minor
"@litsx/babel-preset-litsx": minor
"@litsx/babel-preset-react-compat": minor
"@litsx/compiler": minor
"@litsx/ssr": patch
---

Add the UnoCSS integration with shared project-level preflight,
module-local Shadow DOM utilities, client and SSR support, and generic Vite
plugin phases around the LitSX Storybook compiler. Add component-owned static
utility guards with exact export resolution, runtime-safe CSSResult
materialization, extensible authoring style types, and dependency-aware HMR.
Expose a build-tool-neutral engine for extraction, guard materialization,
module utility generation, preflight finalization and dependency invalidation.
Keep Vite lifecycle and HMR policy in the optional `/vite` adapter. Compose
UnoCSS's official global mode onto the same resolved context so applications
can import `virtual:uno.css` for page-level light DOM without a second config,
token store, preflight generator or UnoCSS instance.
Add the generic `scoped`, `global`, and `none` light-DOM style routes. UnoCSS
uses stable compiler-generated scope identities and CSS scope end boundaries
to prevent utility selectors crossing into nested light-DOM components, while
SSR preserves the same short opaque scope identity for hydration.
