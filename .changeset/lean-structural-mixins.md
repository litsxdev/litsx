---
"@litsx/babel-plugin-shared-hooks": minor
"@litsx/babel-preset-litsx": minor
"@litsx/compiler": minor
"@litsx/core": minor
---

Replace structural middleware entries with statically discovered class-capability
mixins. Structural hooks now use `defineHook({ mixin, use })`; the compiler
propagates transitive hook metadata, installs distinct mixins in first-callsite
order, and lowers readers against the generated host. Remove the former
`static`, `setup`, `props`, `accessors`, and lifecycle-middleware contract.

Implement the form-associated hooks on one shared `FormAssociatedMixin`, so
using any combination of the FACE readers installs the platform capability only
once while preserving form lifecycle and validity behavior.
