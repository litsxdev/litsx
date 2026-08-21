---
"@litsx/babel-preset-litsx": minor
"@litsx/compiler": patch
---

Resolve stable `Component.elements` entries in async server components and
annotate resolvable custom-element constructors with SSR hydration metadata
automatically.

LitSX now accepts `Component.elements` entries that collapse to a single stable
constructor through direct imports, `const` aliases, and static object-member
lookups. Resolvable entries are decorated with `tagName` and `moduleId`
metadata during SSR compilation, while ambiguous or dynamic entries now fail
with a clear compile-time error unless the consumer supplies explicit metadata
or handles them through an adapter.
