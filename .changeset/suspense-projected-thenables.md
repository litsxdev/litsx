---
"@litsx/core": patch
---

Capture thenables thrown while `SuspenseBoundary` syncs projected content in `updated()`, so projected custom-element subtrees suspend through the boundary instead of leaking pending promises to Lit.
