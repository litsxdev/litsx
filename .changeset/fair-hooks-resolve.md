---
"@litsx/babel-preset-litsx": patch
"@litsx/compiler": patch
---

Keep structural-hook import resolution independent from declaration-oriented compiler caches so custom hooks wrapping built-in structural hooks compile reliably in Vite and SSR sessions.
