# Counter Card

This example is a good first read because it shows the native Lit<sup>sx</sup> model in a small space:

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
- it shows that authored JSX and Lit semantics fit together cleanly
- it is small enough to understand without reading transform output

## Next

- [Property Inference](./property-inference.md)
- [JSX Authoring](../guides/jsx-authoring.md)
- [Styling](../guides/styling.md)
