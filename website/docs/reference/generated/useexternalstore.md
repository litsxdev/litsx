# useExternalStore

Subscribe to external state and read its current snapshot. Think of useExternalStore as the bridge between Lit<sup>sx</sup> render logic and state that already lives somewhere else.

- Kind: `Hook`

## Reference

```ts
import { useExternalStore } from "@litsx/litsx";
```

```ts
useExternalStore<T>(subscribe: (listener: () => void) => () => void, getSnapshot: () => T, getServerSnapshot?: () => T): T
```

## Usage

Use useExternalStore when state is owned outside the component tree and the host should re-render when that store changes.

Prefer this over ad-hoc subscriptions when you want a consistent render-time snapshot model.

Keep getSnapshot cheap and synchronous, because Lit<sup>sx</sup> calls it during render to decide what the component should show.

Reach for useExternalStore when the source of truth already lives outside Lit<sup>sx</sup>, such as a shared store, browser API, or external cache.

## Behavior

- Lit<sup>sx</sup> subscribes during the host lifecycle and requests updates when the snapshot changes.
- The value returned during render is always the latest snapshot from getSnapshot().
- subscribe should register the listener and return an unsubscribe function. Avoid performing asynchronous reads inside getSnapshot.
- A store update only affects hosts that currently subscribe to that store through useExternalStore.

## Mental Model

The external store remains the source of truth. Lit<sup>sx</sup> only asks for the current snapshot and schedules a render when that snapshot changes.

## Examples

```ts
const online = useExternalStore(
  subscribeToConnectivity,
  getConnectivitySnapshot
);
```

## Pitfalls

- Keep getSnapshot synchronous and cheap. If it performs asynchronous work or expensive derivations, render performance will suffer.
- Avoid shaping the store contract around a single component. Stable store APIs are easier to reuse across several hosts.

## Parameters

### `subscribe`

Type: `(listener: () => void) => () => void`

Function that subscribes a listener and returns an unsubscribe function.

### `getSnapshot`

Type: `() => T`

Function that returns the current store snapshot during render.

### `getServerSnapshot`

Type: `() => T`

Optional snapshot getter for server rendering scenarios.

## Returns

Type: `T`

The latest snapshot currently exposed by the external store.

## Related

- [useMemoValue](./usememovalue.md)
- [useState](./usestate.md)