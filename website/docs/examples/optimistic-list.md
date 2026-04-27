# Optimistic List

This example isolates the optimistic overlay model without mixing it with unrelated concerns.

- one list is authoritative
- one list is the rendered optimistic view
- `useOptimistic(...)` owns the temporary queue and reset path

<script setup>
import { useOptimisticExampleSource } from "../.vitepress/theme/components/playground-example-source.js";
</script>

<ClientOnly>
  <litsx-playground
    exportname="UseOptimisticDemo"
    previewtagname="docs-example-optimistic-list"
    filename="/playground/OptimisticList.tsx"
    panelmaxheight="30rem"
  >{{ useOptimisticExampleSource }}</litsx-playground>
</ClientOnly>

## What To Notice

- the optimistic layer is separate from authoritative state instead of mutating it in place
- the reset path is part of the same primitive
- this is the sort of state choreography that benefits from a dedicated authored convention

## Next

- [Async Action Form](./async-action-form.md)
- [Controlled Disclosure](./controlled-disclosure.md)
- [useOptimistic](../reference/generated/useoptimistic.md)
