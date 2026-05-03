# useHost

Return the current component instance. Use this when a component or custom hook needs direct access to instance-level platform APIs.

- Kind: `Hook`

## Reference

```ts
import { useHost } from "@litsx/litsx";
```

```ts
useHost<THost extends object = object>(): THost
```

## Usage

Call useHost inside a Lit<sup>sx</sup> component or custom hook during render.

Prefer more specific hooks like useRef when you need a rendered DOM node instead of the host instance itself.

## Behavior

- Returns the active component instance for the current render pass.
- Throws if called without an active host, just like other Lit<sup>sx</sup> hooks.

## Mental Model

useHost gives authored code access to the current component instance as host-level platform context, not as render data.

## Examples

```ts
const host = useHost();

useOnConnect(() => {
  const observer = new MutationObserver(() => {
    console.log(host.textContent);
  });
  observer.observe(host, { childList: true, subtree: true });
  return () => observer.disconnect();
}, []);
```

## Pitfalls

- Prefer more specific hooks like useRef, useHostContent, or useSlot when they describe the intent more clearly than direct host access.
- Do not turn useHost into the default path for every DOM interaction. Reach for it when the component genuinely needs host-level platform APIs.

## Returns

Type: `THost`

## Related

- [Primitives](../../guides/primitives.md)
- [Framework Reference](../../framework/generated/)