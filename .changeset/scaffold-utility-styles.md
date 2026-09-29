---
"create-litsx-app": minor
"@litsx/tailwind": minor
"@litsx/storybook": patch
---

Add `css`, `tailwind`, and `unocss` styling profiles to every
`create-litsx-app` template, including Vite, Vitest, Storybook, and SSR wiring.

Expose split Tailwind Vite composition for framework-owned plugin ordering.
SSR templates keep Vite orchestration in the generated application and use the
existing SSR rendering APIs without widening the `@litsx/ssr` contract.

Keep Storybook's structural CSF validation independent from compiler authoring
and output plugins so Tailwind and UnoCSS composition reaches the real LitSX
transform without requiring an AST runtime in the validation-only pass.
