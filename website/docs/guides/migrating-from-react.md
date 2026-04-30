# Migrating from React

Lit<sup>sx</sup> supports React migration by making compatibility explicit instead of pretending the runtime is React.

The boundary is intentional:

- Lit<sup>sx</sup> is the framework
- React compatibility is a lowering layer
- the runtime target is still Lit + web components

## Canonical Pipeline

For Babel-based migration, the explicit compatibility entrypoint is:

- `@litsx/babel-preset-react-compat`

That preset covers the React-shaped migration surface and lowers it into native Lit<sup>sx</sup> JSX and runtime primitives.

Most other React lowering stages are internal to the preset. Treat the preset as the supported public entrypoint.

## Supported Surface

The supported React-authored migration surface includes:

- `className`
- `htmlFor`
- controlled and uncontrolled form bindings for `value`, `checked`, `defaultValue`, `defaultChecked`, and `selected`
- React `onChange` normalization for text-like inputs and `textarea`
- `memo(...)`
- React 19-style `ref` as a prop
- `forwardRef(...)`
- `memo(forwardRef(...))`
- namespace wrapper forms such as `React.memo(...)` and `React.forwardRef(...)`
- `lazy(...)`
- `Suspense`
- `SuspenseList`
- error boundaries
- React hook names that map cleanly to Lit<sup>sx</sup>

<script setup>
import {
  reactContextExampleSource,
  reactForwardRefExampleSource,
  reactMigrationExampleSource,
} from "../.vitepress/theme/components/playground-example-source.js";
</script>

### End-to-end Example

This demo runs the playground in explicit React compatibility mode, so the authored source keeps React-shaped names while the emitted output shows the lowered Lit<sup>sx</sup> result.

<ClientOnly>
  <litsx-playground
    mode="react-compat"
    exportname="ReactMigrationDemo"
    previewtagname="docs-react-migration-demo"
    filename="/playground/ReactMigrationDemo.tsx"
    panelmaxheight="28rem"
  >{{ reactMigrationExampleSource }}</litsx-playground>
</ClientOnly>

The demo loads the lazy module from a `data:` URL only so the embedded playground can resolve it
inside a single preview document. In a real project, relative dynamic imports like
`lazy(() => import("./ResultsPanel.js"))` work normally.

## Working with Refs

This smaller example uses the React 19-style `ref` prop directly. The parent keeps a ref to the
final input element, not to the intermediate component wrapper.

<ClientOnly>
  <litsx-playground
    mode="react-compat"
    exportname="ReactForwardRefDemo"
    previewtagname="docs-react-forward-ref-demo"
    filename="/playground/ReactForwardRefDemo.tsx"
    panelmaxheight="24rem"
  >{{ reactForwardRefExampleSource }}</litsx-playground>
</ClientOnly>

Lit<sup>sx</sup> resolves a component `ref` by priority, not by wrapper syntax:

1. If the component publishes an imperative handle, the `ref` receives that handle.
2. Otherwise, if the component reassigns the incoming `ref` to another element or child component, the `ref` receives that forwarded target.
3. Otherwise, the `ref` receives the Lit<sup>sx</sup> component instance itself.

That gives you four practical cases:

- `ref` on a Lit<sup>sx</sup> component with no override -> component instance
- `ref` on a Lit<sup>sx</sup> component that forwards to an `HTMLElement` -> that DOM node
- `ref` on a Lit<sup>sx</sup> component that publishes an imperative API -> that imperative handle
- `ref` on a Lit<sup>sx</sup> component that forwards to another Lit<sup>sx</sup> component -> whatever the child resolves, transitively

`forwardRef(...)` remains supported as migration syntax, but it is no longer the conceptual center of the model. The important part is the final `ref` target that the component chooses to resolve.

In practice, the three pieces fit together like this:

- React 19-style `ref` as a prop maps directly onto the native Lit<sup>sx</sup> `ref` channel
- `forwardRef(...)` is accepted as migration syntax, but it lowers to that same native `ref` channel instead of creating a separate model
- `useImperativeHandle(ref, ...)` maps to `useExpose(ref, ...)`, so the imperative handle wins over the default instance or any forwarded node target on that same channel

So the React-compat story is not "React refs keep their own runtime rules". It is "React ref syntax lowers into the native Lit<sup>sx</sup> resolution order".

## Working with Context

React context is supported in the compatibility layer through `createContext`, `Provider`, `Consumer`, and `useContext`.

<ClientOnly>
  <litsx-playground
    mode="react-compat"
    exportname="ReactContextDemo"
    previewtagname="docs-react-context-demo"
    filename="/playground/ReactContextDemo.tsx"
    panelmaxheight="26rem"
  >{{ reactContextExampleSource }}</litsx-playground>
