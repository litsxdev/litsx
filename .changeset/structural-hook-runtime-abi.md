---
"@litsx/core": minor
---

Remove parameter-name based structural hook ABI detection from the host middleware runtime. Structural hooks now use one fixed, minifier-safe contract: `setup(host, args, staticState, meta, entry)`, `use(host, state, args, meta, entry)`, and lifecycle middleware `(host, state, next, args, meta, entry)`.

FACE structural hooks have been updated to read authored instance data through `state.instance`, and the structural hook docs/types/tests now reflect the single runtime contract.
