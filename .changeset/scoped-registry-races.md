---
"@litsx/babel-plugin-transform-litsx-scoped-elements": patch
"@litsx/babel-preset-litsx": patch
"@litsx/babel-preset-react-compat": patch
"@litsx/light-dom-registry": patch
"@litsx/litsx": patch
"@litsx/vite-plugin": patch
"create-litsx-app": patch
---

Fix scoped custom element registry races across shadow DOM, light DOM, global registrations, authored static element maps, projected renderer output, and Storybook Vite optimize-deps configuration.
