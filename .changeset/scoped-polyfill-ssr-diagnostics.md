---
"@litsx/core": patch
"@litsx/ssr": patch
---

Keep scoped LitSX children compatible with `@webcomponents/scoped-custom-element-registry` by replacing polyfilled registries with the LitSX scoped runtime, and surface SSR development logs and render failures in the browser.