</ClientOnly>

This is migration support, not a native Lit<sup>sx</sup> primitive. The authored API stays React-shaped, but the lowered runtime target is Lit<sup>sx</sup> plus `@lit/context`.

## Children and Slots

React code often treats `children` as the default composition channel.

That continues to work during migration, but the native Lit<sup>sx</sup> direction is different:

- projected content is a web-component concern, not just a function-call prop
- default composition maps naturally to host content and slots
- named composition is usually better expressed with slots than with several React-style child props

So the migration rule of thumb is:

- keep `children` while migrating existing React-shaped source
- prefer slots in native Lit<sup>sx</sup> component APIs

In other words, `children` is compatibility vocabulary; slots are the preferred native composition model.

That becomes more important in the more complex React patterns:

- `children` as plain nested content maps well to projected content
- named child regions map more naturally to named slots
- render-prop style `children` is still just a function prop, not projected content
- `React.Children.*` traversal and `cloneElement(...)` are a much worse fit, because web-component composition is not based on walking and rewriting a virtual child tree on every render

So for complex composition:

- prefer slots over `Children.map(...)`-style child rewriting
- prefer explicit props, events, or slots over `cloneElement(...)`
- prefer state + slots or state + dedicated subcomponents over React compound-component patterns that depend on inspecting `children`

The more a React component API depends on treating `children` as an in-memory data structure to traverse and rewrite, the less native that API will feel in Lit<sup>sx</sup>.

## Compatibility Matrix

### Attributes and DOM semantics

| React source | Lit<sup>sx</sup> target | Notes |
| --- | --- | --- |
| `className` | `class` | Compatibility alias only. Native Lit<sup>sx</sup> authoring should use `class`. |
| `htmlFor` | `for` | Straight attribute alias. |
| `value` | `.value` | Lowered as a property binding for controlled inputs. |
| `checked` | `?checked` | Lowered as a boolean binding. |
| `selected` | `?selected` | Lowered as a boolean binding. |
| `defaultValue` | initial value binding | Migration-friendly initial binding, not long-term native vocabulary. |
| `defaultChecked` | initial checked binding | Migration-friendly initial binding, not long-term native vocabulary. |
| text-like `onChange` | `@input` | Normalized toward native input events where React differs from the DOM. |
| checkbox/radio `onChange` | `@change` | Preserved where native DOM semantics already match the intent. |
| `children` | projected content / slots | Supported as migration vocabulary, but native Lit<sup>sx</sup> prefers slots for public composition APIs. |
| render-prop `children` | function prop | Still possible, but this is not the same thing as projected content. |
| `React.Children.*` | no native equivalent | Complex child traversal is not the preferred composition model in Lit<sup>sx</sup>. |
| `cloneElement(...)` | no native equivalent | Prefer explicit props, events, or slots instead of rewriting child elements during render. |

### Refs and wrappers

| React source | Lit<sup>sx</sup> target | Notes |
| --- | --- | --- |
| React 19-style `ref` as a prop | native `ref` prop | Supported. The component resolves the final target. |
| `forwardRef(...)` | native `ref` prop model | Supported as migration syntax. The wrapper is lowered away. |
| `React.forwardRef(...)` | native `ref` prop model | Namespace form is supported. |
| `memo(Component)` | component lowering only | Supported as a migration wrapper. Lit<sup>sx</sup> strips it and emits a warning. |
| `memo(Component, areEqual)` | component lowering only | Supported for migration, but the comparator is ignored and emits an extra warning. |
| `memo(forwardRef(...))` | native `ref` prop model | Supported. `memo` is stripped; `ref` resolution still works. |
| `ref` on a plain migrated component | component instance by default | Unless that component forwards the incoming `ref` or publishes an imperative handle. |
| `ref` forwarded to an `HTMLElement` | DOM node | Useful for thin wrappers around native controls. |
| `ref` forwarded to another Lit<sup>sx</sup> component | child resolution, transitively | The final value is whatever the child resolves. |
| `useImperativeHandle(ref, ...)` | `useExpose(ref, ...)` | The imperative handle wins over the default instance or forwarded node target. |

`memo(...)` matters in React because React often re-renders child components when a parent renders,
so `memo` is used to bail out when props are unchanged. Lit<sup>sx</sup> does not share that same
component re-render model: updates are driven by the host element's own reactive state and property
changes, not by a parent function re-invoking the child component tree on every render.

That means the compat layer accepts `memo(...)` so existing React-authored code can migrate without
being rewritten first, but it warns explicitly because the wrapper is removed. Its practical role
here is "wrapper tolerated during migration", not "React-style render bailout primitive you still
need for correctness or normal performance tuning".

