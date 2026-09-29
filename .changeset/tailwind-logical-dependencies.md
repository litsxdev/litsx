---
"@litsx/tailwind": patch
---

Report Tailwind entry, config, and imported dependencies through the host's logical project root
when the project is reached through a symlink. Development watchers can now invalidate generated
component CSS consistently on platforms whose temporary or workspace roots have physical aliases.
