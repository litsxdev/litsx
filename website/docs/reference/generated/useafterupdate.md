# useAfterUpdate

Run side effects after the host has committed its update. Use this for subscriptions, timers, or synchronizing with systems outside the component tree. Think of useAfterUpdate as the place for work that should happen after Lit<sup>sx</sup> has already committed the latest UI.

- Kind: `Hook`

## Reference

```ts
import { useAfterUpdate } from "litsx";
```

```ts
useAfterUpdate(callback: () => void | (() => void), deps?: unknown[]): void
```

## Usage

Call useAfterUpdate when work should happen after the DOM is updated, not during rendering.

Return a cleanup function when the effect creates a subscription or any other disposable resource.

## Behavior

- The effect runs after the host update cycle completes.
- If dependencies change, Lit<sup>sx</sup> runs the previous cleanup before running the next effect.

## Mental Model

useAfterUpdate is for side effects that observe or connect to the outside world after render has finished. It is not part of the render calculation itself.

## Examples

```ts
useAfterUpdate(() => {
  const handle = connectToSocket(roomId);
  return () => handle.disconnect();
}, [roomId]);
```

## Pitfalls

- Do not use useAfterUpdate to derive values that the component could compute during render.
- If the effect allocates subscriptions, timers, or handles, return a cleanup function so the host can dispose of them cleanly.

## Parameters

### `callback`

Type: `() => void | (() => void)`

Effect logic to run after commit. May return a cleanup function.

### `deps`

Type: `unknown[]`

Reactive values that control when the effect is re-run.

## Related

- [useOnCommit](./useoncommit.md)
- [JSX Authoring](../../guides/jsx-authoring.md)