# @litsx/babel-preset-litsx

## 1.0.0-next.7

### Patch Changes

- ee1f0b9: Preserve bare side-effect imports so ordinary Vite CSS and `virtual:uno.css`
  remain linked in dev, Storybook, and production builds. Compile expression-bodied
  local PascalCase story hosts as Lit elements, and keep optimize-deps compilation
  away from dependencies, generated chunks, assets, virtual ids, and prebundled
  cache output.

## 1.0.0-next.6

### Patch Changes

- d44536e: Add native inline SVG to the public LitSX JSX contract. Type SVG elements and
  attributes without a permissive global index, serialize JSX-friendly SVG
  attribute aliases, preserve SVG namespaces for dynamic fragments and spreads,
  and return descendants of `foreignObject` to HTML across client rendering, SSR,
  and hydration. React compatibility also lowers React's full SVG camelCase alias
  set, namespaced XLink/XML attributes, `className`, events, and spread props onto
  the same SVG-safe runtime contract.
- Updated dependencies [d44536e]
  - @litsx/authoring@1.0.0-next.4
  - @litsx/babel-plugin-transform-jsx-html-template@1.0.0-next.6

## 1.0.0-next.5

### Patch Changes

- c9d0c29: Keep structural-hook import resolution independent from declaration-oriented compiler caches so custom hooks wrapping built-in structural hooks compile reliably in Vite and SSR sessions.

## 1.0.0-next.4

### Minor Changes

- 7cd6053: Centralize component-tag derivation and hook authoring diagnostics in
  `@litsx/authoring`. Component identifiers must now map directly to a valid
  custom-element name: LitSX no longer invents framework prefixes for short names
  such as `Switch` or `App`, while namespace members retain mappings such as
  `Controls.Switch` to `controls-switch`.

  Use the shared hook analyzer from the compiler, direct Babel transforms and new
  recommended ESLint rules. Report hooks in unstable control flow, async render
  scopes, handlers, deferred `useAsyncState` actions and nested hook definitions
  with stable diagnostic codes. Keep React-specific primitives, including Radix's
  polymorphic `Slot`, inside the optional react-compat adapter.

### Patch Changes

- Updated dependencies [7cd6053]
  - @litsx/authoring@1.0.0-next.3
  - @litsx/babel-plugin-shared-hooks@1.0.0-next.3
  - @litsx/babel-plugin-transform-jsx-html-template@1.0.0-next.4
  - @litsx/babel-plugin-transform-litsx-scoped-elements@1.0.0-next.2

## 1.0.0-next.3

### Minor Changes

- a816706: Support object-valued native JSX `style` bindings through Lit's official
  `styleMap` directive. Dynamic bindings can switch between CSS text, style maps,
  `null`, and `undefined`; spread styles now preserve the same camelCase, dashed,
  custom-property, update, removal, SSR, and hydration semantics.

### Patch Changes

- 4106a37: Compile `SuspenseList.revealOrder` as a property for native and React-compatible JSX, including string literals, aliases, and namespace imports. Replay properties assigned before a scoped custom element upgrade through the real class accessors so React Context providers initialize and propagate updates in light DOM.
- 66003e8: Keep React lazy loaders out of generated static elements maps. Lazy custom
  elements are now registered only through ensureLazyElement after their loader
  resolves, while the host retains the scoped registry required for registration.
  Dynamic import module namespaces are unwrapped through their default export
  before the constructor is defined. Native LitSX now exposes `lazy()` from core
  and lowers it through the same shared transform as React compatibility.
- dbda7c3: Preserve standard HTML, ARIA, and data attributes on local and imported LitSX
  component hosts. Runtime spreads now keep those attributes out of native
  component rest-props bags, retain JSX source precedence, and use the same
  attribute classification in browser and SSR output. Expand the native JSX type
  surface for standard custom-element host attributes.
