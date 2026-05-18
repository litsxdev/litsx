---
"@litsx/babel-plugin-transform-jsx-html-template": patch
"@litsx/compiler": patch
---

Declare `source-map-js` explicitly so Yarn Plug'n'Play and other strict resolvers can load the published compiler pipeline without undeclared dependency errors.
