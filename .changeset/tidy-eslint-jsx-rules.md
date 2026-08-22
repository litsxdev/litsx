---
"@litsx/eslint-plugin": patch
---

Remove the obsolete `no-react-memo` native JSX rule now that React wrapper
semantics belong to the optional react-compat compiler pipeline. Drop unused
syntax-plugin dependencies and the unnecessary TypeScript peer, and derive the
ESLint plugin metadata version from its package manifest.
