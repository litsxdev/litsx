---
"@litsx/babel-preset-litsx": patch
"@litsx/compiler": patch
"@litsx/storybook": patch
"@litsx/unocss": patch
"@litsx/vite-plugin": patch
---

Preserve bare side-effect imports so ordinary Vite CSS and `virtual:uno.css`
remain linked in dev, Storybook, and production builds. Compile expression-bodied
local PascalCase story hosts as Lit elements, and keep optimize-deps compilation
away from dependencies, generated chunks, assets, virtual ids, and prebundled
cache output.
