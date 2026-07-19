---
"@litsx/babel-plugin-transform-litsx-scoped-elements": patch
---

Replace the deprecated `@litsx/babel-parser` runtime import with the
`@litsx/authoring/parser` + `@babel/parser` pipeline and declare the runtime
dependencies needed by the published scoped-elements transform package.
