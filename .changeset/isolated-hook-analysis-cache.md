---
"@litsx/babel-preset-litsx": patch
"@litsx/compiler": patch
---

Keep imported custom-hook module analysis in its own compiler-session cache so shared-hook analysis cannot poison element-candidate analysis for imported renderer helpers.
