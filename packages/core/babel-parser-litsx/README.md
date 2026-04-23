# `@litsx/babel-parser`

LitSX parser adapter built on top of `@babel/parser`.

This package accepts LitSX-authored JSX bindings such as `.prop`, `?attr`, and `@event`, while preserving authored names and source locations in the parsed AST.

Internally it delegates parsing to standard `@babel/parser` and layers LitSX virtualization/remapping on top.

Use it only when you need low-level parser access as part of a custom LitSX integration. For normal builds, prefer:

- [`@litsx/compiler`](../../compiler/README.md)
- [`@litsx/vite-plugin`](../../vite-plugin/README.md)
