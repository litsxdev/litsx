# useOptimistic

Apply an optimistic overlay on top of authoritative state. Think of useOptimistic as the native Lit<sup>sx</sup> primitive for showing temporary optimistic UI while authoritative state catches up.

- Kind: `Hook`

## Reference

```ts
import { useOptimistic } from "litsx";
```

```ts
useOptimistic<TState, TInput>(state: TState, updateFn: (currentState: TState, optimisticValue: TInput) => TState): [ TState, (value: TInput) => void, () => void ]
```

## Usage

Use useOptimistic when the UI should immediately reflect an expected outcome before the authoritative state changes.

Pass an update function when optimistic inputs should be reduced over the current state instead of simply replacing it.

Call resetOptimistic() when the optimistic overlay should be discarded explicitly, such as after a failed mutation or a retry.

## Behavior

- The first argument is always the authoritative base state.
- addOptimistic(...) queues optimistic inputs and recomputes the overlay by replaying them over the current base state.
- If the base state changes by Object.is, the optimistic queue is cleared and the hook re-anchors to the new base state.

## Mental Model

useOptimistic layers temporary expectations over real state. The base stays authoritative; the overlay stays disposable.

## Examples

```ts
const [optimisticTodos, addTodoOptimistic, resetOptimisticTodos] = useOptimistic(
  todos,
  (currentTodos, optimisticTodo) => [...currentTodos, optimisticTodo]
);

addTodoOptimistic({ id: "temp-1", title: draftTitle });
```

## Pitfalls

- useOptimistic does not persist the optimistic queue across authoritative state changes.
- Keep updateFn deterministic. The optimistic overlay is recomputed by replaying queued inputs during render.

## Parameters

### `state`

Type: `TState`

### `updateFn`

Type: `(currentState: TState, optimisticValue: TInput) => TState`

## Returns

Type: `[TState, (value: TInput) => void, () => void]`

## Related

- [Primitives](../../guides/primitives.md)
- [Framework Reference](../../framework/generated/)