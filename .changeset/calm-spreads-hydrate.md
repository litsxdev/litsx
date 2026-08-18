---
"@litsx/core": minor
"@litsx/babel-plugin-transform-jsx-html-template": minor
"@litsx/ssr": patch
---

Render JSX spread attributes through an `ElementPart` in the browser while retaining regular Lit parts during SSR. Add digest reconciliation and hydration wrappers that preserve server DOM identity without patching Lit, infer third-party component properties from their constructors, and avoid redundant attribute writes during hydration.
