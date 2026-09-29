---
"@litsx/core": patch
---

Restore target-aware object refs that can be shared across compatible HTML
intrinsics, including `HTMLButtonElement | HTMLAnchorElement`. Overlapping HTML
and SVG intrinsic names now use the HTML element type for events and refs while
preserving SVG attributes and runtime namespace handling.
