# useOnCommit

Run synchronous commit-phase work before the browser paints the next frame. Use this when the effect must read layout or apply imperative DOM work immediately after commit. Think of useOnCommit as the place for DOM work that is part of committing the frame, not for general side effects.

- Kind: `Hook`

## Reference

```ts
import { useOnCommit } from "litsx";
```

```ts
useOnCommit(callback: () => void | (() => void), deps?: unknown[]): void
```

## Usage

Call useOnCommit for measurement, focus management, or DOM synchronization that should not wait for a later frame.

Prefer useAfterUpdate for non-visual side effects so commit work stays small.

Keep the callback short and focused on DOM work that must happen immediately after commit.

## Behavior

- The effect runs during the host commit phase, before passive effects are flushed.
- Cleanup runs before the next committed version of the effect and when the host disconnects.
- Expensive work in useOnCommit lengthens the commit path for the current host, so reserve it for work that cannot wait.

## Mental Model

useOnCommit sits on the critical path between "the DOM just updated" and "the browser can paint". Use it when timing matters.

## Examples

```ts
useOnCommit(() => {
  if (shouldFocus) {
    inputRef.current?.focus();
  }
}, []);
```

## Pitfalls

- Avoid network work, heavy computation, or long-running tasks in useOnCommit. They delay visual updates for the current host.
- Prefer useAfterUpdate if the effect can happen a little later without affecting what the user sees in the current frame.

## Parameters

### `callback`

Type: `() => void | (() => void)`

Commit-phase logic to run immediately after the DOM update.

### `deps`

Type: `unknown[]`

Reactive values that control when the effect is re-run.

## Related

- [useAfterUpdate](./useafterupdate.md)
- [useRef](./useref.md)