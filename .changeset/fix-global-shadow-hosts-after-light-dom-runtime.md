---
"@litsx/light-dom-registry": patch
"@litsx/litsx": patch
---

Preserve globally registered shadow-DOM component constructors after the light DOM registry runtime patches `HTMLElement`, so subsequent instances remain newable and Storybook-style hosts do not fail after light-DOM features are activated.
