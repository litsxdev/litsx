# litsx

## 1.0.0-next.1

### Patch Changes

- 954fff8: Preserve imported component constructors across JSX lowering so direct props,
  declared attribute aliases, and spreads resolve through one component API in
  browser and SSR builds. Finalize Lit property metadata before runtime inference,
  make compiled SSR spread templates explicit, and hydrate them without replacing
  the server-rendered host or structural branch. Select the client ElementPart
  path when SSR-transformed modules execute in a browser, keep the client marker
  out of server-only imports, and let component defaults handle `undefined`
  spread overrides while preserving explicit `null`. Keep virtual JSX position
  remapping linear as complex templates add generated Lit bindings.
- Updated dependencies [954fff8]
  - @litsx/authoring@1.0.0-next.1

## 1.0.0-next.0

### Major Changes

- 83d757e: Stabilize the complete public LitSX package graph as the 1.0 release line.

  This release establishes standard JSX and TSX authoring, SSR and hydration,
  React compatibility, scoped custom-element registration, structural hooks,
  Storybook and Vite integration, and Shadow DOM and Light DOM UnoCSS support as
  the stable public contract.

### Minor Changes

- ad185f4: Render JSX spread attributes through an `ElementPart` in the browser while retaining regular Lit parts during SSR. Add digest reconciliation and hydration wrappers that preserve server DOM identity without patching Lit, infer third-party component properties from their constructors, and avoid redundant attribute writes during hydration.
- 53939a2: Add SSR-safe dynamic fallback rendering for the LitSX `<noscript>` intrinsic.
- 92e1dbe: Add phase 1 SSR support for generic custom elements across the LitSX SSR and
  compiler pipelines.

  LitSX now recognizes hydratable non-Lit custom element constructors, carries
  their SSR metadata through compiled scoped-element registries and SSR root
  rewrites, and supports host-only SSR plus hydration payload collection for
  generic `HTMLElement` roots.

  `@litsx/ssr` also exposes a new `renderCustomElementSsr(...)` hook so consumer
  frameworks can take over SSR for hydratable non-Lit custom elements, contribute
  client imports, preloads, head tags, and opaque adapter artifacts, while
  preserving LitSX root metadata and hydration orchestration.

- 719cf1e: Add a public LitSX hydration-module registration primitive in `@litsx/ssr/hydration`
  so frameworks can import client modules and register hydratable custom elements
  before calling `hydratePage(...)`.

  Emit explicit hydratable tag metadata on compiled LitSX component classes and
  expose the corresponding runtime symbol from `@litsx/core` so hydration module
  registration can inspect module namespaces without relying on framework-private
  conventions or hydration payload introspection.

- 60b2e98: Replace structural middleware entries with statically discovered class-capability
  mixins. Structural hooks now use `defineHook({ mixin, use })`; the compiler
  propagates transitive hook metadata, installs distinct mixins in first-callsite
  order, and lowers readers against the generated host. Remove the former
  `static`, `setup`, `props`, `accessors`, and lifecycle-middleware contract.

  Implement the form-associated hooks on one shared `FormAssociatedMixin`, so
  using any combination of the FACE readers installs the platform capability only
  once while preserving form lifecycle and validity behavior.

- 1aa0135: Add the UnoCSS integration with shared project-level preflight,
  module-local Shadow DOM utilities, client and SSR support, and generic Vite
  plugin phases around the LitSX Storybook compiler. Add component-owned static
  utility guards with exact export resolution, runtime-safe CSSResult
  materialization, extensible authoring style types, and dependency-aware HMR.
  Expose a build-tool-neutral engine for extraction, guard materialization,
  module utility generation, preflight finalization and dependency invalidation.
  Keep Vite lifecycle and HMR policy in the optional `/vite` adapter. Compose
  UnoCSS's official global mode onto the same resolved context so applications
  can import `virtual:uno.css` for page-level light DOM without a second config,
  token store, preflight generator or UnoCSS instance.
  Add the generic `scoped`, `global`, and `none` light-DOM style routes. UnoCSS
  uses stable compiler-generated scope identities and CSS scope end boundaries
  to prevent utility selectors crossing into nested light-DOM components, while
  SSR preserves the same short opaque scope identity for hydration.
