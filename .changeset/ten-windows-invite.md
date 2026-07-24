---
"@litsx/compiler": patch
---

Fix compiler sourcemaps so authored `.litsx` files remain the canonical source
in emitted maps. `transformLitsx(...)` now normalizes the final sourcemap to
keep the original source filename in `sources` and the original authored source
text in `sourcesContent`, including through multi-pass compilation and
downstream sourcemap chaining.
