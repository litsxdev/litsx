---
"@litsx/babel-preset-react-compat": patch
"@litsx/babel-preset-litsx": patch
"@litsx/core": patch
---

Keep React lazy loaders out of generated static elements maps. Lazy custom
elements are now registered only through ensureLazyElement after their loader
resolves, while the host retains the scoped registry required for registration.
Dynamic import module namespaces are unwrapped through their default export
before the constructor is defined. Native LitSX now exposes `lazy()` from core
and lowers it through the same shared transform as React compatibility.
