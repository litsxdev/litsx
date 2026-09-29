---
"@litsx/babel-plugin-litsx-proptypes": patch
"@litsx/babel-plugin-shared-hooks": patch
"@litsx/babel-plugin-transform-jsx-html-template": patch
"@litsx/babel-plugin-transform-litsx-scoped-elements": patch
"@litsx/babel-preset-litsx": patch
"@litsx/babel-preset-react-compat": patch
"@litsx/compiler": patch
"@litsx/core": patch
"@litsx/eslint-plugin": patch
"@litsx/unocss": patch
"create-litsx-app": patch
---

Move the compiler and lint integrations to Babel 8, ESLint 10, and Node 24 while retaining ESLint 9 compatibility. Refresh generated Storybook and Playwright versions, consume patched transitive dependencies, and support Chromium's native scoped-registry creation scope across shadow and projected light DOM.
