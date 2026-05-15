---
"@litsx/core": minor
"@litsx/typescript": minor
"@litsx/authoring": minor
"@litsx/litsx": patch
"@litsx/typescript-plugin": patch
"@litsx/jsx-authoring": patch
"@litsx/create-litsx-app": minor
"@litsx/compiler": minor
"@litsx/babel-preset-litsx": minor
"@litsx/babel-preset-react-compat": minor
"@litsx/babel-plugin-shared-hooks": minor
"@litsx/babel-plugin-transform-litsx-scoped-elements": minor
"@litsx/babel-parser": patch
"@litsx/eslint-plugin": patch
"prettier-plugin-litsx": patch
"@litsx/babel-plugin-transform-jsx-html-template": patch
---

Introduce canonical package names for the LitSX runtime, TypeScript integration, and authored JSX tooling.

`@litsx/core`, `@litsx/typescript`, and `@litsx/authoring` are now the recommended packages. The previous `@litsx/litsx`, `@litsx/typescript-plugin`, and `@litsx/jsx-authoring` packages remain available as compatibility wrappers.

Generated scaffolds, compiler output, presets, and tooling defaults now target the canonical package names while preserving compatibility with projects that still use the previous names. The canonical element/scoped-registry helpers now live at `@litsx/core/elements`; `@litsx/litsx/runtime-infrastructure` remains available as the legacy compatibility subpath. Rendering helpers now live at `@litsx/core/rendering`, and TypeScript source virtualization helpers now live at `@litsx/typescript/virtualization`.
