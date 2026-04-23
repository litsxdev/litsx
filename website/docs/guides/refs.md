# Refs

Lit<sup>sx</sup> uses one `ref` channel, but components can resolve that channel to different final targets.

The important question is not "does this component use refs?" but "what does this component choose to expose through its ref?"

## Resolution Order

When a component receives a `ref`, Lit<sup>sx</sup> resolves it in this order:

1. an imperative handle published by the component
2. an explicitly forwarded element or child-component target
3. the component instance itself

That means the default is simple:

- `ref` on an intrinsic element -> that DOM node
- `ref` on a Lit<sup>sx</sup> component -> that component instance

Only explicit component behavior changes the final target.

<script setup>
import { nativeRefResolutionExampleSource } from "../.vitepress/theme/components/playground-example-source.js";
</script>

<ClientOnly>
  <litsx-playground
    exportname="NativeRefResolutionDemo"
    previewtagname="docs-native-ref-guide-demo"
    filename="/playground/NativeRefResolutionDemo.tsx"
    panelmaxheight="28rem"
  >{{ nativeRefResolutionExampleSource }}</litsx-playground>
</ClientOnly>

## The Three Native Outcomes

### Component Instance

If a component does nothing special with its incoming `ref`, the parent receives the component instance.

That is the native Lit<sup>sx</sup> default, and it fits the web-component model well because a component always has a real host instance.

Use that when:

- the component has its own public identity
- the parent needs the host instance itself
- you want a normal component API instead of leaking internal DOM

### Forwarded DOM Target

A component can reassign its incoming `ref` to an owned DOM element.

In that case, the final `ref` target is that element, not the component instance.

Use that when:

- the component is a thin wrapper around one native control
- the parent really needs a real `HTMLElement`
- external code expects DOM APIs such as `focus()`, `select()`, or measurements

This is useful, but it should be deliberate. If every component forwards straight to an internal node, the component becomes a thin container with almost no public identity of its own.

### Imperative Handle

A component can publish an imperative handle with [`useExpose`](../reference/generated/useexpose.md).

When it does, that handle wins over the default instance target and over any forwarded DOM target on the same `ref` channel.

Use that when:

- the component has a real public API of commands
- you want to expose a small stable surface such as `focus()`, `clear()`, or `open()`
- you do not want callers to depend on internal DOM structure

This is often the best choice for stateful or higher-level components because the contract stays stable even if the internal DOM changes.

## Transitive Forwarding

Refs can also resolve transitively through child components.

If `Parent` passes a `ref` to `Child`, and `Child` passes it again to `Grandchild`, then the final value is whatever `Grandchild` resolves:

- its own component instance
- a forwarded DOM node
- or an imperative handle

So the mental model is:

- `ref` is one channel
- the receiving component decides the current target
- forwarding just delegates that decision one step further down

## Choosing the Right Public Contract

As a rule of thumb:

- expose the component instance when the component itself is the public API
- expose a DOM node when the component is intentionally a thin wrapper around one real element
- expose an imperative handle when the component should publish a small command surface instead of either the full instance or the internal DOM

The main thing to avoid is accidental API design. A `ref` should resolve to the thing you actually want consumers to depend on.

## Related

- [Primitives](./primitives.md)
- [Migrating from React](./migrating-from-react.md)
- [useRef](../reference/generated/useref.md)
- [useCallbackRef](../reference/generated/usecallbackref.md)
- [useExpose](../reference/generated/useexpose.md)
