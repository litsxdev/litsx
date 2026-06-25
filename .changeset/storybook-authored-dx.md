---
"@litsx/babel-plugin-transform-jsx-html-template": patch
"@litsx/babel-preset-litsx": patch
"create-litsx-app": patch
---

Improve authored Storybook DX by auto-registering imported LitSX components and local story hosts in generated scaffolds, allowing local PascalCase story hosts to be rendered directly with natural JSX props, and materializing bare `props` references as prop snapshots instead of reading a synthetic `this.props` field.
