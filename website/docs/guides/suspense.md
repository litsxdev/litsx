# Async UI

Lit<sup>sx</sup> models asynchronous UI with native primitives:

- `SuspenseBoundary`
- `SuspenseList`
- `useAsyncState(...)`
- `useOptimistic(...)`

Lazy loading fits into the same model: an async region resolves behind a boundary, and the boundary decides when fallback or content should be shown.

## Design Direction

- suspense is expressed as components, not opaque helper calls
- async component loading resolves through boundaries instead of through a separate authored API surface
- `SuspenseList` coordinates reveal order in light DOM
- async reads and async mutations are treated as different jobs

## What These Primitives Do

- `SuspenseBoundary` owns fallback rendering for one async region
- `SuspenseList` coordinates how several sibling boundaries reveal
- `useAsyncState(...)` owns authoritative async mutations started by the user
- `useOptimistic(...)` layers temporary optimistic UI over authoritative state
- both primitives live in the authored component tree, so their layout and styling remain part of normal Lit<sup>sx</sup> composition

## Reads vs Mutations

Lit<sup>sx</sup> keeps async reads and async mutations separate on purpose.

- Use `SuspenseBoundary` when rendering may pause because data or a lazy dependency is not ready yet.
- Use `useAsyncState(...)` when an event starts asynchronous work such as save, refresh, confirm, or retry.
- Use `useOptimistic(...)` when the UI should temporarily show the expected result of that mutation before the authoritative state catches up.

That means:

- `SuspenseBoundary` is for "this render cannot finish yet"
- `useAsyncState(...)` is for "this action is in flight"
- `useOptimistic(...)` is for "show the expected result while that action is in flight"

`useTransition(...)` still fits underneath that model as a pending/priority primitive. It does not replace `useAsyncState(...)`, and it does not solve optimistic UI by itself.

## Example

This playground keeps the async model deliberately small:

- each profile panel resolves on its own delay
- each one sits behind its own `SuspenseBoundary`
- `<SuspenseList reveal-order="forwards">` prevents the later panel from revealing ahead of the earlier one

Use the replay button to watch the list coordinate the reveal sequence again.

<script setup>
import {
  suspenseExampleSource,
} from "../.vitepress/theme/components/playground-example-source.js";
</script>

<ClientOnly>
  <litsx-playground
    exportname="AsyncShowcase"
    previewtagname="docs-async-showcase-preview"
    filename="/playground/AsyncShowcase.tsx"
    panelmaxheight="34rem"
  >{{ suspenseExampleSource }}</litsx-playground>
</ClientOnly>

## When To Use Them

Use `SuspenseBoundary` when one part of a component may pause independently of the rest of the view.

Use `SuspenseList` when several async sections belong to the same reading flow and should reveal in a predictable order.

Use `useAsyncState(...)` when the user starts async work and the component must track pending, error, reset, and the latest committed result.

Use `useOptimistic(...)` when that same interaction should also render a temporary optimistic overlay before authoritative state catches up.

## See Also

- [Primitives](./primitives.md)
- [useAsyncState](../reference/generated/useasyncstate.md)
- [useOptimistic](../reference/generated/useoptimistic.md)
- [Reference](../reference/)
- [Examples](../examples/)
