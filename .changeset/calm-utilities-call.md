---
"@litsx/babel-preset-litsx": patch
"@litsx/compiler": patch
"@litsx/vite-plugin": patch
---

Preserve external `use*` exports as ordinary functions when their complete
reachable `use*` graph is analyzable and contains no LitSX or React hooks.
React-backed, unresolved, and opaque hook graphs remain rejected.
