# useOnConnect

Run setup when the host is connected to the DOM, and dispose it when the host disconnects. Use this for global event listeners, subscriptions, observers, or resources that should only exist while the host is mounted. Think of useOnConnect as the lifecycle-aware place for work that follows the host's connection to the DOM, not its render timing.

- Kind: `Hook`

## Reference

```ts
import { useOnConnect } from "@litsx/litsx";
```

```ts
useOnConnect(callback: () => void | (() => void), deps?: unknown[]): void
```

## Usage

Call useOnConnect for resources tied to being connected, such as `window` listeners or store subscriptions.

Return a cleanup function to release the resource when the host disconnects, is adopted into a new document, or re-arms due to dependency changes.

## Behavior

- The callback runs once when the host becomes active and re-runs only when dependencies change while connected.
- Cleanup runs before a dependency-driven re-arm, on disconnect, and when the host is adopted into a new document.

## Mental Model

useOnConnect is about mount lifetime. It is not for DOM measurement and it is not part of the render/commit path.

## Examples

```ts
useOnConnect(() => {
  window.addEventListener("message", onMessage);
  return () => window.removeEventListener("message", onMessage);
}, []);
```

## Pitfalls

- Prefer useOnCommit when the work must happen immediately after the DOM commits, and prefer useAfterUpdate for passive post-update effects.

## Parameters

### `callback`

Type: `() => void | (() => void)`

Setup logic to run while the host is connected.

### `deps`

Type: `unknown[]`

Reactive values that control when the setup should be re-armed.

## Related

- [Primitives](../../guides/primitives.md)
- [Framework Reference](../../framework/generated/)