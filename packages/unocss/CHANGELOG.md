# @litsx/unocss

## 1.0.0-next.6

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
  - @litsx/compiler@1.0.0-next.9
  - @litsx/vite-plugin@1.0.0-next.1

## 1.0.0-next.5

### Patch Changes

- f720ee5: Keep normalized opening and closing custom-element tags aligned, and preserve global UnoCSS and Tailwind utilities from free light-DOM templates in modules that also declare LitSX components without leaking component-only utilities.
- Updated dependencies [f720ee5]
  - @litsx/compiler@1.0.0-next.7

## 1.0.0-next.4

### Patch Changes

- f7ed4f7: Expose build-tool-neutral utility-class analysis from the compiler, refactor
  UnoCSS to consume it, and add the official Tailwind CSS v4 Vite integration.

  Tailwind utilities are extracted per component from literal and finite class
  bindings, explicit local style guards, and only matching safelist candidates.
  Shadow components receive isolated CSSResults; light DOM supports global and
  native `@scope` output; shared preflight, theme, and inert property
  infrastructure cover HMR, lazy imports, SSR, hydration, and property-backed
  utilities without leaking component selectors globally.

- Updated dependencies [f7ed4f7]
  - @litsx/compiler@1.0.0-next.5

## 1.0.0-next.3

### Patch Changes

- 225bfe6: Resolve finite local constants, maps, aliases, and exact imports referenced by
  component class bindings without requiring duplicate `Component.styles`
  guards. Preserve per-component ownership, dependency invalidation, HMR refresh,
  and deduplication with explicit guards.

## 1.0.0-next.2

### Patch Changes

- bda0de0: Isolate generated utilities per component: inject finite candidates from that component's JSX markup and explicit `Component.styles` guards, plus only safelist entries matching its non-finite class patterns. Deduplicate overlapping markup/guard candidates and keep sibling or unrelated module strings out of shadow roots.
- 837ba4c: Route UnoCSS preflight layers independently to document and component outputs, keeping the `theme` layer global by default so custom properties inherit through nested shadow roots. Materialize `virtual:uno.css` from the shared LitSX token lifecycle in production and development. Remove the legacy public placeholder protocol so author strings containing `@unocss-placeholder` remain untouched.

## 1.0.0-next.1

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
  - @litsx/compiler@1.0.0-next.2

## 1.0.0-next.0

### Major Changes

- 83d757e: Stabilize the complete public LitSX package graph as the 1.0 release line.

  This release establishes standard JSX and TSX authoring, SSR and hydration,
  React compatibility, scoped custom-element registration, structural hooks,
  Storybook and Vite integration, and Shadow DOM and Light DOM UnoCSS support as
  the stable public contract.

### Minor Changes

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

### Patch Changes

- Updated dependencies [c02e682]
- Updated dependencies [2678438]
- Updated dependencies [57a20ff]
- Updated dependencies [53939a2]
- Updated dependencies [92e1dbe]
- Updated dependencies [60b2e98]
- Updated dependencies [9fe2f77]
- Updated dependencies [c2f7eb8]
- Updated dependencies [1aa0135]
- Updated dependencies [83d757e]
- Updated dependencies [0a1ed42]
- Updated dependencies [accc7aa]
- Updated dependencies [43aa10a]
- Updated dependencies [5eb7392]
  - @litsx/compiler@1.0.0-next.0
  - @litsx/vite-plugin@1.0.0-next.0
