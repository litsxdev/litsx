# useDeferredValue

Let expensive consumers lag behind a fast-changing value. Think of useDeferredValue as a way to let expensive consumers lag behind a fast-changing value without freezing the rest of the interaction.

- Kind: `Hook`

## Reference

```ts
import { useDeferredValue } from "@litsx/litsx";
```

```ts
useDeferredValue<T>(value: T, options?: { timeout?: number; }): T
```

## Usage

Use useDeferredValue when a derived subtree is expensive and should lag slightly behind more urgent updates.

This is useful for search results, filtered lists, and other views that are expensive to recompute on every keystroke.

Use the deferred value downstream, not upstream. Read urgent input state directly and pass the deferred value into expensive calculations.

## Behavior

- Lit<sup>sx</sup> may keep returning an older value temporarily while the deferred update is still pending.
- This helps expensive UI stay responsive without blocking urgent interactions.
- useDeferredValue does not debounce updates. Every value still flows through; Lit<sup>sx</sup> simply lets expensive consumers lag behind.

## Mental Model

The source value changes immediately, but expensive readers can temporarily stay on the previous value until the deferred update catches up.

## Examples

```ts
const deferredQuery = useDeferredValue(searchQuery);
const results = useMemoValue(() => search(items, deferredQuery), [items, deferredQuery]);
```

## Pitfalls

- useDeferredValue does not reduce the number of updates. It changes when expensive consumers observe them.
- Keep reading the urgent source directly where immediacy matters, and only pass the deferred value into slower subtrees or calculations.

## Parameters

### `value`

Type: `T`

Value that may change more frequently than the UI should immediately reflect.

### `options`

Type: `{ timeout?: number }`

Optional timing hints for how long the deferred value may lag behind.

## Returns

Type: `T`

The deferred value currently exposed to render logic.

## Related

- [useTransition](./usetransition.md)
- [useMemoValue](./usememovalue.md)