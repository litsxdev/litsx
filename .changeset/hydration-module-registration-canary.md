---
"@litsx/babel-preset-litsx": minor
"@litsx/core": minor
"@litsx/ssr": minor
---

Add a public LitSX hydration-module registration primitive in `@litsx/ssr/hydration`
so frameworks can import client modules and register hydratable custom elements
before calling `hydratePage(...)`.

Emit explicit hydratable tag metadata on compiled LitSX component classes and
expose the corresponding runtime symbol from `@litsx/core` so hydration module
registration can inspect module namespaces without relying on framework-private
conventions or hydration payload introspection.
