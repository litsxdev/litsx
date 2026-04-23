# Async Reveal Order

This example demonstrates the native async UI model with `SuspenseBoundary` and `SuspenseList`.

- each panel resolves independently
- reveal order is coordinated explicitly
- the authored code stays in JSX instead of dropping into low-level template machinery

<script setup>
import { suspenseExampleSource } from "../.vitepress/theme/components/playground-example-source.js";
</script>

<ClientOnly>
  <litsx-playground
    exportname="AsyncShowcase"
    previewtagname="docs-example-async-showcase"
    filename="/playground/AsyncShowcase.tsx"
    panelmaxheight="38rem"
  >{{ suspenseExampleSource }}</litsx-playground>
</ClientOnly>

## What To Notice

- `SuspenseBoundary` owns one async region
- `SuspenseList` owns reveal coordination across regions
- `keyed(...)` is still available when the reset/remount behavior is a template concern

## Next

- [Async UI](../guides/suspense.md)
- [Primitives](../guides/primitives.md)
- [React Search Card](./react-search-card.md)
