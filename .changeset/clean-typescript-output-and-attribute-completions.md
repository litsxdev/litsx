---
"@litsx/compiler": patch
"@litsx/typescript-plugin": patch
---

Strip TypeScript-only syntax from final compiler output after consumer output plugins run, including interfaces, type aliases, assertions, and generics in `.litsx` compilation.

Improve authored attribute completions to rank camel-case word segment matches more naturally.
