# Primitives

Lit<sup>sx</sup> has its own public surface. The important thing is the authored API of the framework, not the code shape produced by transforms.

## Core Runtime Surface

These are the primitives that matter most when you write Lit<sup>sx</sup> directly:

- `ErrorBoundary`
- `SuspenseBoundary`
- `SuspenseList`

The runtime also exposes helpers such as `ensureLazyElement(...)`, but those are supporting pieces. They are relevant for transforms and advanced integration, not for day-one authoring.

`@litsx/litsx/jsx-runtime` and `@litsx/litsx/jsx-dev-runtime` are part of the tooling story, not the authored runtime surface. They matter for `jsxImportSource: "@litsx/litsx"` and editor integration; see [Tooling](./tooling.md).

For everyday component work, the runtime surface also includes the hooks that model state, DOM access, and effect timing:

- `useState(...)`
- `useMemoValue(...)`
- `useRef(...)`
- `useAsyncState(...)`
- `useOptimistic(...)`
- `useOnConnect(...)`
- `useEvent(...)`
- `useEmit(...)`
- `useOnCommit(...)`
- `useAfterUpdate(...)`

This example shows that split directly in one component:

- `useState(...)` keeps the counter alive across renders
- `useRef(...)` captures the rendered button
- `useOnCommit(...)` does immediate DOM work on the commit path
- `useAfterUpdate(...)` runs a little later as passive post-update work

<script setup>
import {
  controlledStateExampleSource,
  errorBoundaryExampleSource,
  primitivesExampleSource,
  useAsyncStateExampleSource,
  useOptimisticExampleSource,
} from "../.vitepress/theme/components/playground-example-source.js";
</script>

<ClientOnly>
  <litsx-playground
    exportname="RuntimeCard"
    previewtagname="docs-runtime-card-preview"
    filename="/playground/RuntimeCard.tsx"
    panelmaxheight="30rem"
  >{{ primitivesExampleSource }}</litsx-playground>
</ClientOnly>

`useMemoValue(...)`, `usePrevious(...)`, and `useControlledState(...)` extend that authored surface without changing the same core model:

- `useMemoValue(...)` keeps expensive derived values render-pure
- `usePrevious(...)` lets render logic compare against the previous frame
- `useControlledState(...)` supports controlled/uncontrolled library components

`useAsyncState(...)` and `useOptimistic(...)` cover two related but separate async jobs:

- `useAsyncState(...)` owns authoritative async mutations, pending, latest error, and reset
- `useOptimistic(...)` layers a temporary optimistic overlay on top of authoritative state

Use `useAsyncState(...)` when the component needs to drive a real async state transition such as save, refresh, or confirm. Use `useOptimistic(...)` when the UI should show a temporary expected outcome before authoritative state catches up.

That split matters:

- `useAsyncState(...)` owns authoritative async mutation state
- `useOptimistic(...)` owns a disposable optimistic overlay
- `SuspenseBoundary` owns async reads that pause render

If the question is "what should the UI show while we wait for a mutation?", reach for `useAsyncState(...)` and optionally `useOptimistic(...)`.

If the question is "what should this subtree show while render-time data is still unresolved?", reach for `SuspenseBoundary`.

### Authoritative Async State

This example focuses on the authoritative side of an async mutation:

- the saved value is the source of truth
- `pending` reflects in-flight work
- `error` is part of the same state surface
- `reset()` restores the authoritative state

Use this pattern when the component is coordinating a real async transition such as save, retry, or confirm.

<ClientOnly>
  <litsx-playground
    exportname="UseAsyncStateDemo"
    previewtagname="docs-use-async-state-preview"
    filename="/playground/UseAsyncStateDemo.tsx"
    panelmaxheight="30rem"
  >{{ useAsyncStateExampleSource }}</litsx-playground>
</ClientOnly>

### Optimistic Overlay

This example focuses on the temporary overlay:

- the left column shows the authoritative state
- the right column shows what the UI renders with optimistic values applied
- the optimistic layer can be discarded explicitly
- when authoritative state changes, the overlay re-anchors to it

Use this pattern when the UI should briefly show an expected outcome before the real state catches up.

<ClientOnly>
  <litsx-playground
    exportname="UseOptimisticDemo"
    previewtagname="docs-use-optimistic-preview"
    filename="/playground/UseOptimisticDemo.tsx"
    panelmaxheight="30rem"
  >{{ useOptimisticExampleSource }}</litsx-playground>
</ClientOnly>

## Authoring Model

Lit<sup>sx</sup> is Lit-flavored at the authored level:

- event listeners use `@event`
- property bindings use `.prop`
- boolean attributes use `?attr`
- Lit directives remain first-class in template expressions
- components are authored in JSX and compiled down to Lit-compatible output

That last point matters more than it may seem: when a problem is already a Lit template problem, the right answer is usually still a Lit directive.

So in native Lit<sup>sx</sup> code:

- use built-in directives such as `keyed(...)`, `when(...)`, `repeat(...)`, `cache(...)`, `guard(...)`, and `until(...)` when they fit
- use custom directives too, when your project already has them or needs them
- do not treat directives as something "outside" Lit<sup>sx</sup>; they are part of the intended authoring stack

## Connection-Scoped Work

`useOnConnect(...)`, `useEvent(...)`, and `useEmit(...)` cover three different event jobs:

- `useOnConnect(...)` registers and cleans up resources tied to the host being connected
- `useEvent(...)` gives those resources a stable callback that still sees fresh state and props
- `useEmit(...)` publishes public `CustomEvent`s from the current host without reaching for `this.dispatchEvent(...)`

Use `useOnConnect(...)` by itself when re-arming the resource on dependency changes is acceptable.

Pair it with `useEvent(...)` when you want to register once and avoid stale closures in listeners owned by `window`, `document`, observers, or other imperative APIs.

Reach for `useEmit(...)` when the component needs to publish a DOM event as part of its public API, such as `change`, `select`, or `open`.

The playground above focuses on render-time and post-render hooks. `useEvent(...)` fits the same runtime surface, but it matters most when the component also owns connection-scoped listeners or subscriptions.

## Controlled State

`useControlledState(...)` is mainly for reusable components and design-system APIs. It lets the same component work with:

- `value` controlled from outside
- `defaultValue` owned locally
- `onChange` notifications in both modes

<ClientOnly>
  <litsx-playground
    exportname="Disclosure"
    previewtagname="docs-controlled-state-preview"
    filename="/playground/Disclosure.tsx"
    panelmaxheight="30rem"
  >{{ controlledStateExampleSource }}</litsx-playground>
</ClientOnly>

## Suspense Primitives

`SuspenseBoundary` and `SuspenseList` are native Lit<sup>sx</sup> primitives for asynchronous UI.

- `SuspenseBoundary` owns fallback/content rendering and reveal phases
- `SuspenseList` coordinates reveal order across sibling boundaries
- both are designed around light DOM so styles can flow through from the containing component

## Failure Boundaries

`ErrorBoundary` is the native Lit<sup>sx</sup> primitive for recoverable synchronous render failures.

- it catches one subtree failing without taking down the whole component
- it keeps fallback UI latched once the error has been captured
- to retry, give the boundary a new identity with Lit's `keyed(...)`

<ClientOnly>
  <litsx-playground
    exportname="BoundaryDemo"
    previewtagname="docs-error-boundary-preview"
    filename="/playground/BoundaryDemo.tsx"
    panelmaxheight="32rem"
  >{{ errorBoundaryExampleSource }}</litsx-playground>
</ClientOnly>

## Next

- [JSX Authoring](./jsx-authoring.md)
- [Refs](./refs.md)
- [Async UI](./suspense.md)
