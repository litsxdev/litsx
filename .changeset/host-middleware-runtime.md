---
"@litsx/core": minor
"@litsx/babel-plugin-shared-hooks": minor
"@litsx/babel-preset-litsx": minor
---

Add host middleware runtime plumbing and structural hook compiler wiring. `defineHook()` marks structural hook definitions, authored static calls lower to `useStructuralEntry(...)`, generated hosts are wrapped with `HostMiddlewareMixin(...)`, and direct structural hook callsites emit static `structuralEntries` so lifecycle middleware exists before first render. Local and imported custom hooks can carry compiled structural metadata, structural hook readers can expand nested structural usage, and the preset can discover named or namespace structural hook imports from authored modules using relative, path-alias, or TypeScript module resolution. Structural entries remain one-to-one with authored callsites; resource dedupe belongs in hook-specific runtimes. Unsupported dynamic structural-hook patterns such as aliases, object/array containers, runtime selection, and computed namespace access now fail during transform with actionable code-frame diagnostics.
