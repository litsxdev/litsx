# Events

Lit<sup>sx</sup> treats events as part of the native web component surface.

There are three separate jobs:

- listen to DOM events in JSX with `@event`
- keep external listeners stable with `useEvent(...)`
- publish public component events with `useEmit(...)`

## Listening In JSX

Use native listener syntax in authored JSX:

- `@click`
- `@input`
- `@change`

That keeps the authored model aligned with Lit and the DOM instead of introducing a parallel React-style event layer.

## Stable External Listeners

`useEvent(...)` is for callbacks that are registered once with an external API but still need fresh state and props.

Use it with `useOnConnect(...)` for things like:

- `window` listeners
- `document` listeners
- observers
- timers

## Publishing Public Events

`useEmit(...)` is the native way to emit a `CustomEvent` from the current host without reaching for `this.dispatchEvent(...)` in authored code.

Defaults:

- `bubbles: true`
- `composed: true`
- `cancelable: false`

Those defaults are aimed at public component events that should escape the component boundary and be observable from parent code.

<script setup>
import { useEmitExampleSource } from "../.vitepress/theme/components/playground-example-source.js";
</script>

<ClientOnly>
  <litsx-playground
    exportname="UseEmitDemo"
    previewtagname="docs-events-use-emit-preview"
    filename="/playground/UseEmitDemo.tsx"
    panelmaxheight="30rem"
  >{{ useEmitExampleSource }}</litsx-playground>
</ClientOnly>

## When To Use Events

Events are a good fit when a component needs to notify the outside world about something that happened:

- `change`
- `select`
- `open`
- `close`
- `submit`

They are not a replacement for local reactive state.

If another part of the same component tree must stay visually in sync with current data, prefer state/props. Use events when the component is publishing a boundary-level signal to parent or host code.

## Related

- [useEmit](../reference/generated/useemit.md)
- [useEvent](../reference/generated/useevent.md)
- [Primitives](./primitives.md)
