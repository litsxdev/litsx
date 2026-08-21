---
"@litsx/core": patch
"@litsx/ssr": patch
---

Isolate scoped registries, hydration contexts, noscript state, and soft Suspense collectors across concurrent SSR renders. The scoped custom-element lookup bridge is now reentrant, so interleaved requests resolve their own constructors and hydration metadata without cross-request leakage.