- accc7aa: Make standard JSX and TSX the recommended LitSX authoring surface. Infer Lit attribute, boolean, and property bindings from ordinary prop names; add the explicit `on:event` listener convention for HTML and custom elements; preserve native lowercase handler properties; type published custom-event metadata; and keep React `onX` conversion isolated to react-compat.

  Make standard `.jsx` and `.tsx` the only authored source formats. Generate projects with ordinary component props, `Component.styles = css\`...\``assignments, native`tsc`type-checking, standard Prettier formatting, and TSX Storybook stories. Remove the unreleased`.litsx`, prefixed binding, static-hoist, custom TypeScript, Prettier-plugin, and syntax-highlighting compatibility surfaces.

  Allow React-authored hook dependencies to opt into recursive react-compat transformation. Vite now keeps selected packages out of dependency prebundling and SSR externalization, transforms their JavaScript and TypeScript modules, propagates the LitSX host through custom-hook graphs, emits compiled-hook metadata, and stops with a diagnostic at unsupported React hook boundaries.

  Normalize statically analyzable output from React's classic and automatic JSX runtimes before react-compat lowering. Allowlisted compiled dependencies can now recover named components, fragments, props and spreads, children, keys, refs, minified public component aliases, and effect sequences from `createElement`, `jsx`, `jsxs`, and `jsxDEV`, while unsupported dynamic element operations stop with explicit diagnostics.

  Recover effect-only React components that render `null`, trailing named component exports, namespace `useRef` calls, and statically bounded polymorphic `asChild` aliases. Resolve host-aware hooks from the ESM implementation of allowlisted dependencies, and emit valid quoted property metadata and computed instance access for hyphenated TypeScript props such as `aria-label`.

  Preserve object-rest component props as one reactive forwarding bag instead of expanding utility types such as `React.ComponentProps<"button">` into the generated custom-element API. Publish a runtime rest-props contract on compiled classes and route local and third-party component inputs through it in both client rendering and SSR.

  Lower native JSX refs directly to Lit's `ref()` directive and adopt Lit's `.value`/`undefined` contract throughout the core runtime, component forwarding, imperative handles, spreads, SSR, and hydration. React compatibility now creates `.current`/`null` facades over Lit refs and adapts callback and external refs at compiled React boundaries, preserving React-authored consumers without leaking React ref semantics into native LitSX.

  Align native JSX types, examples, fixtures, and package documentation with the same contract. Native intrinsic elements no longer advertise React-only `className`, `htmlFor`, `onClick`, or `key` props; use `class`, `for`, `on:event`, and Lit's `repeat()`/`keyed()` directives instead. React-authored source retains those forms through react-compat.

  Make light DOM the default for react-compat migrations and restore contextual scoped-element registries for light hosts. Activate the registry shim only when a component needs scoped elements, preserve initialization across nested light/shadow trees, projected renderers, asynchronous definitions, reconnects, and native/global custom-element coexistence, and retain `domMode: "shadow"` as an explicit opt-in.

  Use the modern `document.importNode()` registry option as Lit's creation scope when the browser provides native scoped custom-element registries, so nested shadow components initialize without the legacy registry polyfill.

  Register imported authored components after Storybook's CSF transforms so extensionless local TSX imports remain defined and initialized in both development and static Storybook builds.

  Escape literal backticks and backslashes in JSX text when emitting Lit template literals, so documentation and code examples remain valid standard JSX.

- 53028b8: Add `useSsrResourceSnapshot(...)` for library runtimes that need to capture a
  request-scoped global resource cache after SSR settles and restore it
  synchronously before hydration registration or client module loading.

### Patch Changes

