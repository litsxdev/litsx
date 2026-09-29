---
"@litsx/ssr": patch
---

Render empty registered light-DOM roots during SSR so hydration adopts their
existing child nodes instead of creating the light tree on the client.
