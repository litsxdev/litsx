---
"@litsx/compiler": minor
"@litsx/unocss": patch
"@litsx/tailwind": minor
---

Expose build-tool-neutral utility-class analysis from the compiler, refactor
UnoCSS to consume it, and add the official Tailwind CSS v4 Vite integration.

Tailwind utilities are extracted per component from literal and finite class
bindings, explicit local style guards, and only matching safelist candidates.
Shadow components receive isolated CSSResults; light DOM supports global and
native `@scope` output; shared preflight, theme, and inert property
infrastructure cover HMR, lazy imports, SSR, hydration, and property-backed
utilities without leaking component selectors globally.
