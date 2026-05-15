---
"@litsx/typescript-plugin": minor
---

Improve LitSX editor completions and component inference for the shared TypeScript editor session.

This release improves JSX completion continuity after authored `@event` handlers, preserves auto-import edits for `@litsx/litsx` suggestions, infers component-emitted events from `useEmit()` string literals, and falls back to `static properties = ...` when inferring component prop completions.
