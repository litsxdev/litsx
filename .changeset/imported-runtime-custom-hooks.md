---
"@litsx/babel-plugin-shared-hooks": patch
"@litsx/babel-preset-litsx": patch
"@litsx/compiler": patch
---

Detect imported custom hooks that call LitSX runtime hooks and inject the active host at their callsites so the compiled hook signature and consumer calls stay aligned.
