# @litsx/ssr

## 1.0.0-next.2

### Minor Changes

- 668dcc4: Install one shared SSR DOM identity before Lit evaluates, reexport `html` from the initialized SSR entry, and expose the synchronous `@litsx/ssr/install-dom-shim` bootstrap entry for frameworks that load application components before the main SSR runtime.

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
  - @litsx/compiler@1.0.0-next.1
  - @litsx/core@1.0.0-next.1

## 1.0.0-next.0

### Major Changes

- 83d757e: Stabilize the complete public LitSX package graph as the 1.0 release line.

  This release establishes standard JSX and TSX authoring, SSR and hydration,
  React compatibility, scoped custom-element registration, structural hooks,
  Storybook and Vite integration, and Shadow DOM and Light DOM UnoCSS support as
  the stable public contract.

### Minor Changes

- 57a20ff: Complete the public SSR surface with streaming metadata, hydration payload support, browser hydration coverage, and release integration for the SSR packages.
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

- 53028b8: Add `useSsrResourceSnapshot(...)` for library runtimes that need to capture a
  request-scoped global resource cache after SSR settles and restore it
  synchronously before hydration registration or client module loading.

### Patch Changes

- ad185f4: Render JSX spread attributes through an `ElementPart` in the browser while retaining regular Lit parts during SSR. Add digest reconciliation and hydration wrappers that preserve server DOM identity without patching Lit, infer third-party component properties from their constructors, and avoid redundant attribute writes during hydration.
- e4eda08: Simplify `@litsx/ssr/hydration` now that Lit hydration support is installed as
  part of the module entrypoint. The public hydration helpers no longer expose
  manual hydration-support installation hooks and rely on the entrypoint import
  order instead.
- 46e4cce: Support forwarding standard client refs through async Server Component composition during SSR hydration.
- 54a0ec0: Fix declarative-shadow-DOM hydration for nested scoped and light-DOM elements, and emit executable SSR bootstrap modules through the Vite dev asset pipeline.
- 8891745: Expose `prepareHydrationResources(...)` for framework runtimes that apply
  incremental SSR fragments before registering their hydratable modules.
- 7d9ee7d: Isolate scoped registries, hydration contexts, noscript state, and soft Suspense collectors across concurrent SSR renders. The scoped custom-element lookup bridge is now reentrant, so interleaved requests resolve their own constructors and hydration metadata without cross-request leakage.
- 4719308: Keep scoped LitSX children compatible with `@webcomponents/scoped-custom-element-registry` by replacing polyfilled registries with the LitSX scoped runtime, and surface SSR development logs and render failures in the browser.
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
- 0ae3bc9: Add framework-level soft suspense for render hooks without an enclosing SuspenseBoundary. Compiled render methods now wrap hook execution so thrown thenables suspend the host, render `nothing`, and request an update when resolved, while preserving explicit SuspenseBoundary handling.

  SSR now retries rootless soft suspensions before serializing or streaming output, recreating the SSR context for the successful pass so hydration roots and payloads are not duplicated.

- ec5aa6b: Make `@litsx/ssr/hydration` install Lit's SSR hydration support as its first
  top-level import so framework consumers can rely on the public hydration
  entrypoint without manually importing
  `@lit-labs/ssr-client/lit-element-hydrate-support.js`.
- Updated dependencies [c02e682]
- Updated dependencies [2678438]
- Updated dependencies [ad185f4]
- Updated dependencies [57a20ff]
- Updated dependencies [450ae03]
- Updated dependencies [46e4cce]
- Updated dependencies [53939a2]
- Updated dependencies [54a0ec0]
- Updated dependencies [92e1dbe]
- Updated dependencies [719cf1e]
- Updated dependencies [60b2e98]
- Updated dependencies [9fe2f77]
- Updated dependencies [7d9ee7d]
- Updated dependencies [c2f7eb8]
- Updated dependencies [4719308]
- Updated dependencies [1aa0135]
- Updated dependencies [0ae3bc9]
- Updated dependencies [627c163]
- Updated dependencies [83d757e]
- Updated dependencies [0a1ed42]
- Updated dependencies [accc7aa]
- Updated dependencies [c9ae368]
- Updated dependencies [43aa10a]
- Updated dependencies [5eb7392]
- Updated dependencies [53028b8]
  - @litsx/compiler@1.0.0-next.0
  - @litsx/core@1.0.0-next.0
  - @litsx/vite-plugin@1.0.0-next.0

## 0.1.0

### Minor Changes

- Initial LitSX SSR and hydration integration.
