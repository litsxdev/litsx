---
"@litsx/ssr": minor
---

Install one shared SSR DOM identity before Lit evaluates, reexport `html` from the initialized SSR entry, and expose the synchronous `@litsx/ssr/install-dom-shim` bootstrap entry for frameworks that load application components before the main SSR runtime.