### Hooks and async UI

| React source | Lit<sup>sx</sup> target | Notes |
| --- | --- | --- |
| `useState` | `useState` | Native concept stays the same. |
| `useRef` | `useRef` + callback-ref wiring | The transform adds the DOM/component wiring needed for the authored `ref` usage. |
| `useEffect` | `useAfterUpdate` | Same intent, different native name. |
| `useLayoutEffect` | `useOnCommit` | Same intent, different native name. |
| `useMemo` | `useMemoValue` | Native naming is more explicit about value memoization. |
| `useCallback` | `useStableCallback` | Native naming is more explicit about identity stability. |
| `useReducer` | `useReducedState` | Native reducer primitive. |
| `useId` | `useId` | Same concept. |
| `useImperativeHandle` | `useExpose` | Publishes an imperative handle through the same `ref` channel. |
| `useSyncExternalStore` | `useExternalStore` | Native external store primitive. |
| `useOptimistic` | `useOptimistic` | Supported in react-compat. The native hook also exposes an explicit reset capability, which React-authored two-value destructuring simply ignores. |
| `useTransition` | `useTransition` | Same concept, native runtime implementation. |
| `startTransition` | `startTransition` | Same concept, native runtime implementation. |
| `useDeferredValue` | `useDeferredValue` | Same concept, native runtime implementation. |
| `createContext` / `Provider` / `Consumer` / `useContext` | React-compat context runtime over `@lit/context` | Supported in `react-compat` only. This is migration support, not a native Lit<sup>sx</sup> primitive. |
| `useActionState` | `useAsyncState` | Not a direct lowering. `useAsyncState` is the closest native Lit<sup>sx</sup> primitive for authoritative async mutations. |
| `lazy(...)` | native lazy element registration | Lowered to Lit<sup>sx</sup>'s lazy-element model. |
| `Suspense` | `SuspenseBoundary` | Lowered to the native boundary primitive. |
| `SuspenseList` | `SuspenseList` | Lowered to the native reveal-order primitive. |
| React error boundaries | native Lit<sup>sx</sup> boundary model | Lowered to the Lit<sup>sx</sup> error-boundary runtime surface. |

## Unsupported or Deferred

The migration layer is intentionally narrower than React DOM or React runtime as a whole.

Current non-goals or deferred areas:

- `useInsertionEffect`: out of scope for the current migration layer
- React 19 hooks such as `useActionState` and `use`: still deferred until there is a coherent Lit<sup>sx</sup> target
- custom comparator semantics in `memo(Component, areEqual)`
- broad React DOM emulation beyond the cases above

React context is intentionally scoped to the compatibility layer. Lit<sup>sx</sup> does not introduce a native context primitive here; the compat lowering is provided so React-authored code can migrate while the native model stays smaller.

If you need a native Lit<sup>sx</sup> alternative to `useActionState` today, use [`useAsyncState`](../reference/generated/useasyncstate.md) in native authored code. It is not a React-compat lowering of `useActionState`, but it is the closest Lit<sup>sx</sup> primitive for authoritative async mutations.

## Shadow DOM vs Light DOM

React compatibility does not imply light DOM.

The compat layer translates React-authored source into native Lit<sup>sx</sup> components, but it does not change the default encapsulation model of those components. The default output still follows the normal Lit<sup>sx</sup> direction:

- `shadow DOM` by default
- `light DOM` only when explicitly requested

If a migration needs global styles to keep flowing through every transformed component, such as a Tailwind-heavy app shell, configure the preset explicitly:

```json
{
  "presets": [
    ["@litsx/babel-preset-react-compat", { "domMode": "light" }]
  ]
}
```

That split is intentional:

- choose `shadow DOM` when you want the normal web-component boundary and styling isolation
- choose `light DOM` when a migration needs to preserve a styling system that depends heavily on global CSS, resets, or external selectors

So the migration decision and the DOM-mode decision should stay separate:

- `react-compat` answers "can I keep this React-shaped source while migrating?"
- `light DOM` answers "does this component need to participate in global styling instead of using shadow-root encapsulation?"

If there is no strong migration reason to keep global CSS flowing through, prefer the default `shadow DOM` output.

## Recommended Migration Path

1. Keep component authoring in JSX while you migrate.
2. Add the explicit React compatibility layer.
3. Move wrappers, DOM bindings, and hook names toward native Lit<sup>sx</sup> vocabulary.
4. Treat the transformed output as an implementation detail, not as the API you optimize around.

## Where to Look

- [JSX Authoring](./jsx-authoring.md)
- [Primitives](./primitives.md)
- [Refs](./refs.md)
- [Async UI](./suspense.md)
- [Examples](../examples/)
- [Transform Recipes](../transforms/)
