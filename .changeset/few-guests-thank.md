---
"@litsx/ssr": patch
---

Simplify `@litsx/ssr/hydration` now that Lit hydration support is installed as
part of the module entrypoint. The public hydration helpers no longer expose
manual hydration-support installation hooks and rely on the entrypoint import
order instead.
