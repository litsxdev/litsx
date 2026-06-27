---
"@litsx/core": patch
---

Improve virtualized `@event` handler typing so known DOM events keep useful event types and custom authored events can use `CustomEvent` handlers instead of being forced to generic `Event`.
