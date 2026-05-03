# SuspenseList

Coordinate reveal order across several sibling suspense boundaries. SuspenseList controls when each boundary is allowed to reveal fallback or content. Think of SuspenseList as the traffic controller for several sibling suspense regions.

- Kind: `Primitive`

## Reference

```ts
import { SuspenseList } from "@litsx/litsx";
```

```tsx
<SuspenseList revealOrder="forwards">
  <SuspenseBoundary fallback={<span>Loading first...</span>}>
    <FirstPanel />
  </SuspenseBoundary>
  <SuspenseBoundary fallback={<span>Loading second...</span>}>
    <SecondPanel />
  </SuspenseBoundary>
</SuspenseList>
```

## Usage

Wrap several SuspenseBoundary nodes when reveal order matters to the overall experience.

Use revealOrder and tail to shape how pending sections appear while the list is still resolving.

In custom-element markup, authored attributes should use kebab-case such as `reveal-order="forwards"` and `tail="collapsed"`.

Use SuspenseList when several asynchronous sections belong to the same reading flow and should reveal in a predictable order.

SuspenseList is a coordination primitive, not a visual wrapper. Use it to shape reveal timing without changing the authored styling model around the boundaries.

## Behavior

- The list can delay fallback or content reveal so sibling boundaries appear in a stable order.
- Reveal coordination happens in light DOM, so parent styles still flow naturally across the list.
- `revealOrder="forwards"` favors top-to-bottom reveal, `revealOrder="backwards"` favors the opposite direction, and `revealOrder="together"` waits until every sibling is ready.
- When authoring the custom element directly, use the reflected `reveal-order` attribute rather than camelCase HTML attributes.
- `tail="collapsed"` keeps later pending regions out of the way without fully removing them, while `tail="hidden"` suppresses them until they can reveal.

## Mental Model

SuspenseList does not fetch or render content by itself. It only decides when sibling boundaries are allowed to reveal fallback or content.

## Examples

```tsx
<SuspenseList revealOrder="forwards">
  <SuspenseBoundary fallback={<span>Loading first...</span>}>
    <FirstPanel />
  </SuspenseBoundary>
  <SuspenseBoundary fallback={<span>Loading second...</span>}>
    <SecondPanel />
  </SuspenseBoundary>
</SuspenseList>
```

```tsx
<suspense-list reveal-order="forwards" tail="collapsed">
  <suspense-boundary></suspense-boundary>
</suspense-list>
```

## Pitfalls

- Use SuspenseList for groups of boundaries that belong to the same reading or interaction flow. Unrelated sections usually read better when they reveal independently.
- Do not rely on SuspenseList for layout. Its job is reveal coordination, not visual composition.

## Props

### `children?`

Type: `LitsxRenderable`

Suspense boundaries coordinated by the list.

### `revealOrder?`

Type: `"forwards" | "backwards" | "together"`

Order in which sibling boundaries are allowed to reveal.

### `tail?`

Type: `"collapsed" | "hidden"`

Strategy used for boundaries that are still pending behind the current reveal point.

## Related

- [SuspenseBoundary](./suspenseboundary.md)
- [Async UI](../../guides/suspense.md)