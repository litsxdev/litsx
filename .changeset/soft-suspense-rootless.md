---
"@litsx/core": patch
"@litsx/babel-plugin-shared-hooks": patch
---

Add framework-level soft suspense for render hooks without an enclosing SuspenseBoundary. Compiled render methods now wrap hook execution so thrown thenables suspend the host, render `nothing`, and request an update when resolved, while preserving explicit SuspenseBoundary handling.
