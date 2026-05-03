# useTextContent

Read reactive text content projected into the current component. Use this when the component consumes light DOM text as input data.

- Kind: `Hook`

## Reference

```ts
import { useTextContent } from "@litsx/litsx";
```

```ts
useTextContent(options?: { trim?: boolean; }): string
```

## Usage

Call useTextContent when content inside the host should be treated as text, such as markdown, SQL, or authored source code.

Prefer useHostContent when the component also needs direct access to projected nodes or slot groupings.

## Behavior

- Returns a reactive text snapshot derived from the current host content.
- The returned string updates when host text nodes or child content change.

## Mental Model

useTextContent treats the host's projected content as a text input stream for the component, not as node-level structure.

## Examples

```ts
const source = useTextContent({ trim: true });
```

## Pitfalls

- useTextContent flattens projected content to text. If the component cares about node boundaries or named slots, useHostContent or useSlot instead.
- Text snapshots may include formatting whitespace from authored markup unless `trim` is enabled or the caller normalizes the content.

## Parameters

### `options`

Type: `{ trim?: boolean }`

## Returns

Type: `string`

## Related

- [Primitives](../../guides/primitives.md)
- [Framework Reference](../../framework/generated/)