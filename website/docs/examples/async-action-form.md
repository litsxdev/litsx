# Async Action Form

This example shows an authored async mutation flow instead of just a loading spinner.

- `useAsyncState(...)` owns the authoritative value
- `pending`, `error`, and `reset()` stay on the same surface
- the component keeps normal JSX structure while the mutation logic stays explicit

<script setup>
import { useAsyncStateExampleSource } from "../.vitepress/theme/components/playground-example-source.js";
</script>

<ClientOnly>
  <litsx-playground
    exportname="UseAsyncStateDemo"
    previewtagname="docs-example-async-action-form"
    filename="/playground/AsyncActionForm.tsx"
    panelmaxheight="30rem"
  >{{ useAsyncStateExampleSource }}</litsx-playground>
</ClientOnly>

## What To Notice

- the async mutation is modeled directly, not hidden behind ad hoc booleans
- error and pending state do not need separate hand-rolled state fields
- this is a stronger demo of the runtime surface than a decorative card

## Next

- [Optimistic List](./optimistic-list.md)
- [Async UI](../guides/suspense.md)
- [useAsyncState](../reference/generated/useasyncstate.md)
