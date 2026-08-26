---
"@litsx/babel-plugin-transform-litsx-scoped-elements": patch
"@litsx/core": patch
"@litsx/scoped-registry-shim": patch
"@litsx/ssr": patch
---

Complete the supported Lit/LitSX interoperability matrix across pure Lit
components, standard and structural mixins, scoped light/shadow trees, SSR,
and hydration. Detected scoped elements now compose with inherited and authored
registries, hook context subscriptions initialize safely during render and
retry late providers, late global definitions reach unowned shadow roots, and
registered pure custom-element roots are enabled after hydration registration.
