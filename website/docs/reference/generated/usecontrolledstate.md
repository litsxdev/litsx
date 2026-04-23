# useControlledState

Manage a value that can be controlled from props or owned locally by the component. Think of useControlledState as the small bridge between component-internal state and design-system APIs that may also be driven from outside.

- Kind: `Hook`

## Reference

```ts
import { useControlledState } from "litsx";
```

```ts
useControlledState<T>(options: { value?: T; defaultValue?: T | (() => T); onChange?: (value: T) => void; }): [ T | undefined, (next: T | ((value: T | undefined) => T)) => void ]
```

## Usage

Use useControlledState for patterns such as `value/defaultValue/onChange`, `open/defaultOpen/onOpenChange`, or `checked/defaultChecked/onCheckedChange`.

Prefer plain useState when the component always owns the value itself.

## Behavior

- When `value` is not undefined, the hook reads from that controlled value and does not update local state.
- When `value` is undefined, the hook stores local state initialized from `defaultValue`.
- The setter always resolves the next value, updates local state only when uncontrolled, and calls `onChange` when the value actually changes.

## Mental Model

The hook exposes one current value and one setter, regardless of whether the source of truth lives inside the component or outside it.

## Examples

```ts
const [open, setOpen] = useControlledState({
  value: openProp,
  defaultValue: false,
  onChange: onOpenChange,
});
```

## Pitfalls

- This hook treats `undefined` as the uncontrolled case. Use `null` when the controlled value needs an explicit "empty" state.
- Do not mirror a controlled value into separate component state. This hook already resolves that split.

## Parameters

### `options`

Type: `{
  value?: T;
  defaultValue?: T | (() => T);
  onChange?: (value: T) => void;
}`

## Returns

Type: `[T | undefined, (next: T | ((value: T | undefined) => T)) => void]`

## Related

- [Primitives](../../guides/primitives.md)
- [Framework Reference](../../framework/generated/)