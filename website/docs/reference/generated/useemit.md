# useEmit

Emit a CustomEvent from the current host without reaching for this.dispatchEvent(...). Think of useEmit as the small authored bridge between component logic and public DOM events.

- Kind: `Hook`

## Reference

```ts
import { useEmit } from "@litsx/litsx";
```

```ts
useEmit<T = undefined>(type: string, detail?: T, options?: { bubbles?: boolean; composed?: boolean; cancelable?: boolean; }): boolean
```

## Usage

Use useEmit when a component needs to publish a DOM event as part of its public API.

This is a good fit for input-like controls, disclosure widgets, and selection components.

## Behavior

- The returned function keeps a stable identity across renders.
- Events default to `{ bubbles: true, composed: true, cancelable: false }`.
- Passing options overrides those defaults without replacing the rest of the event init object.

## Mental Model

useEmit keeps event emission explicit in authored code while still lowering directly to the native CustomEvent model.

## Examples

```ts
const emit = useEmit();

emit("change", value);
emit("submit", value, { cancelable: true });
```

## Pitfalls

- useEmit publishes events; it does not make internal values reactive for parents by itself.

## Parameters

### `type`

Type: `string`

### `detail`

Type: `T`

### `options`

Type: `{
    bubbles?: boolean;
    composed?: boolean;
    cancelable?: boolean;
  }`

## Returns

Type: `boolean`

## Related

- [Primitives](../../guides/primitives.md)
- [Framework Reference](../../framework/generated/)