---
"@litsx/unocss": patch
---

Route UnoCSS preflight layers independently to document and component outputs, keeping the `theme` layer global by default so custom properties inherit through nested shadow roots. Materialize `virtual:uno.css` from the shared LitSX token lifecycle in production and development. Remove the legacy public placeholder protocol so author strings containing `@unocss-placeholder` remain untouched.
