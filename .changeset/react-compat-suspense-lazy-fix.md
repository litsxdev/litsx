---
"@litsx/babel-preset-react-compat": patch
---

Keep manually-authored `ensureLazyElement(...)` calls out of the generated
Suspense content wrapper so React-compat lazy registration preserves the
expected execution order during SSR and retries.
