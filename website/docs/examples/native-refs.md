# Native Refs

This example shows the native Lit<sup>sx</sup> ref model in one place:

- component instance refs
- forwarded DOM refs
- imperative handles published with `useExpose(...)`

The important idea is that `ref` is one channel, but the receiving component chooses what that channel resolves to.

<script setup>
import { nativeRefResolutionExampleSource } from "../.vitepress/theme/components/playground-example-source.js";
</script>

<ClientOnly>
  <litsx-playground
    exportname="NativeRefResolutionDemo"
    previewtagname="docs-example-native-refs"
    filename="/playground/NativeRefResolutionDemo.tsx"
    panelmaxheight="34rem"
  >{{ nativeRefResolutionExampleSource }}</litsx-playground>
</ClientOnly>

## What To Notice

- the parent always writes `ref={...}`
- `HostRefCard` leaves the ref alone, so the parent gets the component instance
- `ForwardedDomInput` forwards the ref to an inner `input`
- `ImperativeHandleInput` publishes a stable command API instead of exposing raw internals

## When To Use Each Shape

- use the component instance when the component itself is the public API
- use a DOM ref when the component is intentionally a thin wrapper around one element
- use an imperative handle when you want a stable command surface such as `focus()`, `clear()`, or `value()`

## Next

- [Controlled Disclosure](./controlled-disclosure.md)
- [Refs](../guides/refs.md)
- [React Search Card](./react-search-card.md)
- [useRef](../reference/generated/useref.md)
- [useExpose](../reference/generated/useexpose.md)
