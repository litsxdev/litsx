---
"@litsx/core": minor
"@litsx/ssr": minor
---

Add `useSsrResourceSnapshot(...)` for library runtimes that need to capture a
request-scoped global resource cache after SSR settles and restore it
synchronously before hydration registration or client module loading.
