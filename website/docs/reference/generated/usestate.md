# useState

Store local component state. Think of useState as the default way to keep component-owned UI state alive across renders.

- Kind: `Hook`

## Reference

```ts
import { useState } from "@litsx/litsx";
```

```ts
useState<T>(initial: T | (() => T)): [ T, (next: T | ((value: T) => T)) => void ]
```

## Usage

Use useState for straightforward local state such as toggles, counters, or small pieces of component-owned UI data.

Pass a function when the initial value should be computed only once for the host instance.

Prefer useState when the next value can be described directly. Move to useReducedState when state transitions become coupled or action-shaped.

## Behavior

- The setter accepts either the next value or an updater function that receives the previous value.
- The initial value is created once per host instance, not on every render.
- Calling the setter schedules an update for the current host with the next state value.

## Mental Model

useState gives a component one remembered value and the function that replaces it. Reach for it first when the UI just needs to remember "what is the current value of X?".

## Examples

```ts
const [expanded, setExpanded] = useState(false);
const toggle = () => setExpanded((value) => !value);
```

## Pitfalls

- Do not mirror derived data into useState if it can be recomputed from props or other state during render.
- When the next value depends on the previous one, prefer the updater form so the transition stays explicit.

## Parameters

### `initial`

Type: `T | (() => T)`

Initial state value, or a function that lazily computes it once.

## Returns

Type: `[T, (next: T | ((value: T) => T)) => void]`

The current state and a setter for the next value.

## Related

- [useReducedState](./usereducedstate.md)
- [useTransition](./usetransition.md)