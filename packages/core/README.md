# @litsx/core

[![npm](https://img.shields.io/badge/npm-@litsx%2Fcore-CB3837)](https://www.npmjs.com/package/@litsx/core)
[![Release](https://img.shields.io/badge/release-public-2ea44f)](../../RELEASING.md)
[![Module](https://img.shields.io/badge/module-ESM%20%2B%20CJS-0366d6)](./package.json)
[![Provenance](https://img.shields.io/badge/npm_provenance-enabled-2ea44f)](../../RELEASING.md)

Runtime helpers that back the Lit<sup>SX</sup> Babel transforms. The module bundles an `EffectsController` plus native effect helpers (`prepareEffects`, `useAfterUpdate`, `useOnCommit`) so rewritten components can schedule work in Lit terms.

The package also exposes `@litsx/core/jsx-runtime` and `@litsx/core/jsx-dev-runtime` entrypoints so editors and TypeScript can treat LitSX as a first-class JSX runtime via `jsxImportSource: "@litsx/core"`.

## What it provides

- `EffectsController`: a Lit `ReactiveController` implementation that tracks hook registrations, dependency arrays, effect queues, transitions, refs, and external-store subscriptions per host instance.
- Effect primitives:
  - `prepareEffects(host)`: reset the controller cursor at the start of `render()` so subsequent registrations line up with their previous runs.
  - `useAfterUpdate(host, callback, deps?)`: register a passive effect.
  - `useOnCommit(host, callback, deps?)`: register synchronous commit-phase work.
  - `useOnConnect(host, callback, deps?)`: register work that stays active only while the host is connected.
- State and concurrency primitives:
  - `useState`, `useReducedState`, `useControlledState`
  - `useAsyncState`, `useOptimistic`
  - `useTransition`, `startTransition`, `useDeferredValue`
- Host and ref primitives:
  - `useHost`, `useHostContent`, `useTextContent`, `useSlot`
  - `useRef`, `useCallbackRef`, `useExpose`, `useId`, `useStableId`
  - `useMemoValue`, `useStableCallback`, `useEvent`, `useEmit`, `usePrevious`
  - `useExternalStore`, `useStyle`
- Async and error primitives:
  - `ErrorBoundary`, `SuspenseBoundary`, `SuspenseList`
  - `ensureLazyElement(...)` for host-registry-aware lazy custom element registration
- Structural host middleware infrastructure:
  - `HostMiddlewareRuntime`
  - `HostMiddlewareMixin`
  - `createHostMiddlewareRuntime(...)`

All helpers accept the Lit element instance as the first argument. The Babel transforms insert it automatically, but you can also call the runtime manually.

## Usage

```js
import { LitElement, html } from 'lit';
import { prepareEffects, useAfterUpdate, useOnCommit } from '@litsx/core';

class ClockDisplay extends LitElement {
  static properties = {
    delay: { type: Number },
  };

  render() {
    prepareEffects(this);

    useOnCommit(this, () => {
      this.classList.add('hydrated');
    }, []);

    useAfterUpdate(this, () => {
      const handle = setInterval(() => this.requestUpdate(), this.delay ?? 1000);
      return () => clearInterval(handle);
    }, [this.delay]);

    return html`<time>${new Date().toLocaleTimeString()}</time>`;
  }
}
```

## JSX Tooling

For editor and TypeScript support you can point JSX at `litsx` directly:

```json
{
  "compilerOptions": {
    "jsx": "react-jsx",
    "jsxImportSource": "@litsx/core"
  }
}
```

That gives the IDE a stable JSX runtime surface even when Babel later rewrites the implementation to Lit templates and scoped elements.

Layout work runs immediately during `hostUpdated()`, while passive effects are deferred to the next frame to avoid blocking rendering. Cleanups execute when dependencies change, before the effect runs again, and once when the host disconnects.

## Working with the Babel plugins

- `prepareEffects(this);` is injected at the top of every transformed `render()` so the controller cursor resets before registering effects.
- Native authored hooks lower directly to this runtime surface.
- React-compat transforms also lower their supported hook subset to these native Lit<sup>sx</sup> helpers.
- You can mix manual registrations and transformed ones. Each Lit element instance gets its own `EffectsController` behind the scenes.

The helpers are framework agnostic: they only assume that the host object exposes Lit’s controller lifecycle (`addController`, `hostUpdated`, `hostDisconnected`).

## Stable Callsite Identity

`useStableId()` returns an identifier for the authored callsite. The LitSX transform rewrites:

```jsx
const resourceKey = useStableId();
```

into a runtime call with hidden callsite metadata derived from the authored file and source position. The generated value is stable for that callsite across SSR and client hydration, does not depend on component instance order, and does not use runtime heuristics such as stack traces, function names, or `Function.toString()`.

Use `useStableId()` for resource identity: cache keys, preload keys, serialized resource records, i18n message slots, or hydration metadata that must line up between server and client.

Do not use `useStableId()` when you need unique DOM ids for multiple instances of the same component. Every instance of the same authored callsite receives the same value by design. Use `useId()` for instance-local DOM ids and accessibility relationships. `useId()` follows hook order within a host instance; `useStableId()` follows the authored callsite.

## Structural Host Middleware Runtime

LitSX also includes internal plumbing for future structural hooks that need to participate in the host lifecycle. This is separate from `EffectsController`.

- `EffectsController` remains the render-time hook controller.
- `HostMiddlewareRuntime` is the structural host layer for lifecycle middleware.
- `HostMiddlewareMixin` is the reusable host mixin shape that generated components can use later.

The public authored hook syntax for structural hooks is not finalized yet. The runtime layer is intentionally lower-level: it accepts structural entries that a future transform can generate.

Conceptually, each authored structural-hook callsite becomes one entry:

```js
{
  callsiteIndex: 0,
  callsiteId: "litsx-stable-example",
  definition,
  args: [loaders],
  meta: {},
  state,
  middlewares,
}
```

Entries are **not deduplicated** by the host middleware runtime. Each entry is one authored callsite. Even if two callsites use the same hook definition and the same arguments, they remain separate entries with separate state and separate `runtime.read(index)` results.

The identity split is:

- `callsiteIndex`: stable local index for generated reads such as `runtime.read(0)`
- `callsiteId`: stable serializable identity for diagnostics, SSR metadata, or hook-specific resource keys
- `id`: compatibility alias for the stable callsite id

Resource dedupe belongs below this layer, inside the hook or resource runtime that knows the domain semantics. For example, an i18n runtime can dedupe catalog loads by locale and loader identity, while the host middleware runtime still preserves separate authored callsites.

Lifecycle middleware is composed in entry order, with the host base implementation as the final link. `next()` is the functional equivalent of `super.method()`:

```js
runtime.connectedCallback(() => super.connectedCallback());

runtime.attributeChangedCallback(
  [name, oldValue, newValue],
  () => super.attributeChangedCallback(name, oldValue, newValue),
);

runtime.shouldUpdate(
  [changedProperties],
  () => super.shouldUpdate(changedProperties),
);
```

Middleware can run work before and after `next()`:

```js
connectedCallback(host, state, next) {
  state.connected = true;
  const result = next();
  state.afterBase = true;
  return result;
}
```

Async lifecycle methods can `await next()`. Calling `next()` twice from the same middleware is treated as an error.

The runtime currently supports middleware for:

- `connectedCallback`
- `disconnectedCallback`
- `attributeChangedCallback`
- `scheduleUpdate`
- `shouldUpdate`
- `willUpdate`
- `update`
- `updated`
- `firstUpdated`
- `getUpdateComplete`

It intentionally does not cover `render` or `createRenderRoot` in this phase.
