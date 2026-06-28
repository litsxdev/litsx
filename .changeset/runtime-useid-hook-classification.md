---
"@litsx/core": minor
"@litsx/babel-plugin-shared-hooks": minor
"@litsx/babel-preset-litsx": minor
"@litsx/babel-preset-react-compat": patch
"@litsx/babel-plugin-transform-litsx-scoped-elements": patch
"@litsx/compiler": patch
"create-litsx-app": patch
---

Recognize `useId` imported from `@litsx/core` and `useContext` imported from `@litsx/core/context` as LitSX runtime hooks during shared custom-hook analysis so custom hooks that call them are compiled with the active host instead of being treated as unresolved imported hooks. The preset now classifies LitSX runtime hooks by known runtime import source plus the public `useX` naming convention instead of maintaining a duplicated hook allowlist.

Rename compiler-facing structural runtime helpers from `useStructuralEntry(...)` and `useStructuralStaticEntry(...)` to `resolveStructuralEntry(...)` and `resolveStructuralStaticEntry(...)`. These helpers are emitted by the compiler/runtime bridge and are no longer named like authored user-space hooks.
