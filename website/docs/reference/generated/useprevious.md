# usePrevious

Read the value from the previous render. Think of usePrevious as the smallest way to compare the current render against the last committed render state.

- Kind: `Hook`

## Reference

```ts
import { usePrevious } from "@litsx/litsx";
```

```ts
usePrevious<T>(value: T, initialValue?: T): T | undefined
```

## Usage

Use usePrevious when a render needs to compare the current value with what the component saw on the previous render.

Pass an initialValue when the first render should not receive undefined.

## Behavior

- The first render returns the provided initialValue, or undefined when no initialValue is given.
- After that, each render receives the value that was passed on the immediately preceding render.

## Mental Model

usePrevious lets the current render look one frame back without turning that old value into reactive state.

## Examples

```ts
const previousOpen = usePrevious(open);

const becameOpen = open && !previousOpen;
```

## Pitfalls

- usePrevious is for comparisons and derived render logic. It does not trigger updates by itself.

## Parameters

### `value`

Type: `T`

Current render value to track.

### `initialValue`

Type: `T`

Value returned on the first render before any previous value exists.

## Returns

Type: `T | undefined`

The previous render's value, or initialValue on the first render.

## Related

- [Primitives](../../guides/primitives.md)
- [Framework Reference](../../framework/generated/)