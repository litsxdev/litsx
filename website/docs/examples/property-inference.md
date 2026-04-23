# Property Inference

This example shows how typed props, static hoists, and reflected metadata fit together in normal authored code.

- prop types come from TypeScript
- `^properties(...)` only overrides the parts that need explicit metadata
- the component still reads like ordinary JSX-authored UI

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

- `active`, `tags`, `createdAt`, and `onSelect` do not all need the same metadata
- `^properties(...)` is additive, not a replacement for inference
- the authored API stays TypeScript-first instead of class-metadata-first

## Next

- [Counter Card](./counter-card.md)
- [Property Inference Guide](../guides/property-inference.md)
- [Static Hoists](../guides/static-hoists.md)
