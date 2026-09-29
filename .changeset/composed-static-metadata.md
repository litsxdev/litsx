---
"@litsx/core": minor
"@litsx/babel-preset-litsx": minor
"@litsx/babel-plugin-transform-litsx-scoped-elements": patch
"@litsx/compiler": patch
"@litsx/unocss": patch
---

Compose function-authored component styles with structural-mixin styles by
default, add `replaceStyles()` for explicit isolation, preserve inherited
scoped-element maps, and rely on Lit's native property inheritance. Generated
classes now use direct static fields instead of the removed static-hoist runtime
getter and symbol machinery. UnoCSS keeps its preflight and generated utilities
in the resulting style chain, including components that replace inherited
styles.
