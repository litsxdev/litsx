---
"@litsx/core": minor
"@litsx/typescript": minor
"@litsx/babel-plugin-shared-hooks": minor
"@litsx/babel-preset-litsx": minor
---

Add structural `props()` middleware support across runtime, compiler, and TypeScript tooling so shared public host properties compose without leaking internal `accessors()`.

Structural hooks can now declare public Lit property options through `props(host, state, next)` while keeping internal runtime capabilities in `accessors(host, state, next)`. LitSX now composes both channels as middleware, rejects cross-channel collisions, warns when same-channel structural props or accessors overwrite one another, and keeps FACE accessors out of the public component API.

TypeScript tooling and editor completions now infer structural public props across local and imported hooks, so PascalCase component surfaces expose shared structural properties in authored LitSX without redeclaring them on every component.
