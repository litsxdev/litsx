---
"@litsx/core": patch
---

Add internal host middleware runtime plumbing for future structural hooks. The runtime composes lifecycle middlewares with `next()`, keeps structural entry state available for render-time reads, and exposes a reusable host mixin without coupling the feature to `EffectsController` or any domain-specific hook API.
