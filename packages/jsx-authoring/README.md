# @litsx/jsx-authoring

Deprecated compatibility wrapper for `@litsx/authoring`.

New tooling should import from `@litsx/authoring`:

```js
import { virtualizeLitsxSource } from "@litsx/authoring";
```

Existing imports from `@litsx/jsx-authoring` and `@litsx/jsx-authoring/parser` remain supported for compatibility. Tooling imports emit a deprecation warning once unless `LITSX_DISABLE_DEPRECATION_WARNINGS=1` is set.
