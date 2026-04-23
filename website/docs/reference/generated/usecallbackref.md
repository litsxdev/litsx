# useCallbackRef

Run a callback ref through the component lifecycle.

- Kind: `Hook`

## Reference

```ts
import { useCallbackRef } from "litsx";
```

```ts
useCallbackRef(getTarget: () => Element | null, callback: (node: Element | null) => void, deps?: unknown[]): void
```

## Usage

Call `useCallbackRef` in authored Lit<sup>sx</sup> code when you want this behavior in a component.

## Parameters

### `getTarget`

Type: `() => Element | null`

### `callback`

Type: `(node: Element | null) => void`

### `deps`

Type: `unknown[]`

## Related

- [Primitives](../../guides/primitives.md)
- [Framework Reference](../../framework/generated/)