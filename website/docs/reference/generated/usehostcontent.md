# useHostContent

Read reactive light DOM content from the current component. Use this when authored code needs projected text or nodes as input, while staying aligned with the web-component model.

- Kind: `Hook`

## Reference

```ts
import { useHostContent } from "litsx";
```

```ts
useHostContent(options?: { trim?: boolean; }): LitsxHostContent
```

## Usage

Call useHostContent when a component derives behavior from the content placed inside its own tag.

Prefer this over manual MutationObserver wiring when the goal is to react to host content changes declaratively.

Use the returned `text` for textual inputs, `nodes` for generic projected content, and `slots` when content should be grouped by slot name.

## Behavior

- Returns a reactive snapshot of the current host content.
- The snapshot updates when light DOM children, text nodes, or slot attributes change.
- `slots.default` contains nodes without an explicit slot name.

## Mental Model

useHostContent treats the host's light DOM as input data owned by the component boundary, not as an implementation detail hidden behind `this.textContent`.

## Examples

```ts
const content = useHostContent({ trim: true });
const source = content.text;

return <pre>{source}</pre>;
```

## Pitfalls

- This reads projected host content, not children as an abstract virtual data structure.

## Parameters

### `options`

Type: `{ trim?: boolean }`

## Returns

Type: `LitsxHostContent`

## Related

- [Primitives](../../guides/primitives.md)
- [Framework Reference](../../framework/generated/)