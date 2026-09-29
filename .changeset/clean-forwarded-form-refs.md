---
"@litsx/core": patch
---

Let an explicitly authored component `ref` prop replace the generic managed
JSX base ref contract. Exact LitSX object and callback refs can now be forwarded
without intersecting their target with `LitsxRef<unknown>`, while incorrect
targets, intrinsic ref safety, union refs, and `undefined` cleanup remain intact.
