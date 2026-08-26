---
"@litsx/babel-plugin-transform-litsx-scoped-elements": patch
"@litsx/babel-preset-react-compat": patch
"@litsx/compiler": patch
"@litsx/core": patch
"@litsx/tailwind": patch
"@litsx/vite-plugin": patch
---

Infer nested LitSX light-DOM hydration boundaries in both server and browser
templates, including pure Lit parents authored in project-local JavaScript or
TypeScript modules. Hydration now adopts the server-rendered child part so
subsequent child updates preserve node identity.

Keep statically enumerable Tailwind candidates in real Vite builds and attach
scoped light-DOM utilities to their owning host without leaking them into the
document or sibling components.
