# useAsyncState

Manage async state transitions behind a single run function. Think of useAsyncState as the native Lit<sup>sx</sup> primitive for async mutations that need state, pending, and error tracking together.

- Kind: `Hook`

## Reference

```ts
import { useAsyncState } from "litsx";
```

```ts
useAsyncState<TState, TArgs extends unknown[] = [ ]>(initialState: TState | (() => TState), action: (state: TState, ...args: TArgs) => TState | Promise<TState>): [ TState, (...args: TArgs) => Promise<TState>, { pending: boolean; error: unknown | null; reset: () => void; } ]
```

## Usage

Use useAsyncState when a user action triggers synchronous or asynchronous work that should eventually commit the next state.

The action receives the latest committed state and any arguments passed to run(...).

Keep optimistic UI separate. useAsyncState models authoritative async state, not temporary optimistic overlays.

## Behavior

- run(...) always returns a Promise, even when the action is synchronous.
- pending is derived from the host-scoped transition machinery.
- Only the latest started run may commit state or error changes. Older completions are ignored for hook state.
- reset() restores the initial state, clears the latest error, and invalidates any in-flight completions.

## Mental Model

useAsyncState is a small async state machine: run work, reflect pending, commit the latest result, surface the latest error.

## Examples

```ts
const [profile, saveProfile, meta] = useAsyncState(initialProfile, async (current, draft) => {
  const saved = await saveProfileToServer(draft);
  return { ...current, ...saved };
});

await saveProfile(draft);
```

## Pitfalls

- useAsyncState does not cancel the underlying async work. It only prevents stale completions from mutating hook state.
- Keep action pure with respect to state transitions. Side effects that should run on success can happen after awaiting run(...).

## Parameters

### `initialState`

Type: `TState | (() => TState)`

### `action`

Type: `(state: TState, ...args: TArgs) => TState | Promise<TState>`

## Returns

Type: `[
  TState,
  (...args: TArgs) => Promise<TState>,
  {
    pending: boolean;
    error: unknown | null;
    reset: () => void;
  }
]`

## Related

- [Primitives](../../guides/primitives.md)
- [Framework Reference](../../framework/generated/)