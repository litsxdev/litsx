---
"@litsx/babel-plugin-transform-jsx-html-template": patch
"@litsx/babel-preset-litsx": patch
"@litsx/compiler": patch
"@litsx/core": patch
---

Tighten the `.litsx` `style` contract to reject object-valued JSX `style`
bindings, document the string-only inline style behavior, and keep the public
types aligned with that runtime/compiler rule.

Fix authored component lowering so destructuring from opaque `props` aliases
continues to resolve against the host instance, preserving SSR output for
hydrated components that read values like `href`, `label`, `title`, or `body`
from `props`.

Escape backticks and literal interpolation markers in generated SSR template
segments so authored text content containing `` ` `` or `${...}` survives
compilation without producing invalid output.
