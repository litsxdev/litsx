---
"@litsx/core": patch
"@litsx/typescript": patch
"@litsx/babel-plugin-shared-hooks": patch
"@litsx/babel-preset-litsx": patch
"@litsx/compiler": patch
"@litsx/vite-plugin": patch
"@litsx/babel-preset-react-compat": patch
"@litsx/babel-plugin-transform-litsx-scoped-elements": patch
"@litsx/eslint-plugin": patch
"create-litsx-app": patch
---

Fix native ref forwarding so authored `ref` props are not overwritten by the host fallback when a component explicitly forwards the ref to a native element or child component. Named local callback refs on native elements are now lowered through the DOM ref lifecycle path, enabling composed local/public refs.

Align intrinsic label/output typing and diagnostics so LitSX-authored native elements can use the DOM-aligned `for` attribute while `htmlFor` remains compatibility syntax.
