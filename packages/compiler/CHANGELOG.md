# @litsx/compiler

## 1.0.0-next.10

### Patch Changes

- 1c49b60: Infer authored JSX parsing from the filename after removing Vite query strings.
  Plain `.ts`, `.mts`, and `.cts` modules now use TypeScript-only parsing, while
  JSX extensions retain JSX parsing and the public `requireJsx` override remains
  available. Apply the same policy to both compiler passes and static utility
  import resolution so Vite, optimize-deps, UnoCSS extraction, and light-DOM SSR
  accept generic TypeScript arrows without losing imported utility classes.

## 1.0.0-next.9

### Patch Changes

- c16b18d: Infer nested LitSX light-DOM hydration boundaries in both server and browser
  templates, including pure Lit parents authored in project-local JavaScript or
  TypeScript modules. Hydration now adopts the server-rendered child part so
  subsequent child updates preserve node identity, while disconnecting and
  reconnecting the child leaves connection ownership with the parent render.

  Keep statically enumerable Tailwind candidates in real Vite builds and attach
  scoped light-DOM utilities to their owning host without leaking them into the
  document or sibling components.

  Treat pure Lit class bodies as opaque in both utility integrations. Their
  templates and static styles remain owned by Lit; only LitSX component classes
  and genuinely free document JSX participate in utility extraction.

- Updated dependencies [c16b18d]
  - @litsx/babel-preset-react-compat@1.0.0-next.4

## 1.0.0-next.8

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
  - @litsx/babel-preset-litsx@1.0.0-next.6

## 1.0.0-next.7

### Patch Changes

- f720ee5: Keep normalized opening and closing custom-element tags aligned, and preserve global UnoCSS and Tailwind utilities from free light-DOM templates in modules that also declare LitSX components without leaking component-only utilities.
- Updated dependencies [f720ee5]
  - @litsx/babel-plugin-transform-jsx-html-template@1.0.0-next.5

## 1.0.0-next.6

### Patch Changes

- c9d0c29: Keep structural-hook import resolution independent from declaration-oriented compiler caches so custom hooks wrapping built-in structural hooks compile reliably in Vite and SSR sessions.
- Updated dependencies [c9d0c29]
  - @litsx/babel-preset-litsx@1.0.0-next.5

## 1.0.0-next.5

### Minor Changes

- f7ed4f7: Expose build-tool-neutral utility-class analysis from the compiler, refactor
  UnoCSS to consume it, and add the official Tailwind CSS v4 Vite integration.

  Tailwind utilities are extracted per component from literal and finite class
  bindings, explicit local style guards, and only matching safelist candidates.
  Shadow components receive isolated CSSResults; light DOM supports global and
  native `@scope` output; shared preflight, theme, and inert property
  infrastructure cover HMR, lazy imports, SSR, hydration, and property-backed
  utilities without leaking component selectors globally.

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
  - @litsx/babel-plugin-transform-jsx-html-template@1.0.0-next.4
  - @litsx/babel-preset-litsx@1.0.0-next.4
  - @litsx/babel-preset-react-compat@1.0.0-next.3

## 1.0.0-next.3

### Minor Changes

- a816706: Support object-valued native JSX `style` bindings through Lit's official
  `styleMap` directive. Dynamic bindings can switch between CSS text, style maps,
  `null`, and `undefined`; spread styles now preserve the same camelCase, dashed,
  custom-property, update, removal, SSR, and hydration semantics.

### Patch Changes

- Updated dependencies [4106a37]
- Updated dependencies [66003e8]
- Updated dependencies [a816706]
- Updated dependencies [dbda7c3]
  - @litsx/babel-preset-litsx@1.0.0-next.3
  - @litsx/babel-preset-react-compat@1.0.0-next.2
  - @litsx/babel-plugin-transform-jsx-html-template@1.0.0-next.3
  - @litsx/authoring@1.0.0-next.2

## 1.0.0-next.2

### Minor Changes

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

- 4321108: Compose function-authored component styles with structural-mixin styles by
  default, add `replaceStyles()` for explicit isolation, preserve inherited
  scoped-element maps, and rely on Lit's native property inheritance. Generated
  classes now use direct static fields instead of the removed static-hoist runtime
  getter and symbol machinery. UnoCSS keeps its preflight and generated utilities
  in the resulting style chain, including components that replace inherited
  styles.
