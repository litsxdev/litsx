---
"@litsx/tailwind": patch
---

Use query-free virtual module identifiers in the build-tool-neutral integration so strict hosts
such as Evolit can safely materialize Shadow DOM preflight and component CSS. The Vite entrypoint
continues to use its existing `?inline` module convention.