- 57a20ff: Complete the public SSR surface with streaming metadata, hydration payload support, browser hydration coverage, and release integration for the SSR packages.
- 450ae03: Accept the compiler-injected host argument in `useSsrResourceSnapshot` while preserving its one-argument authoring API.
- 46e4cce: Support forwarding standard client refs through async Server Component composition during SSR hydration.
- 54a0ec0: Fix declarative-shadow-DOM hydration for nested scoped and light-DOM elements, and emit executable SSR bootstrap modules through the Vite dev asset pipeline.
- 7d9ee7d: Isolate scoped registries, hydration contexts, noscript state, and soft Suspense collectors across concurrent SSR renders. The scoped custom-element lookup bridge is now reentrant, so interleaved requests resolve their own constructors and hydration metadata without cross-request leakage.
- 4719308: Keep scoped LitSX children compatible with `@webcomponents/scoped-custom-element-registry` by replacing polyfilled registries with the LitSX scoped runtime, and surface SSR development logs and render failures in the browser.
- 0ae3bc9: Add framework-level soft suspense for render hooks without an enclosing SuspenseBoundary. Compiled render methods now wrap hook execution so thrown thenables suspend the host, render `nothing`, and request an update when resolved, while preserving explicit SuspenseBoundary handling.

  SSR now retries rootless soft suspensions before serializing or streaming output, recreating the SSR context for the successful pass so hydration roots and payloads are not duplicated.

