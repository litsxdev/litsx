# `@litsx/authoring`

Shared authoring semantics used by the LitSX compiler and lint tooling.

Application source is standard `.jsx` or `.tsx`. This package centralizes:

- `on:event` parsing and event-name normalization
- standard `onX` callback and native DOM event-property classification
- component and implicit-children semantic analysis
- internal encoding used between LitSX compiler passes

The internal encoding may contain Lit binding prefixes, but it is not a public authored syntax and should never be written in application source.
