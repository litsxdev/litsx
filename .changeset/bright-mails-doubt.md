---
"@litsx/light-dom-registry": patch
"@litsx/litsx": patch
---

Allow globally registered shadow-DOM LitSX components to stay newable after the light DOM registry runtime patches `HTMLElement`, including components defined before the light-DOM runtime activates.
