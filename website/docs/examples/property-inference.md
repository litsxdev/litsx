# Smart Props

This example is about keeping the prop contract TypeScript-first while still handling the awkward cases.

- prop types come from TypeScript
- `^properties(...)` only touches the props that need explicit metadata
- reflected booleans and JS-only values can live in the same authored API

<script setup>
import { propertyInferenceExampleSource } from "../.vitepress/theme/components/playground-example-source.js";
</script>

<ClientOnly>
  <litsx-playground
    exportname="ProfileCard"
    previewtagname="docs-example-property-inference"
    filename="/playground/ProfileCard.tsx"
    panelmaxheight="34rem"
  >{{ propertyInferenceExampleSource }}</litsx-playground>
</ClientOnly>

## What To Notice

- `active` reflects, while `tags`, `createdAt`, and `onSelect` stay JS-only
- `^properties(...)` is additive, not a replacement for inference
- the authored API stays close to the prop type instead of becoming decorator-heavy

## Next

- [Controlled Disclosure](./controlled-disclosure.md)
- [Async Action Form](./async-action-form.md)
- [Property Inference Guide](../guides/property-inference.md)
- [Static Hoists](../guides/static-hoists.md)
