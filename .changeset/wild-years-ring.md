---
"create-litsx-app": patch
"@litsx/vite-plugin": patch
---

Fix the generated Storybook setup so it uses a published, installable dependency
set instead of pinning unavailable Storybook package versions.

Update the Vite plugin to configure dependency optimization via
`optimizeDeps.rolldownOptions` so it no longer triggers Vite's
`optimizeDeps.esbuildOptions` deprecation warning.
