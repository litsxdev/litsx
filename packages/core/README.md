# @litsx/core

[![npm](https://img.shields.io/badge/npm-@litsx%2Fcore-CB3837)](https://www.npmjs.com/package/@litsx/core)
[![Release](https://img.shields.io/badge/release-public-2ea44f)](../../RELEASING.md)
[![Module](https://img.shields.io/badge/module-ESM%20%2B%20CJS-0366d6)](./package.json)
[![Provenance](https://img.shields.io/badge/npm_provenance-enabled-2ea44f)](../../RELEASING.md)

Runtime helpers that back the Lit<sup>SX</sup> compiler. The module bundles an
`EffectsController` plus native hooks such as `useAfterUpdate` and
`useOnCommit`, so compiled components can schedule work in Lit terms without
exposing the host-threading ABI used internally by the runtime.

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

## Installation

```bash
npm install @litsx/core lit
```

Configure TypeScript or your editor to use the LitSX JSX runtime:

```json
{
  "compilerOptions": {
    "jsx": "react-jsx",
    "jsxImportSource": "@litsx/core"
  }
}
```

LitSX source still needs to be compiled. Vite applications should normally use
[`@litsx/vite-plugin`](../vite-plugin/README.md); other build tools can call
[`@litsx/compiler`](../compiler/README.md) directly.

## What it provides

- `EffectsController`: a Lit `ReactiveController` implementation that tracks hook registrations, dependency arrays, effect queues, transitions, refs, and external-store subscriptions per host instance.
- Effect primitives:
  - `useAfterUpdate(callback, deps?)`: register a passive effect.
  - `useOnCommit(callback, deps?)`: register synchronous commit-phase work.
  - `useOnConnect(callback, deps?)`: register work that stays active only while the host is connected.
- State and concurrency primitives:
  - `useState`, `useReducedState`, `useControlledState`
  - `useAsyncState`, `useOptimistic`
  - `useTransition`, `startTransition`, `useDeferredValue`
- Host and ref primitives:
  - `useHost`, `useHostContent`, `useTextContent`, `useSlot`
  - `createRef`, `ref`, `useRef`, `useCallbackRef`, `useExpose`, `useId`, `useStableId`
  - `useMemoValue`, `useStableCallback`, `useEvent`, `useEmit`, `usePrevious`
  - `useExternalStore`, `useStyle`
- Form-associated custom-element primitives:
  - `useElementInternals`, `useFormValue`, `useFormValidity`
- Async and error primitives:
  - `ErrorBoundary`, `SuspenseBoundary`, `SuspenseList`
  - `lazy(() => import(...))` for authored lazy components. Compilation emits
    the lower-level `ensureLazyElement(...)` registration against the host's
    scoped registry; application components do not call that ABI directly.
- SSR request execution context:
  - `createExecutionContextKey(...)`
  - `getCurrentExecutionContext()`
- Component context compatibility through `@litsx/core/context`:
  - `createContext`, `useContext`, `renderContext`
- Component styling:
  - `css` is the original Lit template tag re-exported for the common
    `Component.styles = css\`...\`` authoring pattern.
  - `replaceStyles(...)` explicitly discards styles inherited from structural
    mixins or another base class; ordinary assignments extend them.
  - Lit directives remain available from their normal Lit entrypoints;
    `createRef` and `ref` are also re-exported because JSX refs lower directly
    to Lit's ref directive.
- Structural host capabilities:
  - `defineHook({ mixin })` for installation-only capabilities
  - `defineHook({ mixin, use })` when the hook also reads a value
  - compiler-owned structural reader and mixin application
  - stable mixin deduplication in first-use order
- JSX compatibility helpers:
  - `jsxSpreadElement(tagName, sources, options?, children?)` merges JSX prop sources in authored order. It uses an `ElementPart` in the browser and regular Lit parts during SSR.
  - Component constructors are finalized before spread resolution. Public prop names map to properties, while declared attribute aliases map back to their canonical attribute and Boolean presence semantics.
  - Standard custom-element host attributes (`class`, `id`, `style`, `slot`, `part`, global HTML attributes, `aria-*`, and `data-*`) remain on the host even when they are absent from the component's functional props. They are excluded from compiled object-rest forwarding bags; declared component props still take precedence.
  - Spread sources and explicit attributes retain authored JSX order. The final value wins, and a final `undefined` removes the corresponding host attribute.
  - Compiled components with an object-rest parameter publish `Symbol.for("litsx.restProps")` metadata. `jsxSpreadElement` uses it to keep declared reactive props on the component host while routing undeclared inputs through one compact reactive object for forwarding to an inner element.
  - `on:event` is the explicit JSX event channel. The destination constructor, reactive component API, and native DOM properties determine whether ordinary JSX names become Lit property, boolean-attribute, or attribute bindings.
  - `onX` names are ordinary component properties/callbacks. React-style `onClick` event conversion belongs exclusively to react-compat. Native handler properties such as `onclick` remain available and are assigned as properties.
  - Hydratable spread output should be rendered with `@litsx/ssr` and hydrated with `@litsx/ssr/hydration` so the two template shapes are reconciled without replacing DOM nodes.

## Ref semantics

Native LitSX refs follow Lit's contract: object refs expose `.value`, and refs are
cleared with `undefined`. JSX keeps the standard `ref={...}` shape while the
compiler lowers intrinsic-element refs to Lit's element-part directive:

```tsx
const inputRef = useRef<HTMLInputElement>();

useOnCommit(() => inputRef.value?.focus(), []);
return <input ref={inputRef} />;
```

A ref object may deliberately hold any of several compatible targets and be
shared by those intrinsic elements:

```tsx
const targetRef = useRef<HTMLButtonElement | HTMLAnchorElement>();

return active
  ? <button ref={targetRef}>Continue</button>
  : <a ref={targetRef} href="/continue">Continue</a>;
```

The union must contain every destination that receives the ref; an
anchor-only ref is still rejected on `<button>`.

Component refs travel through the `.ref` property until they reach their final
host, forwarded element, or `useExpose` handle. Object refs, callback refs,
spreads, SSR, and hydration share the same `.value`/`undefined` lifecycle. The
React compatibility preset supplies `.current`/`null` facades without changing
the native runtime contract.

SSR serializes the element and Lit's hydration markers, never the ref object or
callback. On the client, Lit reconnects its element part to the existing server
node and only then publishes that node through the ref. Hydration therefore does
not recreate an element merely to populate its ref.

## Projected host content

LitSX exposes the host's authored light-DOM content as reactive input:

```tsx
import { useHostContent, useSlot, useTextContent } from "@litsx/core";

export function SourcePreview() {
  const source = useTextContent({ trim: true });
  const actions = useSlot("actions");
  const content = useHostContent();

  return (
    <pre data-node-count={content.nodes.length}>
      {source} ({actions.length})
    </pre>
  );
}
```

Use `useTextContent()` for flattened text, `useSlot(name?)` for one slot, and
`useHostContent()` when node boundaries and the complete slot map matter. These
hooks observe projected content; they do not turn JSX children into a virtual
node collection.

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

## Async boundaries and lazy components

`lazy()` keeps the component's prop type while deferring its module load. Put a
lazy component inside `SuspenseBoundary`; use `SuspenseList` when sibling
boundaries must reveal in a defined order:

```tsx
import { lazy, SuspenseBoundary, SuspenseList } from "@litsx/core";

const LazyChart = lazy(() => import("./Chart.js"));

export function Dashboard() {
  return (
    <SuspenseList revealOrder="forwards" tail="collapsed">
      <SuspenseBoundary fallback={<p>Loading chart…</p>}>
        <LazyChart />
      </SuspenseBoundary>
    </SuspenseList>
  );
}
```

`ErrorBoundary` accepts authored children plus a `fallback` value or
`fallback(error)` function and an optional `onError` callback. The compiler owns
the internal renderer properties for all three boundary elements; application
code should use `children` and `fallback`, not the removed
`contentRenderer`/`fallbackRenderer` contract.

Hooks use the active synchronous render context established by compiled output.
Their authored arguments are never rewritten and the host is never prepended.
Call `useHost()` when a hook explicitly needs the current element.

## Styling

LitSX has distinct primitives for static component CSS, host styling, and
inline element styling:

- `Component.styles = css\`...\`` defines static component CSS and accepts Lit
  `CSSResultGroup` composition. It extends inherited styles unless wrapped in
  `replaceStyles(...)`.
- `useStyle(...)` applies dynamic style properties or CSS custom properties to
  the component host.
- `style="color: red"` and `style={styleText}` apply inline CSS text.
- `style={{ color: "red", width: "20px" }}` applies a dynamic property map
  through Lit's official `styleMap` directive.

Style maps accept camelCase properties, dashed properties, and custom
properties:

```tsx
<div style={{
  backgroundColor: "tomato",
  "border-top": "1px solid currentColor",
  "--accent": tone,
  opacity: active ? 1 : 0.5,
}} />
```

LitSX keeps Lit's `styleMap` value semantics. Numeric values are not given an
implicit unit: use `width: "20px"` when a unit is required. A top-level dynamic
binding may switch between CSS text, a style map, `null`, and `undefined`.

## State, concurrency, and external stores

- `useState`, `useReducedState`, and `useControlledState` cover local, reducer,
  and controlled/uncontrolled state.
- `useAsyncState(initial, action)` returns `[state, run, status]`; only the latest
  started run may commit its result or error.
- `useOptimistic(state, updateFn?)` layers temporary updates over an authoritative
  value and exposes a reset function.
- `useTransition()` returns `[pending, start]`; `startTransition()` provides the
  same scheduling outside that hook, and `useDeferredValue()` lets expensive
  consumers lag behind urgent input.
- `useExternalStore(subscribe, getSnapshot, getServerSnapshot?)` subscribes the
  current host to state owned outside LitSX. Keep snapshot functions synchronous.
- `useExpose(createHandle, deps?)` publishes imperative methods on the host;
  `useExpose(ref, createHandle, deps?)` publishes them through a ref. Exposed
  handles are method-only surfaces.

## Usage

```tsx
import type { LitElement } from "lit";
import { useAfterUpdate, useHost, useOnCommit } from "@litsx/core";

export function ClockDisplay({ delay = 1000 }) {
  const host = useHost<LitElement>();

  useOnCommit(() => {
    host.classList.add("hydrated");
  }, []);

  useAfterUpdate(() => {
    const handle = setInterval(() => host.requestUpdate(), delay);
    return () => clearInterval(handle);
  }, [delay]);

  return <time>{new Date().toLocaleTimeString()}</time>;
}
```

## JSX Tooling

For editor and TypeScript support, point JSX at `@litsx/core` directly:

```json
{
  "compilerOptions": {
    "jsx": "react-jsx",
    "jsxImportSource": "@litsx/core"
  }
}
```

That gives the IDE a stable JSX runtime surface even when Babel later rewrites the implementation to Lit templates and scoped elements.

Pure Lit component classes can also be used directly as JSX destinations. The
JSX runtime projects their declared reactive properties and data fields added by
standard mixins while preserving the authored TypeScript types:

```tsx
class StatusBadge extends LitElement {
  static properties = {
    tone: { type: String },
    model: { attribute: false },
  };

  declare tone: "neutral" | "positive";
  declare model: { id: string } | null;
}

<StatusBadge tone="positive" model={{ id: "ready" }} />;
```

These properties are optional at the JSX callsite, matching custom-element
construction and Lit defaults. Standard host attributes and typed refs remain
available, while inherited `LitElement` runtime APIs and component methods are
not exposed as authored props.

Layout work runs immediately during `hostUpdated()`, while passive effects are deferred to the next frame to avoid blocking rendering. Cleanups execute when dependencies change, before the effect runs again, and once when the host disconnects.

## Working with the Babel plugins

- Generated `render()` methods establish one bounded hook context and reset the
  controller cursor for each render attempt.
- Native authored hooks lower directly to this runtime surface.
- React-compat transforms also lower their supported hook subset to these native Lit<sup>sx</sup> helpers.
- Each Lit element instance gets its own `EffectsController` behind the scenes.

`EffectsController`, `renderWithHooks`, `readStructuralHook`, and
`applyStructuralHooks` form the public low-level compiler/runtime ABI exported
by `@litsx/core`, because they appear in generated modules. Application
components use authored hooks instead of constructing the controller or calling
those helpers. Hook cursor and host-context helpers remain implementation
details and are not exported by the package.

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

## Form-associated custom elements

The form hooks share one structural mixin. Calling any combination of them marks
the generated host as form-associated and installs the native FACE lifecycle
once:

```tsx
import { useFormValidity, useFormValue } from "@litsx/core";

export function QuantityField({ defaultValue = "1" }) {
  const field = useFormValue(defaultValue);
  const validation = useFormValidity();

  function update(event: Event) {
    const value = (event.currentTarget as HTMLInputElement).value;
    field.setValue(value);
    validation.setValidity(
      value ? {} : { valueMissing: true },
      value ? "" : "A quantity is required",
    );
  }

  return <input value={field.value} disabled={field.disabled} on:input={update} />;
}
```

`useFormValue(defaultValue?)` tracks value, default value, owning form, disabled
state, reset, and browser state restoration. `useFormValidity()` exposes the
current validity snapshot plus `setValidity`, `checkValidity`, and
`reportValidity`. Use `useElementInternals()` only when a library needs direct,
feature-detected access to the shared `ElementInternals` instance.

## Structural hooks and host capabilities

Structural hooks let function-authored components request capabilities that
must exist on their generated element class. A standard class mixin implements
the capability; an optional reader exposes an explicitly selected value.

```ts
import { defineHook, useHost } from "@litsx/core";

const I18nMixin = (Base) =>
  class extends Base {
    #i18n = createI18nController(this);

    get i18n() {
      return this.#i18n;
    }
  };

export const useI18n = defineHook({
  mixin: I18nMixin,
  use() {
    return useHost().i18n;
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

Inline SVG uses that same JSX contract. LitSX types `SVGElementTagNameMap`,
switches namespaces automatically at `<svg>`/`<foreignObject>`, and preserves
the namespace for dynamic fragments and spreads:

```tsx
export function CheckIcon({ shapes }) {
  return (
    <svg viewBox="0 0 24 24" strokeWidth={2} aria-hidden="true">
      {shapes.map((shape) => <path d={shape.d} />)}
      <foreignObject width={24} height={8}>
        <div>HTML</div>
      </foreignObject>
    </svg>
  );
}
```

CamelCase SVG presentation attributes such as `strokeWidth` are emitted with
their native dashed spelling. No manual `svg` template tag, JSX augmentation,
or `jsxSpreadElement()` call is required.

TypeScript's `JSX.IntrinsicElements` lookup does not receive the parent DOM
namespace. For names present in both HTML and SVG maps, such as `a`, `script`,
`style`, and `title`, LitSX therefore follows the normal HTML intrinsic target
for event and ref types. The compiler still emits the correct SVG namespace
when those tags occur below `<svg>`.

The compiler lowers the reader call and installs the required capability:

```js
class SaveButton extends applyStructuralHooks(LitElement, [
  ...(useI18n[Symbol.for("litsx.structuralHooks")] || [useI18n]),
]) {
  render() {
    return renderWithHooks(this, () => {
      const i18n = readStructuralHook(useI18n, []);
      return html`<button>${i18n.t("save")}</button>`;
    });
  }
}
```

`applyStructuralHooks()` resolves the mixin carried by each hook, deduplicates
by mixin identity, and preserves the order in which distinct capabilities first
appear in authored hook calls. Two different hooks may deliberately share one
mixin. Repeating either hook does not add another class to the inheritance
chain.

Omit `use` when the callsite only needs to install class behavior:

```ts
const useFocusRing = defineHook({
  mixin: FocusRingMixin,
});

export function FocusableControl() {
  useFocusRing(); // returns void
  return <button>Focus me</button>;
}
```

An installation-only hook never returns the host or an inferred property
snapshot. If a capability needs a public value, define its `use()` reader
explicitly. This keeps multiple composed mixins isolated even though they share
one generated host instance.

Mixins use ordinary class semantics. Lifecycle work overrides the relevant
method and delegates with `super`; properties, accessors, controllers, private
state, and static fields belong to the class capability itself. The removed
`static`, `setup`, `props`, `accessors`, and `middlewares` structural
hook fields are not accepted.

Lit finalizes reactive `properties` across the class chain automatically. A
mixin can therefore declare only its own properties. Styles are different:
every mixin that contributes styles must preserve the prior class explicitly.
Scoped element maps follow the same cooperative collection rule:

```js
const StyledCapabilityMixin = (Base) =>
  class extends Base {
    static properties = {
      active: { type: Boolean },
    };

    static styles = [super.styles ?? [], capabilityStyles];

    static elements = {
      ...(super.elements ?? {}),
      "capability-icon": CapabilityIcon,
    };
  };

const useStyledCapability = defineHook({
  mixin: StyledCapabilityMixin,
  use: () => useHost().active,
});

function CapabilityButton() {
  const active = useStyledCapability();
  return <button class="button">{active ? "Active" : "Inactive"}</button>;
}

CapabilityButton.styles = css`
  .button { padding: 0.5rem 1rem; }
`;
```

Function-authored components compose inherited styles and elements
automatically. In this example, calling `useStyledCapability()` installs the
mixin before the generated component class; the compiler then emits the
component stylesheet after `super.styles`. Use
`Component.styles = replaceStyles(styles)` only when the component
intentionally cuts the style chain. A derived reactive property with the same
name replaces its inherited Lit declaration; options are not merged across
classes.

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

## Public entrypoints

- `@litsx/core` is the application runtime and the canonical generated-code ABI.
- `@litsx/core/jsx-runtime` and `@litsx/core/jsx-dev-runtime` provide the
  automatic JSX runtime selected by `jsxImportSource`.
- `@litsx/core/context` provides the React-compatible `createContext`,
  `useContext`, and `renderContext` contract used by compatibility transforms
  and libraries that need the same client/SSR context semantics.
- `@litsx/core/elements` provides `ShadowDomMixin`, `LightDomMixin`, hydration
  metadata, scoped-element helpers, and other element infrastructure consumed by
  generated code and framework integrations.
- `@litsx/core/rendering` provides low-level contextual renderer mounting and SSR
  helpers. It is intended for renderer/build integrations, not ordinary
  components.
- `@litsx/core/react-compat` provides `.current`/`null` ref adapters for the
  React compatibility pipeline. Native LitSX code should use the `.value`/
  `undefined` ref contract from the root entrypoint.

Exports whose names begin with `__`, metadata symbols, element mixins, renderer
helpers, and `ensureLazyElement()` are compiler or framework integration
surfaces. They remain public because generated modules and adapters import them,
but application code should prefer the authored APIs documented above.
