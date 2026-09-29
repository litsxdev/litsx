---
"@litsx/ssr": patch
"@litsx/vite-plugin": patch
"create-litsx-app": patch
---

Move the Vite-backed `createSsrDevServer` integration from `@litsx/ssr` to the
opt-in `@litsx/vite-plugin/ssr` entrypoint. `@litsx/ssr` now exposes a generic
authored-module loader contract and no longer declares, imports, or types Vite.
Update generated SSR projects to use the new entrypoint. This intentionally
removes the prerelease `createSsrDevServer` export from `@litsx/ssr`; migrate
imports to `@litsx/vite-plugin/ssr`.