- Updated dependencies [a816706]
- Updated dependencies [f097f04]
- Updated dependencies [dbda7c3]
  - @litsx/babel-plugin-transform-jsx-html-template@1.0.0-next.3
  - @litsx/babel-plugin-shared-hooks@1.0.0-next.2
  - @litsx/authoring@1.0.0-next.2

## 1.0.0-next.2

### Minor Changes

- 4321108: Compose function-authored component styles with structural-mixin styles by
  default, add `replaceStyles()` for explicit isolation, preserve inherited
  scoped-element maps, and rely on Lit's native property inheritance. Generated
  classes now use direct static fields instead of the removed static-hoist runtime
  getter and symbol machinery. UnoCSS keeps its preflight and generated utilities
  in the resulting style chain, including components that replace inherited
  styles.
- 4321108: Replace compiler-injected host arguments with a bounded synchronous hook render
  context. Authored and transformed custom hooks now preserve their declared
  signatures, `useHost()` is the only authored host-access API, and structural
  hook readers use `use(...args)`. Move cursor preparation and structural
  application helpers to `@litsx/core/internal`, and ensure generated component
  refs, client rendering, SSR, suspense retries, and React compatibility all enter
  the same `renderWithHooks()` boundary.

  Structural hooks may now omit `use()` when they only install a mixin. These
  installation-only hooks return `void`; value-producing capability surfaces
  remain explicit readers.

### Patch Changes

- 4b34759: Move the compiler and lint integrations to Babel 8, ESLint 10, and Node 24 while retaining ESLint 9 compatibility. Refresh generated Storybook and Playwright versions, consume patched transitive dependencies, and support Chromium's native scoped-registry creation scope across shadow and projected light DOM.
- Updated dependencies [4321108]
- Updated dependencies [4321108]
- Updated dependencies [4b34759]
  - @litsx/babel-plugin-transform-litsx-scoped-elements@1.0.0-next.1
  - @litsx/babel-plugin-shared-hooks@1.0.0-next.1
  - @litsx/babel-plugin-transform-jsx-html-template@1.0.0-next.2

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
  - @litsx/babel-plugin-transform-jsx-html-template@1.0.0-next.1
  - @litsx/authoring@1.0.0-next.1

## 1.0.0-next.0

### Major Changes

- 83d757e: Stabilize the complete public LitSX package graph as the 1.0 release line.

  This release establishes standard JSX and TSX authoring, SSR and hydration,
  React compatibility, scoped custom-element registration, structural hooks,
  Storybook and Vite integration, and Shadow DOM and Light DOM UnoCSS support as
  the stable public contract.

### Minor Changes

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
- 0a1ed42: Resolve stable `Component.elements` entries in async server components and
  annotate resolvable custom-element constructors with SSR hydration metadata
  automatically.

  LitSX now accepts `Component.elements` entries that collapse to a single stable
  constructor through direct imports, `const` aliases, and static object-member
  lookups. Resolvable entries are decorated with `tagName` and `moduleId`
  metadata during SSR compilation, while ambiguous or dynamic entries now fail
  with a clear compile-time error unless the consumer supplies explicit metadata
  or handles them through an adapter.

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

### Patch Changes

- 2678438: Keep prop-backed function calls inside JSX attribute and Lit property bindings
  as ordinary JavaScript values. Renderer-call directives are now emitted only
  for child expressions, allowing nested LitSX custom elements to receive arrays,
  objects, callbacks, and computed property values during SSR and hydration
  without aborting reconciliation or duplicating declarative shadow DOM children.
- 57a20ff: Complete the public SSR surface with streaming metadata, hydration payload support, browser hydration coverage, and release integration for the SSR packages.
- 46e4cce: Support forwarding standard client refs through async Server Component composition during SSR hydration.
- c2f7eb8: Prevent generated sourcemap anchors from matching ordinary strings, and preserve source locations for authored static styles.
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

