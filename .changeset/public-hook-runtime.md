---
"@litsx/core": minor
"@litsx/babel-plugin-shared-hooks": patch
---

Expose the structural composition primitives required by generated modules
directly from `@litsx/core`. Remove the redundant `@litsx/core/internal`
re-export entrypoint, keep hook cursor and host-context helpers private to their
implementation modules, and make generated hook code use the canonical public
runtime import.
