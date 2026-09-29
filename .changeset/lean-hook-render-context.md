---
"@litsx/core": minor
"@litsx/babel-plugin-shared-hooks": minor
"@litsx/babel-preset-litsx": minor
"@litsx/babel-preset-react-compat": minor
"@litsx/compiler": minor
---

Replace compiler-injected host arguments with a bounded synchronous hook render
context. Authored and transformed custom hooks now preserve their declared
signatures, `useHost()` is the only authored host-access API, and structural
hook readers use `use(...args)`. Move cursor preparation and structural
application helpers to `@litsx/core/internal`, and ensure generated component
refs, client rendering, SSR, suspense retries, and React compatibility all enter
the same `renderWithHooks()` boundary.

Structural hooks may now omit `use()` when they only install a mixin. These
installation-only hooks return `void`; value-producing capability surfaces
remain explicit readers.
