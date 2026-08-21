---
"@litsx/unocss": minor
"@litsx/storybook": minor
"@litsx/core": minor
"@litsx/babel-preset-litsx": patch
---

Add the UnoCSS integration with shared project-level preflight,
module-local Shadow DOM utilities, client and SSR support, and generic Vite
plugin phases around the LitSX Storybook compiler. Add component-owned static
utility guards with exact export resolution, runtime-safe CSSResult
materialization, extensible authoring style types, and dependency-aware HMR.
Expose a build-tool-neutral engine for extraction, guard materialization,
module utility generation, preflight finalization and dependency invalidation.
Keep Vite lifecycle and HMR policy in the optional `/vite` adapter.
