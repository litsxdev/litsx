---
"@litsx/core": minor
"@litsx/typescript": patch
"@litsx/babel-preset-react-compat": patch
---

Refine `useExpose()` so it can publish imperative methods directly on the host instance or through an explicit ref channel.

Host-targeted `useExpose()` calls now install methods on the component instance itself, while ref-targeted calls continue to support forwarded imperative handles. When multiple `useExpose()` calls publish the same method on the same target, the last publisher wins and earlier implementations are restored automatically if later publishers disappear.

TypeScript-authored tooling now reports duplicate static `useExpose()` method declarations as warning `91023` instead of treating them as hard failures, which keeps composed imperative surfaces flexible while still surfacing likely mistakes.

The React compatibility preset keeps lowering `useImperativeHandle()` onto the explicit ref-targeted `useExpose()` signature so forwarded refs continue to map to the intended imperative channel.
