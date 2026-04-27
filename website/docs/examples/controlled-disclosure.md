# Controlled Disclosure

This is one of the clearest places where Lit<sup>sx</sup> authoring feels lighter.

- one component supports `open`, `defaultOpen`, and `onOpenChange`
- `useControlledState(...)` keeps the wiring local to the render function
- the public API still looks like a normal design-system primitive

<script setup>
import { controlledStateExampleSource } from "../.vitepress/theme/components/playground-example-source.js";
</script>

<ClientOnly>
  <litsx-playground
    exportname="Disclosure"
    previewtagname="docs-example-controlled-disclosure"
    filename="/playground/Disclosure.tsx"
    panelmaxheight="30rem"
  >{{ controlledStateExampleSource }}</litsx-playground>
</ClientOnly>

## What To Notice

- the authored code stays in one function instead of splitting state semantics across class fields
- the controlled and uncontrolled paths share the same render logic
- this is the kind of reusable component API where conventions matter more than raw LOC

## Next

- [Smart Props](./property-inference.md)
- [Optimistic List](./optimistic-list.md)
- [useControlledState](../reference/generated/usecontrolledstate.md)
