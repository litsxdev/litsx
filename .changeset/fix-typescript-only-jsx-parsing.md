---
"@litsx/compiler": patch
---

Infer authored JSX parsing from the filename after removing Vite query strings.
Plain `.ts`, `.mts`, and `.cts` modules now use TypeScript-only parsing, while
JSX extensions retain JSX parsing and the public `requireJsx` override remains
available. Apply the same policy to both compiler passes and static utility
import resolution so Vite, optimize-deps, UnoCSS extraction, and light-DOM SSR
accept generic TypeScript arrows without losing imported utility classes.
