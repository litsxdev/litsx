# @litsx/core

[![npm](https://img.shields.io/badge/npm-@litsx%2Fcore-CB3837)](https://www.npmjs.com/package/@litsx/core)
[![Release](https://img.shields.io/badge/release-public-2ea44f)](../../RELEASING.md)
[![Module](https://img.shields.io/badge/module-ESM%20%2B%20CJS-0366d6)](./package.json)
[![Provenance](https://img.shields.io/badge/npm_provenance-enabled-2ea44f)](../../RELEASING.md)

Runtime helpers that back the Lit<sup>SX</sup> Babel transforms. The module bundles an `EffectsController` plus native effect helpers (`prepareEffects`, `useAfterUpdate`, `useOnCommit`) so rewritten components can schedule work in Lit terms.

The package also exposes `@litsx/core/jsx-runtime` and `@litsx/core/jsx-dev-runtime` entrypoints so editors and TypeScript can treat LitSX as a first-class JSX runtime via `jsxImportSource: "@litsx/core"`.

SSR support used by [`@litsx/ssr`](../ssr/README.md) also lives here: scoped-template metadata, scoped custom-element lookup for nested `static elements`, and the SSR-safe effects controller selected when a host is rendered with SSR context. Most applications should use `@litsx/ssr` rather than importing those internals directly.

Library runtimes that own a global resolved-resource cache can use
`useSsrResourceSnapshot({ key, capture, restore })`. During SSR, `capture()` is
deferred until the final render pass has completed; during hydration,
`restore(snapshot)` runs synchronously and once before registration and client
module loading can trigger the first render. The hook is inert without an
active SSR request or hydration resource payload, and `@litsx/core` never
imports `@litsx/ssr`.

This is infrastructure for libraries such as i18n or data runtimes. Application
code should not add manual snapshot adapters or hydration bootstrap calls.

For authored syntax and binding rules, see the repository's
[native authoring contract](../../AUTHORING.md).

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
  - `createRef`, `ref`, `useRef`, `useCallbackRef`, `useExpose`, `useId`, `useStableId`
  - `useMemoValue`, `useStableCallback`, `useEvent`, `useEmit`, `usePrevious`
  - `useExternalStore`, `useStyle`
- Async and error primitives:
  - `ErrorBoundary`, `SuspenseBoundary`, `SuspenseList`
  - `ensureLazyElement(...)` for host-registry-aware lazy custom element registration
- SSR request execution context:
  - `createExecutionContextKey(...)`
  - `getCurrentExecutionContext()`
- Component styling:
  - `css` is the original Lit template tag re-exported for the common
    `Component.styles = css\`...\``authoring pattern. Lit directives remain
available from their normal Lit entrypoints;`createRef`and`ref` are also
    re-exported because JSX refs lower directly to Lit's ref directive.
- Structural host capabilities:
  - `defineHook({ mixin, use })`
  - compiler-injected `applyStructuralHooks(...)`
  - stable mixin deduplication in first-use order
- JSX compatibility helpers:
  - `jsxSpreadElement(tagName, sources, options?, children?)` merges JSX prop sources in authored order. It uses an `ElementPart` in the browser and regular Lit parts during SSR.
  - Component constructors are finalized before spread resolution. Public prop names map to properties, while declared attribute aliases map back to their canonical attribute and Boolean presence semantics.
  - Compiled components with an object-rest parameter publish `Symbol.for("litsx.restProps")` metadata. `jsxSpreadElement` uses it to keep declared reactive props on the component host while routing undeclared inputs through one compact reactive object for forwarding to an inner element.
  - `on:event` is the explicit JSX event channel. The destination constructor, reactive component API, and native DOM properties determine whether ordinary JSX names become Lit property, boolean-attribute, or attribute bindings.
  - `onX` names are ordinary component properties/callbacks. React-style `onClick` event conversion belongs exclusively to react-compat. Native handler properties such as `onclick` remain available and are assigned as properties.
  - Hydratable spread output should be rendered with `@litsx/ssr` and hydrated with `@litsx/ssr/client` so the two template shapes are reconciled without replacing DOM nodes.

## Ref semantics

Native LitSX refs follow Lit's contract: object refs expose `.value`, and refs are
cleared with `undefined`. JSX keeps the standard `ref={...}` shape while the
compiler lowers intrinsic-element refs to Lit's element-part directive:

```tsx
const inputRef = useRef<HTMLInputElement>();

useOnCommit(() => inputRef.value?.focus(), []);
return <input ref={inputRef} />;
```

Component refs travel through the `.ref` property until they reach their final
host, forwarded element, or `useExpose` handle. Object refs, callback refs,
spreads, SSR, and hydration share the same `.value`/`undefined` lifecycle. The
React compatibility preset supplies `.current`/`null` facades without changing
the native runtime contract.

SSR serializes the element and Lit's hydration markers, never the ref object or
callback. On the client, Lit reconnects its element part to the existing server
node and only then publishes that node through the ref. Hydration therefore does
not recreate an element merely to populate its ref.

## Typed component events

Give `useEmit` an event map to type both emission and JSX consumers:

```tsx
type ButtonEvents = {
  "primary-action": { id: string };
  "url-change": URL;
};

export function ActionButton() {
  const emit = useEmit<ButtonEvents>();
  return (
    <button on:click={() => emit("primary-action", { id: "save" })}>
      Save
    </button>
  );
}

const view = <ActionButton on:primary-action={(event) => event.detail.id} />;
```

The compiler publishes the inferred contract as `ActionButton.events` and under
`Symbol.for("litsx.events")`. This lets TypeScript, editor tooling, spreads, and
downstream packages consume the same event API without inspecting source. A
literal event name makes the inferred contract complete; a dynamic name keeps it
open so consumers may still use unknown `on:event` listeners.

Libraries can declare the contract explicitly when inference is not possible:

```ts
import type { LitsxEventDeclaration } from "@litsx/core";

export declare class ActionButton extends HTMLElement {
  static readonly events: LitsxEventDeclaration<ButtonEvents, true>;
}
```

Public declarative events use lowercase kebab-case and preserve their exact name:
`primary-action` becomes `on:primary-action`. The value can also be a listener
object with `capture`, `once`, or `passive` options. Event names outside the
canonical JSX channel, such as `menu:open` or `state.change`, remain available
through `addEventListener()`.

All helpers accept the Lit element instance as the first argument. The Babel transforms insert it automatically, but you can also call the runtime manually.

## Styling

In LitSX JSX/TSX, the `style` attribute is string-based. LitSX does not support
React-style object bindings such as `style={{ color: "red" }}`.

- Use `style="color: red"` or `style={styleText}` when you need an inline style attribute.
- Use `useStyle(...)` when the value belongs on the component host as a dynamic
  host style property or CSS custom property.

## Usage

```js
import { LitElement, html } from "lit";
import { prepareEffects, useAfterUpdate, useOnCommit } from "@litsx/core";

class ClockDisplay extends LitElement {
  static properties = {
    delay: { type: Number },
  };

  render() {
    prepareEffects(this);

    useOnCommit(
      this,
      () => {
        this.classList.add("hydrated");
      },
      [],
    );

    useAfterUpdate(
      this,
      () => {
        const handle = setInterval(
          () => this.requestUpdate(),
          this.delay ?? 1000,
        );
        return () => clearInterval(handle);
      },
      [this.delay],
    );

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

## SSR Execution Context

During LitSX SSR, `@litsx/ssr` creates one execution context for each public
render request. That execution context:

- stays stable across suspense retries for the same request
- is shared by nested server-component calls in that request
- is not modeled through DOM providers or context elements
- returns `null` when no SSR request is active

Create an opaque key once:

```js
import {
  createExecutionContextKey,
  getCurrentExecutionContext,
} from "@litsx/core";

const USER_KEY = createExecutionContextKey("user");
```

Write and read during SSR:

```js
export async function ProductPage() {
  getCurrentExecutionContext()?.set(USER_KEY, { id: "123" });
  return <AppRoot />;
}

function readUser() {
  return getCurrentExecutionContext()?.get(USER_KEY) ?? null;
}
```

`@litsx/ssr` creates this execution context internally. It is separate from the
SSR metadata config passed as `options.context` to `renderToString(...)`,
`renderDocument(...)`, or `renderToStream(...)`.

## Stable Callsite Identity

`useStableId()` returns an identifier for the authored callsite. The LitSX transform rewrites:

```jsx
const resourceKey = useStableId();
```

into a runtime call with hidden callsite metadata derived from the authored file and source position. The generated value is stable for that callsite across SSR and client hydration, does not depend on component instance order, and does not use runtime heuristics such as stack traces, function names, or `Function.toString()`.

Use `useStableId()` for authored callsite identity: preload keys, serialized resource records, per-callsite SSR metadata, or hydration metadata that must line up between server and client.

When cache identity should follow the component definition rather than one specific hook callsite, use `useHostTypeId()` instead. That is the right primitive for component-scoped i18n catalog caches and similar resource dedupe keyed by component type.

Do not use `useStableId()` when you need unique DOM ids for multiple instances of the same component. Every instance of the same authored callsite receives the same value by design. Use `useId()` for instance-local DOM ids and accessibility relationships. `useId()` follows hook order within a host instance; `useStableId()` follows the authored callsite.

## Structural hooks and host capabilities

Structural hooks let function-authored components request capabilities that
must exist on their generated element class. The hook reads the capability;
a standard class mixin implements it.

```ts
import { defineHook } from "@litsx/core";

const I18nMixin = (Base) =>
  class extends Base {
    #i18n = createI18nController(this);

    get i18n() {
      return this.#i18n;
    }
  };

export const useI18n = defineHook({
  mixin: I18nMixin,
  use(host) {
    return host.i18n;
  },
});
```

Component authoring remains ordinary function and JSX syntax:

```tsx
export function SaveButton() {
  const i18n = useI18n();
  return <button>{i18n.t("save")}</button>;
}
```

The compiler lowers the reader call and installs the required capability:

```js
class SaveButton extends applyStructuralHooks(LitElement, [
  ...(useI18n[Symbol.for("litsx.structuralHooks")] || [useI18n]),
]) {
  render() {
    const i18n = readStructuralHook(this, useI18n, []);
    return html`<button>${i18n.t("save")}</button>`;
  }
}
```

`applyStructuralHooks()` resolves the mixin carried by each hook, deduplicates
by mixin identity, and preserves the order in which distinct capabilities first
appear in authored hook calls. Two different hooks may deliberately share one
mixin. Repeating either hook does not add another class to the inheritance
chain.

Mixins use ordinary class semantics. Lifecycle work overrides the relevant
method and delegates with `super`; properties, accessors, controllers, private
state, and static fields belong to the class capability itself. The removed
`static`, `setup`, `props`, `accessors`, and `middlewares` structural
hook fields are not accepted.

```js
const FormAssociatedMixin = (Base) =>
  class extends Base {
    static formAssociated = true;

    formResetCallback() {
      this.formControl.reset();
      return super.formResetCallback?.();
    }
  };
```

Custom hooks propagate structural requirements without exposing their
implementation. For example, a compiled `useTranslatedLabel()` that calls
`useI18n()` receives hidden metadata equivalent to:

```js
useTranslatedLabel[Symbol.for("litsx.structuralHooks")] = [
  ...(useI18n[Symbol.for("litsx.structuralHooks")] || [useI18n]),
];
```

A consuming component therefore installs `I18nMixin` even when it only calls
`useTranslatedLabel()`. This metadata is generated output, never authored
syntax. It works through local hooks, imports, namespace imports, re-exports,
and compiled packages.

Structural dependency discovery is intentionally static. Call hooks directly as
`useI18n()` or `hooks.useI18n()`. Runtime hook selection, aliases, containers,
and computed namespace access cannot produce a deterministic class mixin plan
and are compile-time errors.
