---
"@litsx/core": minor
"@litsx/babel-plugin-transform-litsx-scoped-elements": minor
"@litsx/babel-preset-litsx": minor
"@litsx/babel-preset-react-compat": minor
"@litsx/compiler": minor
---

Normalize DOM runtime mixins around root mode: `ShadowDomMixin` and `LightDomMixin` are now the canonical mixins, and `LightDomMixin` also handles scoped light-DOM elements when `static elements` is present.
