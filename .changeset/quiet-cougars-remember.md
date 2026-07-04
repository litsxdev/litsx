---
"@litsx/core": minor
"@litsx/babel-preset-litsx": minor
"@litsx/babel-plugin-shared-hooks": patch
"@litsx/compiler": patch
---

Add `useFormValue()` as a form-associated structural hook in `@litsx/core`, including FACE lifecycle plumbing for `formAssociatedCallback`, `formDisabledCallback`, `formResetCallback`, and `formStateRestoreCallback`.

Expose the new hook through the LitSX transforms so authored components can import it from `@litsx/core` and compile correctly through the preset and compiler facade.

Also improve renderer-prop lowering for stored JSX expressions and avoid false external-component warnings when PascalCase LitSX components are re-exported through intermediary modules.
