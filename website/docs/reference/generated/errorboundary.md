# ErrorBoundary

Catch synchronous render errors for one subtree and render fallback UI instead. ErrorBoundary is the native Lit<sup>sx</sup> primitive for recoverable render failures. Think of ErrorBoundary as the point where one part of the UI is allowed to fail without taking down the whole component.

- Kind: `Primitive`

## Reference

```ts
import { ErrorBoundary } from "litsx";
```

```tsx
<ErrorBoundary fallback={<span>Could not load profile.</span>}>
  <ProfilePanel />
</ErrorBoundary>
```

## Usage

Wrap a subtree that may throw during render and provide fallback content that should replace it on failure.

Keep the boundary close to the risky region so the fallback stays specific to the part of the UI that failed.

Recreate the boundary with a new identity when you want to retry after a latched failure.

## Behavior

- The boundary catches synchronous render errors from its content renderer and switches to fallback mode.
- Once it has failed, the boundary stays latched on fallback until the instance is replaced.
- Thenables are not treated as errors. They are rethrown so SuspenseBoundary can continue to own asynchronous reveal.
- ErrorBoundary works in light DOM, so surrounding layout and typography styles can continue to flow through the boundary naturally.

## Mental Model

An ErrorBoundary says: if this part of the tree throws, show this fallback instead and keep the rest of the UI alive.

## Examples

```tsx
<ErrorBoundary fallback={<span>Could not load profile.</span>}>
  <ProfilePanel />
</ErrorBoundary>
```

## Pitfalls

- Do not expect the boundary to retry automatically after failure. Replace the instance through identity when you want a fresh attempt.
- Keep fallback UI focused on recovery. It should explain failure or provide a next action, not silently hide the problem.

## Props

### `children?`

Type: `LitsxRenderable`

Content rendered inside the boundary while no error has been captured.

### `fallback?`

Type: `LitsxRenderable | ((error: unknown) => LitsxRenderable)`

Fallback UI rendered after the boundary captures an error.

### `onError?`

Type: `(error: unknown) => void`

Optional callback invoked when the boundary captures an error.

## Related

- [SuspenseBoundary](./suspenseboundary.md)
- [Primitives](../../guides/primitives.md)