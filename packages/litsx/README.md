# litsx

Runtime helpers that back the Lit<sup>SX</sup> Babel transforms. The module bundles an `EffectsController` plus native effect helpers (`prepareEffects`, `useAfterUpdate`, `useOnCommit`) so rewritten components can schedule work in Lit terms, while still exposing React-shaped aliases for migration and compat.

The package also exposes `litsx/jsx-runtime` and `litsx/jsx-dev-runtime` entrypoints so editors and TypeScript can treat Litsx as a first-class JSX runtime via `jsxImportSource: "litsx"`.

## What it provides

- `EffectsController`: a Lit `ReactiveController` implementation that tracks effect registrations, dependency arrays and cleanups per host instance.
- `prepareEffects(host)`: reset the controller cursor at the start of `render()` so subsequent registrations line up with their previous runs.
- `useAfterUpdate(host, callback, deps?)`: register a passive effect. Runs after the update cycle (queued on `requestAnimationFrame`) and re-executes when any dependency changes. Returns nothing; the callback may return a cleanup function.
- `useOnCommit(host, callback, deps?)`: register a layout effect. Runs synchronously during `hostUpdated()` before passive effects fire.
- `useEffect(...)` / `useLayoutEffect(...)`: React-shaped aliases for the two helpers above. Useful for compat and migration, but `useAfterUpdate` / `useOnCommit` are the native names to prefer in authored Lit<sup>SX</sup> code.

All helpers accept the Lit element instance as the first argument—the Babel plugins insert it automatically—but you can also call them manually.

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

- `@litsx/babel-preset-react-compat` rewrites React’s `useEffect`/`useLayoutEffect` calls to use these helpers automatically.
- `prepareEffects(this);` is injected at the top of every transformed `render()` so the controller cursor resets before registering effects.
- You can mix manual registrations and transformed ones—each Lit element instance gets its own `EffectsController` behind the scenes.

The helpers are framework agnostic: they only assume that the host object exposes Lit’s controller lifecycle (`addController`, `hostUpdated`, `hostDisconnected`).
