# useTransition

Schedule non-urgent updates and track whether they are pending. Think of useTransition as a way to split an interaction into urgent work now and heavier work that can follow without blocking responsiveness.

- Kind: `Hook`

## Reference

```ts
import { useTransition } from "@litsx/litsx";
```

```ts
useTransition(): [ boolean, (callback: () => void) => void ]
```

## Usage

Use useTransition when a UI interaction should stay responsive while heavier follow-up work completes in the background.

The returned boolean tells you whether the transition is still pending so the component can reflect that in the UI.

Keep urgent state updates outside the transition and move only the expensive follow-up work into the transition callback.

## Behavior

- The returned start function schedules work through the host transition machinery.
- The pending flag stays true while transition work is still unresolved.
- Transitions are host-scoped. A pending transition only reflects non-urgent work scheduled for the current component host.

## Mental Model

A transition is not a different kind of state. It is a different priority for updating the UI.

## Examples

```ts
const [isPending, startTransition] = useTransition();
startTransition(() => {
  setSearchQuery(nextQuery);
});
```

## Pitfalls

- Do not wrap every update in a transition. Use it when keeping input or interaction responsiveness matters more than reflecting every expensive change immediately.
- The pending flag only tells you about transition work started by the current host, not about the whole application.

## Returns

Type: `[boolean, (callback: () => void) => void]`

A pending flag and a function that schedules non-urgent work.

## Related

- [useDeferredValue](./usedeferredvalue.md)
- [useState](./usestate.md)