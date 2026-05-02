# litsx

[![npm](https://img.shields.io/badge/npm-litsx-CB3837)](https://www.npmjs.com/package/litsx)
[![Release](https://img.shields.io/badge/release-public-2ea44f)](../../RELEASING.md)
[![Module](https://img.shields.io/badge/module-ESM%20%2B%20CJS-0366d6)](./package.json)
[![Provenance](https://img.shields.io/badge/npm_provenance-enabled-2ea44f)](../../RELEASING.md)

Runtime helpers that back the Lit<sup>SX</sup> Babel transforms. The module bundles an `EffectsController` plus native effect helpers (`prepareEffects`, `useAfterUpdate`, `useOnCommit`) so rewritten components can schedule work in Lit terms.

The package also exposes `litsx/jsx-runtime` and `litsx/jsx-dev-runtime` entrypoints so editors and TypeScript can treat Litsx as a first-class JSX runtime via `jsxImportSource: "litsx"`.

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
  - `useRef`, `useCallbackRef`, `useExpose`, `useId`
  - `useMemoValue`, `useStableCallback`, `useEvent`, `useEmit`, `usePrevious`
  - `useExternalStore`, `useStyle`
- Async and error primitives:
  - `ErrorBoundary`, `SuspenseBoundary`, `SuspenseList`
  - `ensureLazyElement(...)` for host-registry-aware lazy custom element registration

All helpers accept the Lit element instance as the first argument. The Babel transforms insert it automatically, but you can also call the runtime manually.

## Usage

```js
import { LitElement, html } from 'lit';
import { prepareEffects, useAfterUpdate, useOnCommit } from 'litsx';

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
    "jsxImportSource": "litsx"
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
