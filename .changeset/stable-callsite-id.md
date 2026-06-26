---
"@litsx/core": patch
"@litsx/babel-preset-litsx": patch
"@litsx/babel-plugin-shared-hooks": patch
---

Add `useStableId()` as a public callsite-stable identity primitive, with LitSX transform support that injects deterministic authored callsite metadata for SSR/client consistency.
