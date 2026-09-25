---
"@litsx/tailwind": patch
---

Add the build-tool-neutral `litsxTailwind()` integration descriptor so Evolit
and other LitSX hosts can own Tailwind compilation, virtual modules, document
assets, graph finalization, invalidation, and isolated lifecycle state without
Vite or a host-specific adapter.
