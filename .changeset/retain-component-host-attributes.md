---
"@litsx/authoring": patch
"@litsx/babel-preset-litsx": patch
"@litsx/core": patch
---

Preserve standard HTML, ARIA, and data attributes on local and imported LitSX
component hosts. Runtime spreads now keep those attributes out of native
component rest-props bags, retain JSX source precedence, and use the same
attribute classification in browser and SSR output. Expand the native JSX type
surface for standard custom-element host attributes.
