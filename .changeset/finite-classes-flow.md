---
"@litsx/unocss": patch
---

Resolve finite local constants, maps, aliases, and exact imports referenced by
component class bindings without requiring duplicate `Component.styles`
guards. Preserve per-component ownership, dependency invalidation, HMR refresh,
and deduplication with explicit guards.
