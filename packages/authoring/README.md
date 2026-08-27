# `@litsx/authoring`

Shared authoring semantics used by the LitSX compiler and lint tooling.

The public source-language contract lives in [`../../AUTHORING.md`](../../AUTHORING.md).
This package implements shared analysis for that contract; it does not define a
second authoring dialect.

Application source is standard `.jsx` or `.tsx`. This package centralizes:

- `on:event` parsing and event-name normalization
- standard `onX` callback and native DOM event-property classification
- component and implicit-children semantic analysis
- framework-component identity by package export, including Core light-DOM primitives
- strict component-name validation against the custom-elements contract
- synchronous hook-scope and stable hook-order diagnostics
- internal encoding used between LitSX compiler passes

The compiler, Babel hooks transform, and ESLint plugin consume these analyzers
through small adapters. The diagnostic code and source node therefore remain
the same regardless of which entrypoint reports an error.

The internal encoding may contain Lit binding prefixes, but it is not public
authored syntax and must never be presented as application source in diagnostics,
examples, or website documentation.

The `@litsx/authoring/parser` export is the canonical parser helper for LitSX
tooling. `@litsx/authoring/internal/parser` is an equivalent compatibility alias
still consumed by compiler internals; both entrypoints reparse generated
compiler IR. Application files and imported source dependencies are parsed with
the standard Babel JSX/TypeScript parser and cannot use that internal encoding.