- 627c163: Keep both `useExpose` signatures SSR-safe without evaluating or serializing imperative handles or mutating consumer refs.
- c9ae368: Keep native callback and object refs synchronized when a render suspends, resumes, changes target, or disconnects. Native ref lowering now also handles member expressions and aliases without serializing ref values into HTML attributes, including defaulted destructured props.
- 43aa10a: Tighten the `.tsx` `style` contract to reject object-valued JSX `style`
  bindings, document the string-only inline style behavior, and keep the public
  types aligned with that runtime/compiler rule.

  Fix authored component lowering so destructuring from opaque `props` aliases
  continues to resolve against the host instance, preserving SSR output for
  hydrated components that read values like `href`, `label`, `title`, or `body`
  from `props`.

  Escape backticks and literal interpolation markers in generated SSR template
  segments so authored text content containing `` ` `` or `${...}` survives
  compilation without producing invalid output.

- Updated dependencies [83d757e]
- Updated dependencies [accc7aa]
  - @litsx/authoring@1.0.0-next.0
  - @litsx/scoped-registry-shim@1.0.0-next.0

## 0.16.0

### Minor Changes

- 3e5ba90: Add structural `props()` middleware support across runtime, compiler, and TypeScript tooling so shared public host properties compose without leaking internal `accessors()`.

  Structural hooks can now declare public Lit property options through `props(host, state, next)` while keeping internal runtime capabilities in `accessors(host, state, next)`. LitSX now composes both channels as middleware, rejects cross-channel collisions, warns when same-channel structural props or accessors overwrite one another, and keeps FACE accessors out of the public component API.

  TypeScript tooling and editor completions now infer structural public props across local and imported hooks, so PascalCase component surfaces expose shared structural properties in authored LitSX without redeclaring them on every component.

## 0.15.0

### Minor Changes

- 1dfa4f1: Add structural hook `props` support so shared host properties can participate in component surface metadata alongside runtime `accessors`.

### Patch Changes

- 576eabd: Mark built-in boundary elements with LitSX component metadata so downstream compilers can verify `ErrorBoundary`, `SuspenseBoundary`, and `SuspenseList` imports from compiled `@litsx/core` packages without emitting external PascalCase inference warnings.
- bae18f0: Resync FACE validity state from live `ElementInternals` data during render so hosts expose up-to-date `validity` and `validationMessage` values even after prior validation errors are cleared outside the hook entrypoints.
- 576eabd: Accept native form-specific listener bindings on intrinsic `<form>` elements. `@reset` and `@formdata` are now part of the known authored event set, and the corresponding JSX event props are typed with `currentTarget: HTMLFormElement`.

## 0.14.0

### Minor Changes

- 72a47e6: Remove parameter-name based structural hook ABI detection from the host middleware runtime. Structural hooks now use one fixed, minifier-safe contract: `setup(host, args, staticState, meta, entry)`, `use(host, state, args, meta, entry)`, and lifecycle middleware `(host, state, next, args, meta, entry)`.

  FACE structural hooks have been updated to read authored instance data through `state.instance`, and the structural hook docs/types/tests now reflect the single runtime contract.

### Patch Changes

- 8b39fd6: Fix native ref forwarding so authored `ref` props are not overwritten by the host fallback when a component explicitly forwards the ref to a native element or child component. Named local callback refs on native elements are now lowered through the DOM ref lifecycle path, enabling composed local/public refs.

  Align intrinsic label/output typing and diagnostics so LitSX-authored native elements can use the DOM-aligned `for` attribute while `htmlFor` remains compatibility syntax.

## 0.13.0

### Minor Changes

- 207a577: Add generic structural-hook `accessors` support for publishing host instance getters and setters through `defineHook()`.

  Structural hooks can now return host accessor descriptors from `accessors(host, state, meta, entry)`, and LitSX installs those properties directly on the component host with stable override and restoration behavior across multiple structural entries.

  The structural runtime and compiler now treat hooks with `accessors` as instance-phase hooks, so authored accessors compile through the host middleware path instead of the static-only structural path.

  FACE primitives in `@litsx/core` now use that low-level mechanism to expose `form`, `validity`, `validationMessage`, and `willValidate` on the host surface without adding higher-level form semantics.

## 0.12.0

### Minor Changes

- 3be001f: Refine `useExpose()` so it can publish imperative methods directly on the host instance or through an explicit ref channel.

  Host-targeted `useExpose()` calls now install methods on the component instance itself, while ref-targeted calls continue to support forwarded imperative handles. When multiple `useExpose()` calls publish the same method on the same target, the last publisher wins and earlier implementations are restored automatically if later publishers disappear.

  TypeScript-authored tooling now reports duplicate static `useExpose()` method declarations as warning `91023` instead of treating them as hard failures, which keeps composed imperative surfaces flexible while still surfacing likely mistakes.

  The React compatibility preset keeps lowering `useImperativeHandle()` onto the explicit ref-targeted `useExpose()` signature so forwarded refs continue to map to the intended imperative channel.

## 0.11.0

### Minor Changes

- 98f5d8f: Add low-level FACE primitives with `useFormValidity()` and `useElementInternals()`, while sharing `ElementInternals` state with `useFormValue()`. Also recognize the new `@litsx/core` structural hooks in the LitSX Babel preset.

## 0.10.0

### Minor Changes

- d02befd: Add `useFormValue()` as a form-associated structural hook in `@litsx/core`, including FACE lifecycle plumbing for `formAssociatedCallback`, `formDisabledCallback`, `formResetCallback`, and `formStateRestoreCallback`.

  Expose the new hook through the LitSX transforms so authored components can import it from `@litsx/core` and compile correctly through the preset and compiler facade.

  Also improve renderer-prop lowering for stored JSX expressions and avoid false external-component warnings when PascalCase LitSX components are re-exported through intermediary modules.

## 0.9.0

### Minor Changes

- 1e586fa: Publish compiled LitSX runtime metadata for hooks and components, preserve that
  metadata in built package outputs, and align the compiler/runtime pipeline so
  compiled entities can be recognized reliably across package boundaries.

## 0.8.3

### Patch Changes

- 4401039: Fix scoped registry runtime behavior across shadow mounts and publish the extracted scoped registry shim dependency used by `@litsx/core`.
- Updated dependencies [4401039]
  - @litsx/scoped-registry-shim@0.2.6

## 0.8.2

### Patch Changes

- 0dacd77: Fix shadow scoped-registry capability detection so LitSX only uses the native shadow registry path when the browser actually upgrades elements created under that registry.

## 0.8.1

### Patch Changes

- a53199b: Upgrade existing host children when reconnecting contextual light DOM registries so reused hosts recover scoped custom elements after rerenders.

  Define scoped elements again when reusing existing shadow roots so shadow DOM hosts preserve their scoped registries across hydration and host reuse paths.

- Updated dependencies [a53199b]
  - @litsx/light-dom-registry@0.2.5

## 0.8.0

### Minor Changes

- 47c474e: Route soft suspense through an internal capture scope so SuspenseBoundary can capture async work from projected descendant updates without relying on DOM boundary lookup.

  SuspenseBoundary and ErrorBoundary now use the authored `fallback` + children contract and the compiler lowers that shape to internal `.fallback`/`.content` renderers. The old boundary-specific `.fallbackRenderer`/`.contentRenderer` contract is removed.

## 0.7.1

### Patch Changes

- 7b7a4fa: Add framework-level soft suspense for render hooks without an enclosing SuspenseBoundary. Compiled render methods now wrap hook execution so thrown thenables suspend the host, render `nothing`, and request an update when resolved, while preserving explicit SuspenseBoundary handling.
- c8067aa: Capture thenables thrown while `SuspenseBoundary` syncs projected content in `updated()`, so projected custom-element subtrees suspend through the boundary instead of leaking pending promises to Lit.

## 0.7.0

### Minor Changes

- 1c9b206: Recognize `useId` imported from `@litsx/core` and `useContext` imported from `@litsx/core/context` as LitSX runtime hooks during shared custom-hook analysis so custom hooks that call them are compiled with the active host instead of being treated as unresolved imported hooks. The preset now classifies LitSX runtime hooks by known runtime import source plus the public `useX` naming convention instead of maintaining a duplicated hook allowlist.

  Rename compiler-facing structural runtime helpers from `useStructuralEntry(...)` and `useStructuralStaticEntry(...)` to `resolveStructuralEntry(...)` and `resolveStructuralStaticEntry(...)`. These helpers are emitted by the compiler/runtime bridge and are no longer named like authored user-space hooks.

## 0.6.3

### Patch Changes

- 346420e: Allow authored `@event` handlers to use `CustomEvent` payload types across DOM-named events, custom events with hyphenated names, and custom events with simple names, while preserving useful native DOM event typing for inline handlers.

## 0.6.2

### Patch Changes

- 5f520f3: Improve virtualized `@event` handler typing so known DOM events keep useful event types and custom authored events can use `CustomEvent` handlers instead of being forced to generic `Event`.

## 0.6.1

### Patch Changes

- 40171ca: Allow TypeScript tooling's internal virtualized LitSX bindings to typecheck on PascalCase component JSX while keeping arbitrary component props strict.

## 0.6.0

### Minor Changes

- 69264c9: Add host middleware runtime plumbing and structural hook compiler wiring. `defineHook({ static, setup, middlewares, use })` is the public mixed structural-hook authoring API and returns a callable hook value enriched with compiler/runtime metadata. The compiler now separates class/type structural work from instance work: static-only hooks lower to `useStructuralStaticEntry(...)` and generated `structuralStaticEntries` without `HostMiddlewareMixin(...)`, while mixed/instance hooks lower to `useStructuralEntry(...)`, generated hosts are wrapped with `HostMiddlewareMixin(...)`, and direct structural hook callsites emit static `structuralEntries` so lifecycle middleware exists before first render. Local and imported custom hooks can carry compiled structural metadata, structural hook readers can expand nested structural usage, and structural hooks that call other structural hooks from `use(...)` now expose metadata for imported consumers. The preset can discover named or namespace structural hook imports from authored modules using relative, path-alias, or TypeScript module resolution, including imported static-only hooks. Structural entries remain one-to-one with authored callsites; resource dedupe belongs in hook-specific runtimes. Unsupported dynamic structural-hook patterns such as aliases, object/array containers, runtime selection, and computed namespace access now fail during transform with actionable code-frame diagnostics.

  The native preset also now creates an early static IR for inferred properties, authored `static properties`, element candidates, imported element candidates, and light-DOM intent so future static-hoist migrations can consume compiler metadata before late class-member emission. Element candidate analysis, scoped-elements, React lazy, and static-hoist processing now use that IR instead of parallel private annotations.

## 0.5.2

### Patch Changes

- d7cb8a1: Add `useStableId()` as a public callsite-stable identity primitive, with LitSX transform support that injects deterministic authored callsite metadata for SSR/client consistency.

## 0.5.1

### Patch Changes

- 029c198: Allow arbitrary JSX attributes on kebab-case custom elements while keeping native HTML tags strict.

## 0.5.0

### Minor Changes

- 677553b: Normalize DOM runtime mixins around root mode: `ShadowDomMixin` and `LightDomMixin` are now the canonical mixins, and `LightDomMixin` also handles scoped light-DOM elements when `static elements` is present.

### Patch Changes

- 24fef97: Fix LitSX editor false positives for authored components with JSX children, static light DOM hoists, default JSX options, and destructured component props.

## 0.4.0

### Minor Changes

- 191fc0d: Introduce canonical package names for the LitSX runtime, TypeScript integration, and authored JSX tooling.

  `@litsx/core`, `@litsx/typescript`, and `@litsx/authoring` are now the recommended packages. The previous `@litsx/litsx`, `@litsx/typescript-plugin`, and `@litsx/jsx-authoring` packages remain available as compatibility wrappers.

  Generated scaffolds, compiler output, presets, and tooling defaults now target the canonical package names while preserving compatibility with projects that still use the previous names. The canonical element/scoped-registry helpers now live at `@litsx/core/elements`; `@litsx/litsx/runtime-infrastructure` remains available as the legacy compatibility subpath. Rendering helpers now live at `@litsx/core/rendering`, and TypeScript source virtualization helpers now live at `@litsx/typescript/virtualization`.

## 0.3.5

### Patch Changes

- 63a9d36: Fix scoped custom element registry races across shadow DOM, light DOM, global registrations, authored static element maps, projected renderer output, and Storybook Vite optimize-deps configuration.
- Updated dependencies [63a9d36]
  - @litsx/light-dom-registry@0.2.4

## 0.3.4

### Patch Changes

- 0bb6457: Reset suspense boundary state cleanly across disconnects and stop sharing scoped shadow registries between host instances. Update the design-system scaffold so Storybook stories and StarterGuide use the revised runtime behavior.

## 0.3.3

### Patch Changes

- bca974f: Allow globally registered shadow-DOM LitSX components to stay newable after the light DOM registry runtime patches `HTMLElement`, including components defined before the light-DOM runtime activates.
- Updated dependencies [bca974f]
  - @litsx/light-dom-registry@0.2.3

## 0.3.2

### Patch Changes

- b3e35a4: Preserve globally registered shadow-DOM component constructors after the light DOM registry runtime patches `HTMLElement`, so subsequent instances remain newable and Storybook-style hosts do not fail after light-DOM features are activated.
- Updated dependencies [b3e35a4]
  - @litsx/light-dom-registry@0.2.2

## 0.3.1

### Patch Changes

- 7f5d36d: Fix built-in boundary JSX typings so `ErrorBoundary`, `SuspenseBoundary`, and `SuspenseList` accept base host attributes such as `class`, `style`, `slot`, and `ref`.

## 0.3.0

### Minor Changes

- 97df32d: Improve authored renderer handling across the compiler and runtime, and refresh the generated starter templates.

  Compiler and preset updates now keep renderer-context analysis in the semantic pass, add a final JSX-to-`html` lowering pass, support renderer call-site rewrites so projected renderer content keeps the right authored context, and validate `PascalCase` JSX against real scope bindings instead of relying on the older top-level-name heuristic.

  Runtime updates align `ErrorBoundary` with `SuspenseBoundary` and keep the shared renderer-context helpers used by compiler output on the main runtime path.

  The scaffold generated by `create-litsx-app` now ships the current hero, starter guide, button primitives, updated stories/docs, and the matching starter asset set.

## 0.2.4

### Patch Changes

- fcc829d: Fix lazy scoped element registration inside `SuspenseBoundary` content renderers
  when the boundary inherits its scoped custom element registry from the enclosing
  shadow root.

  Refresh the generated `create-litsx-app` demo styling to better match the LitSX
  brand direction with stronger typography, warmer surfaces, and more intentional
  starter layouts.

## 0.2.3

### Patch Changes

- Restore scoped element registration for shadow-root components when scoped
  custom element registries are provided by the platform or by the
  `@webcomponents/scoped-custom-element-registry` polyfill.

## 0.2.2

### Patch Changes

- 2eedea3: Load the scoped custom element registry polyfill before booting generated apps so
  scaffolded components using authored child imports render correctly in Vite.

  Remove the runtime dependency on `@open-wc/scoped-elements` and resolve scoped
  element registries directly through native or polyfilled `CustomElementRegistry`
  support.

## 0.2.1

### Patch Changes

- b7266d8: Publish internal public dependencies with semver ranges instead of `workspace:` and keep generated scaffold package versions aligned for npm installs.

## 0.2.0

### Minor Changes

- cef2428: Publish the scoped runtime as `@litsx/litsx` and realign the public package surface on `0.2.0`.

### Patch Changes

- Updated dependencies [cef2428]
  - @litsx/light-dom-registry@0.2.0

## 0.1.0

### Minor Changes

- 5321478: Publish the initial public npm release as version 0.1.0 through the automated Changesets pipeline.

### Patch Changes

- Updated dependencies [5321478]
  - @litsx/light-dom-registry@0.1.0
