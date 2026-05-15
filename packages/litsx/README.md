# @litsx/litsx

Deprecated compatibility wrapper for `@litsx/core`.

New projects should install and import from `@litsx/core`:

```js
import { useState } from "@litsx/core";
```

Existing imports from `@litsx/litsx` and its JSX/runtime subpaths remain supported for compatibility. This package intentionally does not emit runtime deprecation warnings because application code may import it in browsers.
