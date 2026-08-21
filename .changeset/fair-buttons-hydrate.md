---
"@litsx/babel-plugin-transform-jsx-html-template": patch
"@litsx/babel-preset-litsx": patch
"@litsx/authoring": patch
"@litsx/compiler": patch
"@litsx/core": patch
"@litsx/ssr": patch
---

Preserve imported component constructors across JSX lowering so direct props,
declared attribute aliases, and spreads resolve through one component API in
browser and SSR builds. Finalize Lit property metadata before runtime inference,
make compiled SSR spread templates explicit, and hydrate them without replacing
the server-rendered host or structural branch. Keep virtual JSX position
remapping linear as complex templates add generated Lit bindings.
