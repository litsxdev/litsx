---
"@litsx/babel-preset-litsx": patch
"@litsx/compiler": patch
---

Keep prop-backed function calls inside JSX attribute and Lit property bindings
as ordinary JavaScript values. Renderer-call directives are now emitted only
for child expressions, allowing nested LitSX custom elements to receive arrays,
objects, callbacks, and computed property values during SSR and hydration
without aborting reconciliation or duplicating declarative shadow DOM children.
