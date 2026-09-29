---
"@litsx/babel-plugin-transform-litsx-scoped-elements": patch
"@litsx/babel-preset-react-compat": patch
"@litsx/compiler": patch
"@litsx/core": patch
"@litsx/tailwind": patch
"@litsx/unocss": patch
"@litsx/vite-plugin": patch
---

Infer nested LitSX light-DOM hydration boundaries in both server and browser
templates, including pure Lit parents authored in project-local JavaScript or
TypeScript modules. Hydration now adopts the server-rendered child part so
subsequent child updates preserve node identity, while disconnecting and
reconnecting the child leaves connection ownership with the parent render.

Keep statically enumerable Tailwind candidates in real Vite builds and attach
scoped light-DOM utilities to their owning host without leaking them into the
document or sibling components.

Treat pure Lit class bodies as opaque in both utility integrations. Their
templates and static styles remain owned by Lit; only LitSX component classes
and genuinely free document JSX participate in utility extraction.
