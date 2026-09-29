---
"@litsx/authoring": minor
"@litsx/babel-plugin-shared-hooks": minor
"@litsx/babel-plugin-transform-jsx-html-template": patch
"@litsx/babel-plugin-transform-litsx-scoped-elements": patch
"@litsx/babel-preset-litsx": minor
"@litsx/babel-preset-react-compat": patch
"@litsx/compiler": minor
"@litsx/eslint-plugin": minor
"@litsx/storybook": patch
---

Centralize component-tag derivation and hook authoring diagnostics in
`@litsx/authoring`. Component identifiers must now map directly to a valid
custom-element name: LitSX no longer invents framework prefixes for short names
such as `Switch` or `App`, while namespace members retain mappings such as
`Controls.Switch` to `controls-switch`.

Use the shared hook analyzer from the compiler, direct Babel transforms and new
recommended ESLint rules. Report hooks in unstable control flow, async render
scopes, handlers, deferred `useAsyncState` actions and nested hook definitions
with stable diagnostic codes. Keep React-specific primitives, including Radix's
polymorphic `Slot`, inside the optional react-compat adapter.
