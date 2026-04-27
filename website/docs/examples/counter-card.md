# Counter Card

This example is now the compact support demo, not the main sales pitch.

- local state with `useState(...)`
- component-owned styling with `^styles(...)`
- dynamic CSS values with `useStyle(...)`
- Lit-flavored event bindings in authored JSX

<script setup>
import { counterExampleSource } from "../.vitepress/theme/components/playground-example-source.js";
</script>

<ClientOnly>
  <litsx-playground
    exportname="Counter"
    previewtagname="docs-example-counter-card"
    filename="/playground/Counter.tsx"
    panelmaxheight="32rem"
  >{{ counterExampleSource }}</litsx-playground>
</ClientOnly>

## Why This Example Matters

- it is fully native Lit<sup>sx</sup>, not a migration case
- it keeps the entire authoring model readable in one screen
- it works best as a quick orientation example before the stronger pattern demos

## Next

- [Controlled Disclosure](./controlled-disclosure.md)
- [Smart Props](./property-inference.md)
- [JSX Authoring](../guides/jsx-authoring.md)
- [Styling](../guides/styling.md)
