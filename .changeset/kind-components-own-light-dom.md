---
"@litsx/core": patch
"@litsx/authoring": patch
"@litsx/babel-plugin-transform-litsx-scoped-elements": patch
"@litsx/babel-preset-litsx": patch
"@litsx/compiler": patch
"@litsx/vite-plugin": patch
---

Replace the Core framework-component allowlist with class-owned metadata. Core light-DOM primitives now declare and type `LITSX_LIGHT_DOM`, while compiler and scoped-element analysis follow component and light-DOM metadata through package exports and barrels, including dependencies in `node_modules`. Opaque packages are no longer trusted merely because an export has the same name as a Core primitive.
