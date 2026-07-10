---
"@litsx/core": patch
---

Mark built-in boundary elements with LitSX component metadata so downstream compilers can verify `ErrorBoundary`, `SuspenseBoundary`, and `SuspenseList` imports from compiled `@litsx/core` packages without emitting external PascalCase inference warnings.
