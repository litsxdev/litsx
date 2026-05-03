---
"@litsx/litsx": patch
"create-litsx-app": patch
---

Fix lazy scoped element registration inside `SuspenseBoundary` content renderers
when the boundary inherits its scoped custom element registry from the enclosing
shadow root.

Refresh the generated `create-litsx-app` demo styling to better match the LitSX
brand direction with stronger typography, warmer surfaces, and more intentional
starter layouts.