- 4b34759: Move the compiler and lint integrations to Babel 8, ESLint 10, and Node 24 while retaining ESLint 9 compatibility. Refresh generated Storybook and Playwright versions, consume patched transitive dependencies, and support Chromium's native scoped-registry creation scope across shadow and projected light DOM.
- Updated dependencies [4321108]
- Updated dependencies [4321108]
- Updated dependencies [4b34759]
  - @litsx/babel-preset-litsx@1.0.0-next.2
  - @litsx/babel-preset-react-compat@1.0.0-next.1
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
  - @litsx/babel-preset-litsx@1.0.0-next.1
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

### Patch Changes

- c02e682: Parse TypeScript syntax in `.ts` authored modules, including type-only and
  mixed type imports when compiling direct source dependencies.
- 2678438: Keep prop-backed function calls inside JSX attribute and Lit property bindings
  as ordinary JavaScript values. Renderer-call directives are now emitted only
  for child expressions, allowing nested LitSX custom elements to receive arrays,
  objects, callbacks, and computed property values during SSR and hydration
  without aborting reconciliation or duplicating declarative shadow DOM children.
- 57a20ff: Complete the public SSR surface with streaming metadata, hydration payload support, browser hydration coverage, and release integration for the SSR packages.
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

- 9fe2f77: Preserve precise source mappings from generated LitSX render templates back to authored component returns, JSX nodes, attributes, and children projection.
- c2f7eb8: Prevent generated sourcemap anchors from matching ordinary strings, and preserve source locations for authored static styles.
- 0a1ed42: Resolve stable `Component.elements` entries in async server components and
  annotate resolvable custom-element constructors with SSR hydration metadata
  automatically.

  LitSX now accepts `Component.elements` entries that collapse to a single stable
  constructor through direct imports, `const` aliases, and static object-member
  lookups. Resolvable entries are decorated with `tagName` and `moduleId`
  metadata during SSR compilation, while ambiguous or dynamic entries now fail
  with a clear compile-time error unless the consumer supplies explicit metadata
  or handles them through an adapter.

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

- 5eb7392: Fix compiler sourcemaps so authored `.tsx` files remain the canonical source
  in emitted maps. `transformLitsx(...)` now normalizes the final sourcemap to
  keep the original source filename in `sources` and the original authored source
  text in `sourcesContent`, including through multi-pass compilation and
  downstream sourcemap chaining.
- Updated dependencies [2678438]
- Updated dependencies [ad185f4]
- Updated dependencies [57a20ff]
- Updated dependencies [46e4cce]
- Updated dependencies [53939a2]
- Updated dependencies [92e1dbe]
- Updated dependencies [719cf1e]
- Updated dependencies [60b2e98]
- Updated dependencies [354dac9]
- Updated dependencies [9fe2f77]
- Updated dependencies [4aff11b]
- Updated dependencies [c2f7eb8]
- Updated dependencies [1aa0135]
- Updated dependencies [83d757e]
- Updated dependencies [0a1ed42]
- Updated dependencies [accc7aa]
- Updated dependencies [c9ae368]
- Updated dependencies [43aa10a]
  - @litsx/babel-preset-litsx@1.0.0-next.0
  - @litsx/babel-plugin-transform-jsx-html-template@1.0.0-next.0
  - @litsx/babel-preset-react-compat@1.0.0-next.0
  - @litsx/typescript-session@1.0.0-next.0
  - @litsx/authoring@1.0.0-next.0

## 0.10.0

### Minor Changes

- 8057814: Publish the official compiler-backed Storybook integration for LitSX stories.

  Design-system projects generated by `create-litsx-app` now consume
  `@litsx/storybook` for story indexing and structural custom-element registration.

## 0.9.4

### Patch Changes

- Updated dependencies [3e5ba90]
  - @litsx/typescript@0.9.0
  - @litsx/babel-preset-litsx@0.15.0

## 0.9.3

### Patch Changes

- Updated dependencies [576eabd]
- Updated dependencies [1dfa4f1]
  - @litsx/typescript@0.8.3
  - @litsx/babel-preset-litsx@0.14.0

## 0.9.2

### Patch Changes

- 8b39fd6: Fix native ref forwarding so authored `ref` props are not overwritten by the host fallback when a component explicitly forwards the ref to a native element or child component. Named local callback refs on native elements are now lowered through the DOM ref lifecycle path, enabling composed local/public refs.

  Align intrinsic label/output typing and diagnostics so LitSX-authored native elements can use the DOM-aligned `for` attribute while `htmlFor` remains compatibility syntax.

- Updated dependencies [8b39fd6]
  - @litsx/typescript@0.8.2
  - @litsx/babel-preset-litsx@0.13.3

## 0.9.1

### Patch Changes

