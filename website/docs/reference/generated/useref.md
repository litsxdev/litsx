# useRef

Store a mutable value across renders without causing updates.

- Kind: `Hook`

## Reference

```ts
import { useRef } from "@litsx/litsx";
```

```ts
useRef<T>(initialValue?: T): { current: T | undefined; }
```

## Usage

Use useRef for stable mutable cells such as timers, previous snapshots, and imperative handles.

Attach a ref created by useRef to JSX `ref=...` when it should point at a rendered element or component instance.

## Behavior

- The ref object exposes a mutable current property.
- When attached to an intrinsic element, the Lit<sup>sx</sup> transform layer keeps current synchronized with that rendered element.
- When attached to a component tag, the ref resolves to the component instance by default.
- Components can override that default target by explicitly forwarding the incoming ref to another element or child component.
- When used as plain mutable storage, the ref persists across renders without causing updates on writes.

## Mental Model

useRef is the single mutable ref primitive in Lit<sup>sx</sup>, whether the ref stores arbitrary data, tracks a rendered DOM node, or points at a component instance.

## Examples

```ts
const inputRef = useRef(null);

useOnCommit(() => {
  inputRef.current?.focus();
}, []);
```

## Pitfalls

- Do not read ref.current as a source of truth for render decisions if that value can change outside the current render pass.
- Prefer state hooks when a change should trigger an update. Refs are for persistence and imperative coordination.

## Parameters

### `initialValue`

Type: `T`

## Returns

Type: `{ current: T | undefined }`

## Related

- [Primitives](../../guides/primitives.md)
- [Framework Reference](../../framework/generated/)