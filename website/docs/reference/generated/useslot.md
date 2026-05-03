# useSlot

Read reactive projected nodes for one slot. Use this when authored code needs projected content grouped by slot name in a web-component-native way.

- Kind: `Hook`

## Reference

```ts
import { useSlot } from "@litsx/litsx";
```

```ts
useSlot(slotName?: string): Node[]
```

## Usage

Call useSlot() for default content and useSlot("name") for named projected content.

Prefer useHostContent when the component needs the full host-content snapshot instead of just one slot.

## Behavior

- Returns a reactive array of nodes assigned to the requested slot.
- The returned array updates when projected nodes are added, removed, or moved between slots.

## Mental Model

useSlot gives authored code a reactive view of projected light DOM for one slot. It does not render, clone, or virtualize children as framework-level data.

## Examples

```ts
const defaultNodes = useSlot();
const actions = useSlot("actions");
```

## Pitfalls

- useSlot reads host-projected content, not JSX children as an abstract data structure.

## Parameters

### `slotName`

Type: `string`

## Returns

Type: `Node[]`

## Related

- [Primitives](../../guides/primitives.md)
- [Framework Reference](../../framework/generated/)