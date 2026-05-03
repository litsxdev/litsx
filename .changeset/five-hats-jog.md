---
"@litsx/litsx": patch
"create-litsx-app": patch
---

Load the scoped custom element registry polyfill before booting generated apps so
scaffolded components using authored child imports render correctly in Vite.

Remove the runtime dependency on `@open-wc/scoped-elements` and resolve scoped
element registries directly through native or polyfilled `CustomElementRegistry`
support.
