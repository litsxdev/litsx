---
"@litsx/light-dom-registry": patch
"@litsx/core": patch
---

Upgrade existing host children when reconnecting contextual light DOM registries so reused hosts recover scoped custom elements after rerenders.

Define scoped elements again when reusing existing shadow roots so shadow DOM hosts preserve their scoped registries across hydration and host reuse paths.
