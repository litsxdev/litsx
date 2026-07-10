---
"@litsx/core": patch
"@litsx/typescript": patch
---

Accept native form-specific listener bindings on intrinsic `<form>` elements. `@reset` and `@formdata` are now part of the known authored event set, and the corresponding JSX event props are typed with `currentTarget: HTMLFormElement`.
