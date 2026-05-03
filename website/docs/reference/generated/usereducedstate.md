# useReducedState

Manage local state with a reducer. Think of useReducedState as a way to centralize several related transitions behind explicit actions.

- Kind: `Hook`

## Reference

```ts
import { useReducedState } from "@litsx/litsx";
```

```ts
useReducedState<TState, TAction, TInitArg = TState>(reducer: (state: TState, action: TAction) => TState, initialArg: TInitArg, init?: (arg: TInitArg) => TState): [ TState, (action: TAction | ((value: TState) => TState)) => void ]
```

## Usage

Use useReducedState when updates are easier to describe as actions flowing through a reducer than as direct assignments.

This is a good fit for state machines, forms, and components with several related state transitions.

Prefer useState for isolated values. Reach for useReducedState when several transitions must stay centralized and explicit.

## Behavior

- The reducer receives the previous state and the dispatched action and returns the next state.
- The optional initializer runs once to derive the initial state from initialArg.
- Dispatching an action schedules an update for the current host with the reducer result as the next state.

## Mental Model

The reducer is the single place that explains how this slice of state changes over time. Actions describe events; the reducer decides the next state.

## Examples

```ts
const [panel, dispatch] = useReducedState(panelReducer, {
  open: false,
  section: "details",
});

dispatch({ type: "open", section: "activity" });
```

## Pitfalls

- If state transitions are simple direct assignments, useState is usually easier to read.
- Keep reducers deterministic and side-effect free. They run as part of deciding the next render state.

## Parameters

### `reducer`

Type: `(state: TState, action: TAction) => TState`

Reducer that maps the previous state and an action to the next state.

### `initialArg`

Type: `TInitArg`

Initial value passed directly to the reducer state or to the initializer.

### `init`

Type: `(arg: TInitArg) => TState`

Optional initializer that derives the starting state from initialArg.

## Returns

Type: `[TState, (action: TAction | ((value: TState) => TState)) => void]`

The current state and a dispatch function that sends actions to the reducer.

## Related

- [useState](./usestate.md)
- [useStableCallback](./usestablecallback.md)