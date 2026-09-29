---
"@litsx/core": patch
"@litsx/babel-plugin-shared-hooks": patch
"@litsx/babel-preset-litsx": patch
---

Keep native callback and object refs synchronized when a render suspends, resumes, changes target, or disconnects. Native ref lowering now also handles member expressions and aliases without serializing ref values into HTML attributes, including defaulted destructured props.