- Updated dependencies [ad185f4]
- Updated dependencies [53939a2]
- Updated dependencies [92e1dbe]
- Updated dependencies [60b2e98]
- Updated dependencies [354dac9]
- Updated dependencies [9fe2f77]
- Updated dependencies [c2f7eb8]
- Updated dependencies [31ae393]
- Updated dependencies [0ae3bc9]
- Updated dependencies [83d757e]
- Updated dependencies [accc7aa]
- Updated dependencies [c9ae368]
- Updated dependencies [43aa10a]
  - @litsx/babel-plugin-transform-jsx-html-template@1.0.0-next.0
  - @litsx/babel-plugin-transform-litsx-scoped-elements@1.0.0-next.0
  - @litsx/babel-plugin-shared-hooks@1.0.0-next.0
  - @litsx/typescript-session@1.0.0-next.0
  - @litsx/authoring@1.0.0-next.0

## 0.15.0

### Minor Changes

- 3e5ba90: Add structural `props()` middleware support across runtime, compiler, and TypeScript tooling so shared public host properties compose without leaking internal `accessors()`.

  Structural hooks can now declare public Lit property options through `props(host, state, next)` while keeping internal runtime capabilities in `accessors(host, state, next)`. LitSX now composes both channels as middleware, rejects cross-channel collisions, warns when same-channel structural props or accessors overwrite one another, and keeps FACE accessors out of the public component API.

  TypeScript tooling and editor completions now infer structural public props across local and imported hooks, so PascalCase component surfaces expose shared structural properties in authored LitSX without redeclaring them on every component.

### Patch Changes

- Updated dependencies [3e5ba90]
  - @litsx/babel-plugin-shared-hooks@0.8.0
  - @litsx/babel-plugin-transform-litsx-scoped-elements@0.4.9

## 0.14.0

### Minor Changes

- 1dfa4f1: Add structural hook `props` support so shared host properties can participate in component surface metadata alongside runtime `accessors`.

### Patch Changes

- Updated dependencies [1dfa4f1]
  - @litsx/babel-plugin-shared-hooks@0.7.0
  - @litsx/babel-plugin-transform-litsx-scoped-elements@0.4.8

## 0.13.3

### Patch Changes

- 8b39fd6: Fix native ref forwarding so authored `ref` props are not overwritten by the host fallback when a component explicitly forwards the ref to a native element or child component. Named local callback refs on native elements are now lowered through the DOM ref lifecycle path, enabling composed local/public refs.

  Align intrinsic label/output typing and diagnostics so LitSX-authored native elements can use the DOM-aligned `for` attribute while `htmlFor` remains compatibility syntax.

- Updated dependencies [8b39fd6]
  - @litsx/babel-plugin-shared-hooks@0.6.3
  - @litsx/babel-plugin-transform-litsx-scoped-elements@0.4.7

## 0.13.2

### Patch Changes

- 207a577: Add generic structural-hook `accessors` support for publishing host instance getters and setters through `defineHook()`.

  Structural hooks can now return host accessor descriptors from `accessors(host, state, meta, entry)`, and LitSX installs those properties directly on the component host with stable override and restoration behavior across multiple structural entries.

  The structural runtime and compiler now treat hooks with `accessors` as instance-phase hooks, so authored accessors compile through the host middleware path instead of the static-only structural path.

  FACE primitives in `@litsx/core` now use that low-level mechanism to expose `form`, `validity`, `validationMessage`, and `willValidate` on the host surface without adding higher-level form semantics.

- Updated dependencies [207a577]
  - @litsx/babel-plugin-shared-hooks@0.6.2

## 0.13.1

### Patch Changes

- 98f5d8f: Add low-level FACE primitives with `useFormValidity()` and `useElementInternals()`, while sharing `ElementInternals` state with `useFormValue()`. Also recognize the new `@litsx/core` structural hooks in the LitSX Babel preset.

## 0.13.0

### Minor Changes

- d02befd: Add `useFormValue()` as a form-associated structural hook in `@litsx/core`, including FACE lifecycle plumbing for `formAssociatedCallback`, `formDisabledCallback`, `formResetCallback`, and `formStateRestoreCallback`.

  Expose the new hook through the LitSX transforms so authored components can import it from `@litsx/core` and compile correctly through the preset and compiler facade.

  Also improve renderer-prop lowering for stored JSX expressions and avoid false external-component warnings when PascalCase LitSX components are re-exported through intermediary modules.

