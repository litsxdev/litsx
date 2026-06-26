---
"@litsx/typescript-session": patch
"@litsx/typescript": patch
---

Fix `litsx-tsc` virtualization for `.litsx` modules discovered through transparent module resolution, including projects that still keep a `declare module "*.litsx"` shim. Imported authored modules now pass through the same LitSX source virtualization as root files before TypeScript parses them.
