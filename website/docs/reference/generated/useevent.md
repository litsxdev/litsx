# useEvent

Keep an event callback identity stable while always calling the latest logic. Think of useEvent as the bridge between connected imperative listeners and the latest render state.

- Kind: `Hook`

## Reference

```ts
import { useEvent } from "litsx";
```

```ts
useEvent<T extends (...args: never[]) => unknown>(callback: T): T
```

## Usage

Use useEvent when a callback is registered once with an external API but still needs fresh props or state.

This is most useful together with useOnConnect for window listeners, observers, timers, or other imperative subscriptions.

## Behavior

- The returned function keeps the same identity across renders.
- Each call delegates to the latest callback from the current render.

## Mental Model

useEvent gives outside code a stable function handle, while Lit<sup>sx</sup> keeps swapping the implementation behind it as renders happen.

## Examples

```ts
const onKeyDown = useEvent((event) => {
  if (event.key === "Escape" && open) {
    setOpen(false);
  }
});

useOnConnect(() => {
  window.addEventListener("keydown", onKeyDown);
  return () => window.removeEventListener("keydown", onKeyDown);
}, []);
```

## Pitfalls

- useEvent does not register or clean up anything by itself. Pair it with useOnConnect or another lifecycle hook when you need subscription management.

## Parameters

### `callback`

Type: `T`

Event callback whose body should stay fresh.

## Returns

Type: `T`

A stable callback reference that always delegates to the latest callback.

## Related

- [Primitives](../../guides/primitives.md)
- [Framework Reference](../../framework/generated/)