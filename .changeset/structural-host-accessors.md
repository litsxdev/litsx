---
"@litsx/core": minor
"@litsx/babel-preset-litsx": patch
"@litsx/babel-plugin-shared-hooks": patch
---

Add generic structural-hook `accessors` support for publishing host instance getters and setters through `defineHook()`.

Structural hooks can now return host accessor descriptors from `accessors(host, state, meta, entry)`, and LitSX installs those properties directly on the component host with stable override and restoration behavior across multiple structural entries.

The structural runtime and compiler now treat hooks with `accessors` as instance-phase hooks, so authored accessors compile through the host middleware path instead of the static-only structural path.

FACE primitives in `@litsx/core` now use that low-level mechanism to expose `form`, `validity`, `validationMessage`, and `willValidate` on the host surface without adding higher-level form semantics.