### Patch Changes

- Updated dependencies [d02befd]
  - @litsx/babel-plugin-shared-hooks@0.6.1

## 0.12.0

### Minor Changes

- 1e586fa: Publish compiled LitSX runtime metadata for hooks and components, preserve that
  metadata in built package outputs, and align the compiler/runtime pipeline so
  compiled entities can be recognized reliably across package boundaries.

### Patch Changes

- Updated dependencies [1e586fa]
  - @litsx/babel-plugin-shared-hooks@0.6.0
  - @litsx/babel-plugin-transform-litsx-scoped-elements@0.4.6

## 0.11.0

### Minor Changes

- 47c474e: Route soft suspense through an internal capture scope so SuspenseBoundary can capture async work from projected descendant updates without relying on DOM boundary lookup.

  SuspenseBoundary and ErrorBoundary now use the authored `fallback` + children contract and the compiler lowers that shape to internal `.fallback`/`.content` renderers. The old boundary-specific `.fallbackRenderer`/`.contentRenderer` contract is removed.

### Patch Changes

- c36e6f5: Remove the deprecated `@litsx/babel-parser` adapter from internal tooling. LitSX Babel and Prettier integrations now use `@litsx/authoring/parser` directly with `@babel/parser`.

## 0.10.0

### Minor Changes

- 1c9b206: Recognize `useId` imported from `@litsx/core` and `useContext` imported from `@litsx/core/context` as LitSX runtime hooks during shared custom-hook analysis so custom hooks that call them are compiled with the active host instead of being treated as unresolved imported hooks. The preset now classifies LitSX runtime hooks by known runtime import source plus the public `useX` naming convention instead of maintaining a duplicated hook allowlist.

  Rename compiler-facing structural runtime helpers from `useStructuralEntry(...)` and `useStructuralStaticEntry(...)` to `resolveStructuralEntry(...)` and `resolveStructuralStaticEntry(...)`. These helpers are emitted by the compiler/runtime bridge and are no longer named like authored user-space hooks.

### Patch Changes

- Updated dependencies [1c9b206]
  - @litsx/babel-plugin-shared-hooks@0.5.0
  - @litsx/babel-plugin-transform-litsx-scoped-elements@0.4.5

## 0.9.2

### Patch Changes

- 0427477: Keep imported custom-hook module analysis in its own compiler-session cache so shared-hook analysis cannot poison element-candidate analysis for imported renderer helpers.

## 0.9.1

### Patch Changes

- ac837c5: Detect imported custom hooks that call LitSX runtime hooks and inject the active host at their callsites so the compiled hook signature and consumer calls stay aligned.
- Updated dependencies [ac837c5]
  - @litsx/babel-plugin-shared-hooks@0.4.1

## 0.9.0

### Minor Changes

- 69264c9: Add host middleware runtime plumbing and structural hook compiler wiring. `defineHook({ static, setup, middlewares, use })` is the public mixed structural-hook authoring API and returns a callable hook value enriched with compiler/runtime metadata. The compiler now separates class/type structural work from instance work: static-only hooks lower to `useStructuralStaticEntry(...)` and generated `structuralStaticEntries` without `HostMiddlewareMixin(...)`, while mixed/instance hooks lower to `useStructuralEntry(...)`, generated hosts are wrapped with `HostMiddlewareMixin(...)`, and direct structural hook callsites emit static `structuralEntries` so lifecycle middleware exists before first render. Local and imported custom hooks can carry compiled structural metadata, structural hook readers can expand nested structural usage, and structural hooks that call other structural hooks from `use(...)` now expose metadata for imported consumers. The preset can discover named or namespace structural hook imports from authored modules using relative, path-alias, or TypeScript module resolution, including imported static-only hooks. Structural entries remain one-to-one with authored callsites; resource dedupe belongs in hook-specific runtimes. Unsupported dynamic structural-hook patterns such as aliases, object/array containers, runtime selection, and computed namespace access now fail during transform with actionable code-frame diagnostics.

  The native preset also now creates an early static IR for inferred properties, authored `static properties`, element candidates, imported element candidates, and light-DOM intent so future static-hoist migrations can consume compiler metadata before late class-member emission. Element candidate analysis, scoped-elements, React lazy, and static-hoist processing now use that IR instead of parallel private annotations.

