# useMemoValue

Memoize a derived value until its dependencies change. Think of useMemoValue as a render-time memo for expensive derived values.

- Kind: `Hook`

## Reference

```ts
import { useMemoValue } from "@litsx/litsx";
```

```ts
useMemoValue<T>(factory: () => T, deps?: unknown[]): T
```

## Usage

Use useMemoValue when a derived value is expensive enough that recalculating it every render would add noise or cost.

Keep the factory pure and derive the value only from the dependencies you pass in.

Reach for useMemoValue when a value is derived from props or state, not when you need to persist mutable state between renders.

## Behavior

- Lit<sup>sx</sup> compares dependencies with Object.is semantics.
- If no dependency array is provided, the value is recomputed on every render.
- The factory runs during render, so it should stay synchronous and free of side effects.

## Mental Model

useMemoValue does not store new state. It remembers the last derived result for the current dependency set.

## Examples

```ts
const visibleRows = useMemoValue(
  () => rows.filter((row) => row.matches(query)),
  [rows, query]
);
```

## Pitfalls

- Do not use useMemoValue for side effects or asynchronous work. The factory belongs to render and should stay pure.
- If the value is cheap to compute, adding caching can make the component harder to read without delivering much benefit.

## Parameters

### `factory`

Type: `() => T`

Function that computes the cached value.

### `deps`

Type: `unknown[]`

Reactive values that decide when the cached value becomes stale.

## Returns

Type: `T`

The cached value for the current dependency set.

## Related

- [useDeferredValue](./usedeferredvalue.md)
- [useStableCallback](./usestablecallback.md)