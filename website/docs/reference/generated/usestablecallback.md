# useStableCallback

Keep a callback stable until its dependencies change. Think of useStableCallback as a stable function reference for places where callback identity matters.

- Kind: `Hook`

## Reference

```ts
import { useStableCallback } from "litsx";
```

```ts
useStableCallback<T extends (...args: never[]) => unknown>(callback: T, deps?: unknown[]): T
```

## Usage

Use useStableCallback when you want a callback value to stay referentially stable across renders.

This is most useful when the callback is passed to another hook, an imperative API, or a child component that keys off identity.

Prefer useStableCallback when identity stability matters. If a callback is only used inline in the same render path, a plain function is often enough.

## Behavior

- The returned function keeps the same identity until one of the listed dependencies changes.
- Use this to avoid downstream work caused by unstable callback references.
- The callback body is still recreated from the current render when dependencies change, so include every reactive value the callback reads.

## Mental Model

useStableCallback is about preserving callback identity, not caching results. Use it when changing function references would cause other parts of the UI to do unnecessary work.

## Examples

```ts
const handleSelect = useStableCallback((id) => {
  setSelectedId(id);
  trackSelection(id);
}, [setSelectedId, trackSelection]);
```

## Pitfalls

- Do not wrap every callback in useStableCallback by default. If nothing observes callback identity, a plain inline function is usually clearer.
- Dependencies still matter. If the callback reads reactive values, include them so the stable callback does not observe stale data.

## Parameters

### `callback`

Type: `T`

Callback whose identity should remain stable between renders.

### `deps`

Type: `unknown[]`

Reactive values that decide when a new callback should be produced.

## Returns

Type: `T`

A callback with stable identity for the current dependency set.

## Related

- [useMemoValue](./usememovalue.md)
- [useExpose](./useexpose.md)