### Patch Changes

- Updated dependencies [69264c9]
  - @litsx/babel-plugin-shared-hooks@0.4.0
  - @litsx/babel-plugin-transform-litsx-scoped-elements@0.4.4

## 0.8.2

### Patch Changes

- 05bb013: Resolve scoped element candidates declared as top-level aliases of namespace imports.
- d7cb8a1: Add `useStableId()` as a public callsite-stable identity primitive, with LitSX transform support that injects deterministic authored callsite metadata for SSR/client consistency.
- d99b2f9: Improve authored Storybook DX by auto-registering imported LitSX components and local story hosts in generated scaffolds, allowing local PascalCase story hosts to be rendered directly with natural JSX props, and materializing bare `props` references as prop snapshots instead of reading a synthetic `this.props` field while preserving destructuring rewrites such as `const { title } = props`.
- Updated dependencies [73790b9]
- Updated dependencies [05bb013]
- Updated dependencies [d7cb8a1]
- Updated dependencies [d99b2f9]
  - @litsx/typescript-session@0.2.3
  - @litsx/babel-plugin-transform-litsx-scoped-elements@0.4.3
  - @litsx/babel-plugin-shared-hooks@0.3.1
  - @litsx/babel-plugin-transform-jsx-html-template@0.3.6

## 0.8.1

### Patch Changes

- 025ec7b: Support JSX fragments as the root return value of authored LitSX components.

## 0.8.0

### Minor Changes

- 29582a0: Add implicit `children` projection for LitSX components as a default-slot transform, and report unsupported `children` usages consistently across the compiler and TypeScript tooling. Also extract the shared authored-semantics helpers behind those checks into `@litsx/authoring`.

### Patch Changes

- Updated dependencies [29582a0]
  - @litsx/authoring@0.5.0
  - @litsx/babel-parser@0.2.5
  - @litsx/babel-plugin-transform-jsx-html-template@0.3.5

## 0.7.1

### Patch Changes

- c432761: Declare direct runtime dependencies explicitly so strict package managers such as Yarn Plug'n'Play can resolve the published LitSX toolchain without undeclared dependency errors.
- Updated dependencies [c432761]
- Updated dependencies [c432761]
  - @litsx/babel-plugin-transform-jsx-html-template@0.3.4
  - @litsx/babel-plugin-transform-litsx-scoped-elements@0.4.2

## 0.7.0

### Minor Changes

- 677553b: Normalize DOM runtime mixins around root mode: `ShadowDomMixin` and `LightDomMixin` are now the canonical mixins, and `LightDomMixin` also handles scoped light-DOM elements when `static elements` is present.

### Patch Changes

- Updated dependencies [677553b]
  - @litsx/babel-plugin-transform-litsx-scoped-elements@0.4.0

## 0.6.0

### Minor Changes

- 191fc0d: Introduce canonical package names for the LitSX runtime, TypeScript integration, and authored JSX tooling.

  `@litsx/core`, `@litsx/typescript`, and `@litsx/authoring` are now the recommended packages. The previous `@litsx/litsx`, `@litsx/typescript-plugin`, and `@litsx/jsx-authoring` packages remain available as compatibility wrappers.

  Generated scaffolds, compiler output, presets, and tooling defaults now target the canonical package names while preserving compatibility with projects that still use the previous names. The canonical element/scoped-registry helpers now live at `@litsx/core/elements`; `@litsx/litsx/runtime-infrastructure` remains available as the legacy compatibility subpath. Rendering helpers now live at `@litsx/core/rendering`, and TypeScript source virtualization helpers now live at `@litsx/typescript/virtualization`.

