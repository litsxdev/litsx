---
"@litsx/babel-preset-litsx": patch
"@litsx/compiler": patch
"@litsx/vite-plugin": patch
"@litsx/storybook": patch
---

Recognize resolvable Lit component classes imported from external packages, including `node_modules`. Direct and namespace `LitElement` imports, aliases, inheritance, analyzable mixin chains, named/default reexports, `export *` barrels, and JavaScript or TypeScript module extensions no longer emit the external PascalCase inference warning. Opaque components and classes using unrelated same-named bases continue to warn.
