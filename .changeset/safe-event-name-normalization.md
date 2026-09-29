---
"@litsx/authoring": patch
---

Normalize custom JSX event names with a linear scanner so untrusted identifiers
cannot trigger polynomial regular-expression backtracking.
