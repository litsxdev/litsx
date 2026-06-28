---
"@litsx/core": minor
"@litsx/babel-preset-litsx": minor
"@litsx/babel-preset-react-compat": minor
"@litsx/typescript": minor
"create-litsx-app": patch
---

Route soft suspense through an internal capture scope so SuspenseBoundary can capture async work from projected descendant updates without relying on DOM boundary lookup.

SuspenseBoundary and ErrorBoundary now use the authored `fallback` + children contract and the compiler lowers that shape to internal `.fallback`/`.content` renderers. The old boundary-specific `.fallbackRenderer`/`.contentRenderer` contract is removed.