- d02befd: Add `useFormValue()` as a form-associated structural hook in `@litsx/core`, including FACE lifecycle plumbing for `formAssociatedCallback`, `formDisabledCallback`, `formResetCallback`, and `formStateRestoreCallback`.

  Expose the new hook through the LitSX transforms so authored components can import it from `@litsx/core` and compile correctly through the preset and compiler facade.

  Also improve renderer-prop lowering for stored JSX expressions and avoid false external-component warnings when PascalCase LitSX components are re-exported through intermediary modules.

- Updated dependencies [d02befd]
  - @litsx/babel-preset-litsx@0.13.0

## 0.9.0

### Minor Changes

- 1e586fa: Publish compiled LitSX runtime metadata for hooks and components, preserve that
  metadata in built package outputs, and align the compiler/runtime pipeline so
  compiled entities can be recognized reliably across package boundaries.

### Patch Changes

- Updated dependencies [1e586fa]
  - @litsx/babel-preset-litsx@0.12.0

## 0.8.5

### Patch Changes

- Updated dependencies [c36e6f5]
- Updated dependencies [47c474e]
  - @litsx/babel-preset-litsx@0.11.0
  - @litsx/typescript@0.8.0

## 0.8.4

### Patch Changes

- 1c9b206: Recognize `useId` imported from `@litsx/core` and `useContext` imported from `@litsx/core/context` as LitSX runtime hooks during shared custom-hook analysis so custom hooks that call them are compiled with the active host instead of being treated as unresolved imported hooks. The preset now classifies LitSX runtime hooks by known runtime import source plus the public `useX` naming convention instead of maintaining a duplicated hook allowlist.

  Rename compiler-facing structural runtime helpers from `useStructuralEntry(...)` and `useStructuralStaticEntry(...)` to `resolveStructuralEntry(...)` and `resolveStructuralStaticEntry(...)`. These helpers are emitted by the compiler/runtime bridge and are no longer named like authored user-space hooks.

- Updated dependencies [1c9b206]
  - @litsx/babel-preset-litsx@0.10.0

## 0.8.3

### Patch Changes

- 0427477: Keep imported custom-hook module analysis in its own compiler-session cache so shared-hook analysis cannot poison element-candidate analysis for imported renderer helpers.
- Updated dependencies [0427477]
  - @litsx/babel-preset-litsx@0.9.2

## 0.8.2

### Patch Changes

- ac837c5: Detect imported custom hooks that call LitSX runtime hooks and inject the active host at their callsites so the compiled hook signature and consumer calls stay aligned.
- Updated dependencies [ac837c5]
  - @litsx/babel-preset-litsx@0.9.1

## 0.8.1

### Patch Changes

- Updated dependencies [69264c9]
  - @litsx/babel-preset-litsx@0.9.0

## 0.8.0

### Minor Changes

- 29582a0: Add implicit `children` projection for LitSX components as a default-slot transform, and report unsupported `children` usages consistently across the compiler and TypeScript tooling. Also extract the shared authored-semantics helpers behind those checks into `@litsx/authoring`.

### Patch Changes

- Updated dependencies [29582a0]
  - @litsx/authoring@0.5.0
  - @litsx/babel-preset-litsx@0.8.0
  - @litsx/typescript@0.7.0
  - @litsx/babel-plugin-transform-jsx-html-template@0.3.5

## 0.7.1

### Patch Changes

- c432761: Declare direct runtime dependencies explicitly so strict package managers such as Yarn Plug'n'Play can resolve the published LitSX toolchain without undeclared dependency errors.
- c432761: Declare `source-map-js` explicitly so Yarn Plug'n'Play and other strict resolvers can load the published compiler pipeline without undeclared dependency errors.
- Updated dependencies [c432761]
- Updated dependencies [c432761]
  - @litsx/babel-plugin-transform-jsx-html-template@0.3.4
  - @litsx/babel-preset-litsx@0.7.1
  - @litsx/typescript@0.6.4

## 0.7.0

### Minor Changes

- 677553b: Normalize DOM runtime mixins around root mode: `ShadowDomMixin` and `LightDomMixin` are now the canonical mixins, and `LightDomMixin` also handles scoped light-DOM elements when `static elements` is present.

### Patch Changes

- Updated dependencies [677553b]
  - @litsx/babel-preset-litsx@0.7.0

## 0.6.0

### Minor Changes

