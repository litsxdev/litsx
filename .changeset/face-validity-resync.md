---
"@litsx/core": patch
---

Resync FACE validity state from live `ElementInternals` data during render so hosts expose up-to-date `validity` and `validationMessage` values even after prior validation errors are cleared outside the hook entrypoints.