### Patch Changes

- Updated dependencies [191fc0d]
  - @litsx/babel-plugin-shared-hooks@0.3.0
  - @litsx/babel-plugin-transform-litsx-scoped-elements@0.3.0
  - @litsx/babel-parser@0.2.4
  - @litsx/babel-plugin-transform-jsx-html-template@0.3.2

## 0.5.1

### Patch Changes

- 63a9d36: Fix scoped custom element registry races across shadow DOM, light DOM, global registrations, authored static element maps, projected renderer output, and Storybook Vite optimize-deps configuration.
- Updated dependencies [63a9d36]
  - @litsx/babel-plugin-transform-litsx-scoped-elements@0.2.2

## 0.5.0

### Minor Changes

- 4a81cd6: Add `static ... = ...` as the primary static hoist syntax across LitSX authoring, formatting, tooling, and scaffolding.

  Legacy `^...` hoists still work in this release, but they now emit deprecation warnings so projects can migrate before removal.

### Patch Changes

- @litsx/babel-parser@0.2.2

## 0.4.0

### Minor Changes

- 791414f: Added support for renderer helpers imported across files, package specifiers, and project aliases such as `@/...`, so imported renderers can participate correctly in native lowering and static elements analysis.

  Improved compiler performance for repeated project builds by caching imported renderer module analysis per compilation session, which significantly reduces warm compile times for multi-file and alias-heavy projects.

  Improved `@litsx/typescript-plugin` project typecheck performance by caching stable diagnostics across repeated runs when project files have not changed, reducing repeated `litsx-tsc` costs while preserving invalidation when source versions move.

## 0.3.0

### Minor Changes

- 97df32d: Improve authored renderer handling across the compiler and runtime, and refresh the generated starter templates.

  Compiler and preset updates now keep renderer-context analysis in the semantic pass, add a final JSX-to-`html` lowering pass, support renderer call-site rewrites so projected renderer content keeps the right authored context, and validate `PascalCase` JSX against real scope bindings instead of relying on the older top-level-name heuristic.

  Runtime updates align `ErrorBoundary` with `SuspenseBoundary` and keep the shared renderer-context helpers used by compiler output on the main runtime path.

  The scaffold generated by `create-litsx-app` now ships the current hero, starter guide, button primitives, updated stories/docs, and the matching starter asset set.

### Patch Changes

- Updated dependencies [97df32d]
  - @litsx/babel-plugin-transform-jsx-html-template@0.3.0

## 0.2.1

### Patch Changes

- b7266d8: Publish internal public dependencies with semver ranges instead of `workspace:` and keep generated scaffold package versions aligned for npm installs.
- Updated dependencies [b7266d8]
  - @litsx/babel-plugin-shared-hooks@0.2.1
  - @litsx/babel-plugin-transform-jsx-html-template@0.2.1
  - @litsx/babel-plugin-transform-litsx-scoped-elements@0.2.1
  - @litsx/typescript-session@0.2.1

## 0.2.0

### Minor Changes

- cef2428: Publish the scoped runtime as `@litsx/litsx` and realign the public package surface on `0.2.0`.

### Patch Changes

- Updated dependencies [cef2428]
  - @litsx/babel-plugin-transform-jsx-html-template@0.2.0
  - @litsx/babel-plugin-transform-litsx-scoped-elements@0.2.0
  - @litsx/babel-plugin-shared-hooks@0.2.0
  - @litsx/typescript-session@0.2.0

## 0.1.0

### Minor Changes

- 5321478: Publish the initial public npm release as version 0.1.0 through the automated Changesets pipeline.

### Patch Changes

- Updated dependencies [5321478]
  - @litsx/babel-plugin-transform-jsx-html-template@0.1.0
  - @litsx/babel-plugin-transform-litsx-scoped-elements@0.1.0
  - @litsx/babel-plugin-shared-hooks@0.1.0
  - @litsx/typescript-session@0.1.0
