---
"@litsx/core": minor
"@litsx/authoring": patch
"@litsx/babel-plugin-transform-jsx-html-template": patch
"@litsx/babel-preset-litsx": patch
"@litsx/compiler": patch
---

Add native inline SVG to the public LitSX JSX contract. Type SVG elements and
attributes without a permissive global index, serialize JSX-friendly SVG
attribute aliases, preserve SVG namespaces for dynamic fragments and spreads,
and return descendants of `foreignObject` to HTML across client rendering, SSR,
and hydration. React compatibility also lowers React's full SVG camelCase alias
set, namespaced XLink/XML attributes, `className`, events, and spread props onto
the same SVG-safe runtime contract.
