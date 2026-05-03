# SuspenseBoundary

Define a fallback boundary around a subtree that may suspend. SuspenseBoundary is the native Lit<sup>sx</sup> primitive for asynchronous UI coordination. Think of SuspenseBoundary as the point where one part of the UI is allowed to wait without blocking the whole component.

- Kind: `Primitive`

## Reference

```ts
import { SuspenseBoundary } from "@litsx/litsx";
```

```tsx
<SuspenseBoundary fallback={<span>Loading profile...</span>}>
  <UserProfile />
</SuspenseBoundary>
```

## Usage

Wrap the part of the UI that may pause while data, code, or a deferred element becomes available.

Provide fallback content that should be rendered while the boundary is waiting.

Keep the boundary close to the asynchronous region so the fallback stays specific to the part of the UI that is actually pending.

Prefer several small boundaries over one large catch-all boundary when different areas of the UI can resolve independently.

## Behavior

- The boundary renders fallback content while the wrapped subtree is pending.
- Once the subtree resolves, the boundary can coordinate its reveal with a parent SuspenseList.
- SuspenseBoundary works in light DOM, so surrounding layout and typography styles can continue to flow through the boundary naturally.
- The fallback is part of the authored component tree, so it can use the same JSX patterns and styling approach as the rest of the component.

## Mental Model

A SuspenseBoundary says: this part of the tree may pause, and this is the UI that should stand in while it catches up.

## Examples

```tsx
<SuspenseBoundary fallback={<span>Loading profile...</span>}>
  <UserProfile />
</SuspenseBoundary>
```

## Pitfalls

- Avoid wrapping large unrelated sections in a single boundary. Smaller, focused boundaries usually produce clearer fallbacks and better reveal behavior.
- Fallback UI should stay lightweight and recognizable. Treat it as temporary stand-in content, not as a second full version of the screen.

## Props

### `children?`

Type: `LitsxRenderable`

Content rendered inside the boundary when it is ready to reveal.

### `fallback?`

Type: `LitsxRenderable`

Fallback UI rendered while the boundary is waiting for its content.

## Related

- [SuspenseList](./suspenselist.md)
- [Async UI](../../guides/suspense.md)