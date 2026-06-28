---
"@litsx/babel-preset-litsx": patch
"@litsx/babel-plugin-transform-litsx-scoped-elements": patch
"prettier-plugin-litsx": patch
---

Remove the deprecated `@litsx/babel-parser` adapter from internal tooling. LitSX Babel and Prettier integrations now use `@litsx/authoring/parser` directly with `@babel/parser`.
