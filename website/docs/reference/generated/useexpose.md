# useExpose

Expose a small imperative API through a ref. Think of useExpose as the way a component publishes a deliberately small imperative API to its parent.

- Kind: `Hook`

## Reference

```ts
import { useExpose } from "litsx";
```

```ts
useExpose<T>(ref: { current: T | null; } | ((value: T | null) => void), createHandle: () => T, deps?: unknown[]): void
```

## Usage

Use useExpose when a component should publish a small imperative API such as focus(), open(), or reset().

Keep the handle narrow and stable so callers depend on explicit capabilities rather than on the whole element instance.

Pair useExpose with useRef when the handle should forward a few imperative methods to owned DOM nodes.

## Behavior

- Lit<sup>sx</sup> assigns the created handle to the provided ref during the host lifecycle.
- Recompute the handle only when one of the listed dependencies changes.
- Prefer exposing a small command surface instead of leaking the underlying element instance.

## Mental Model

useExpose draws a boundary between what the component does internally and the few commands it chooses to make public.

## Examples

```ts
useExpose(ref, () => ({
  focus() {
    inputRef.current?.focus();
  },
  clear() {
    setValue("");
  },
}), [inputRef, setValue]);
```

## Pitfalls

- Do not expose the whole element instance unless that really is the public API you want to support.
- Keep the handle stable and intention-revealing. A small set of named commands is easier to maintain than a grab-bag of internals.

## Parameters

### `ref`

Type: `{ current: T | null } | ((value: T | null) => void)`

Ref object or callback ref that should receive the exposed handle.

### `createHandle`

Type: `() => T`

Function that returns the imperative handle to expose.

### `deps`

Type: `unknown[]`

Reactive values that control when the handle should be recreated.

## Related

- [useRef](./useref.md)
- [Primitives](../../guides/primitives.md)