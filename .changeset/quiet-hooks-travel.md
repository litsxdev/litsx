---
"@litsx/babel-preset-litsx": patch
"@litsx/compiler": patch
"@litsx/vite-plugin": patch
---

Accept external native LitSX custom hooks published in JavaScript or TypeScript
modules without JSX when their resolved export graph demonstrably reaches the
official LitSX runtime. Library compilation continues to emit
`Symbol.for("litsx.hook")` metadata, package authors no longer need JSX file
extensions to trigger hook compilation, and opaque or React-backed external
hooks remain rejected.
