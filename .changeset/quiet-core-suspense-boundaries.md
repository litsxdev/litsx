---
"@litsx/authoring": patch
"@litsx/babel-plugin-transform-litsx-scoped-elements": patch
"@litsx/babel-preset-litsx": patch
"@litsx/compiler": patch
"@litsx/vite-plugin": patch
"@litsx/storybook": patch
---

Recognize official framework JSX components such as `SuspenseBoundary` by their exported symbol and `@litsx/core` module identity. This prevents external PascalCase inference warnings when bundlers expose Core through artifacts whose runtime component metadata cannot be inspected, while preserving warnings for same-named exports from unrelated packages.