- 191fc0d: Introduce canonical package names for the LitSX runtime, TypeScript integration, and authored JSX tooling.

  `@litsx/core`, `@litsx/typescript`, and `@litsx/authoring` are now the recommended packages. The previous `@litsx/litsx`, `@litsx/typescript-plugin`, and `@litsx/jsx-authoring` packages remain available as compatibility wrappers.

  Generated scaffolds, compiler output, presets, and tooling defaults now target the canonical package names while preserving compatibility with projects that still use the previous names. The canonical element/scoped-registry helpers now live at `@litsx/core/elements`; `@litsx/litsx/runtime-infrastructure` remains available as the legacy compatibility subpath. Rendering helpers now live at `@litsx/core/rendering`, and TypeScript source virtualization helpers now live at `@litsx/typescript/virtualization`.

### Patch Changes

- Updated dependencies [191fc0d]
  - @litsx/authoring@0.4.0
  - @litsx/babel-preset-litsx@0.6.0
  - @litsx/babel-plugin-transform-jsx-html-template@0.3.2

## 0.5.1

### Patch Changes

- 8c4a4b6: Strip TypeScript-only syntax from final compiler output after consumer output plugins run, including interfaces, type aliases, assertions, and generics in `.litsx` compilation.

  Improve authored attribute completions to rank camel-case word segment matches more naturally.

## 0.5.0

### Minor Changes

- 4a81cd6: Add `static ... = ...` as the primary static hoist syntax across LitSX authoring, formatting, tooling, and scaffolding.

  Legacy `^...` hoists still work in this release, but they now emit deprecation warnings so projects can migrate before removal.

### Patch Changes

- Updated dependencies [4a81cd6]
  - @litsx/jsx-authoring@0.3.0
  - @litsx/babel-preset-litsx@0.5.0

## 0.4.0

### Minor Changes

- 791414f: Added support for renderer helpers imported across files, package specifiers, and project aliases such as `@/...`, so imported renderers can participate correctly in native lowering and static elements analysis.

  Improved compiler performance for repeated project builds by caching imported renderer module analysis per compilation session, which significantly reduces warm compile times for multi-file and alias-heavy projects.

  Improved `@litsx/typescript-plugin` project typecheck performance by caching stable diagnostics across repeated runs when project files have not changed, reducing repeated `litsx-tsc` costs while preserving invalidation when source versions move.

### Patch Changes

- Updated dependencies [791414f]
  - @litsx/babel-preset-litsx@0.4.0

## 0.3.0

### Minor Changes

- 97df32d: Improve authored renderer handling across the compiler and runtime, and refresh the generated starter templates.

  Compiler and preset updates now keep renderer-context analysis in the semantic pass, add a final JSX-to-`html` lowering pass, support renderer call-site rewrites so projected renderer content keeps the right authored context, and validate `PascalCase` JSX against real scope bindings instead of relying on the older top-level-name heuristic.

  Runtime updates align `ErrorBoundary` with `SuspenseBoundary` and keep the shared renderer-context helpers used by compiler output on the main runtime path.

  The scaffold generated by `create-litsx-app` now ships the current hero, starter guide, button primitives, updated stories/docs, and the matching starter asset set.

### Patch Changes

- Updated dependencies [97df32d]
  - @litsx/babel-plugin-transform-jsx-html-template@0.3.0
  - @litsx/babel-preset-litsx@0.3.0

## 0.2.1

### Patch Changes

- b7266d8: Publish internal public dependencies with semver ranges instead of `workspace:` and keep generated scaffold package versions aligned for npm installs.
- Updated dependencies [b7266d8]
  - @litsx/babel-preset-litsx@0.2.1
  - @litsx/babel-plugin-transform-jsx-html-template@0.2.1
  - @litsx/jsx-authoring@0.2.1
  - @litsx/typescript-session@0.2.1

## 0.2.0

### Minor Changes

- cef2428: Publish the scoped runtime as `@litsx/litsx` and realign the public package surface on `0.2.0`.

### Patch Changes

- Updated dependencies [cef2428]
  - @litsx/jsx-authoring@0.2.0
  - @litsx/babel-preset-litsx@0.2.0
  - @litsx/babel-plugin-transform-jsx-html-template@0.2.0
  - @litsx/typescript-session@0.2.0

## 0.1.0

### Minor Changes

- 5321478: Publish the initial public npm release as version 0.1.0 through the automated Changesets pipeline.

### Patch Changes

- Updated dependencies [5321478]
  - @litsx/jsx-authoring@0.1.0
  - @litsx/babel-preset-litsx@0.1.0
  - @litsx/babel-plugin-transform-jsx-html-template@0.1.0
  - @litsx/typescript-session@0.1.0
