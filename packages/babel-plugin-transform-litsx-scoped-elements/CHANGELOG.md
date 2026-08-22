# @litsx/babel-plugin-transform-litsx-scoped-elements

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
- Updated dependencies [4b34759]
  - @litsx/babel-plugin-shared-hooks@1.0.0-next.1

## 1.0.0-next.0

### Major Changes

- 83d757e: Stabilize the complete public LitSX package graph as the 1.0 release line.

  This release establishes standard JSX and TSX authoring, SSR and hydration,
  React compatibility, scoped custom-element registration, structural hooks,
  Storybook and Vite integration, and Shadow DOM and Light DOM UnoCSS support as
  the stable public contract.

### Minor Changes

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

### Patch Changes

- 53939a2: Add SSR-safe dynamic fallback rendering for the LitSX `<noscript>` intrinsic.
- 31ae393: Replace the deprecated `@litsx/babel-parser` runtime import with the
  `@litsx/authoring/parser` + `@babel/parser` pipeline and declare the runtime
  dependencies needed by the published scoped-elements transform package.
- Updated dependencies [92e1dbe]
- Updated dependencies [60b2e98]
- Updated dependencies [354dac9]
- Updated dependencies [0ae3bc9]
- Updated dependencies [83d757e]
- Updated dependencies [accc7aa]
- Updated dependencies [c9ae368]
  - @litsx/babel-plugin-shared-hooks@1.0.0-next.0
  - @litsx/typescript-session@1.0.0-next.0
  - @litsx/authoring@1.0.0-next.0

## 0.4.9

### Patch Changes

- Updated dependencies [3e5ba90]
  - @litsx/babel-plugin-shared-hooks@0.8.0

## 0.4.8

### Patch Changes

- Updated dependencies [1dfa4f1]
  - @litsx/babel-plugin-shared-hooks@0.7.0

## 0.4.7

### Patch Changes

- 8b39fd6: Fix native ref forwarding so authored `ref` props are not overwritten by the host fallback when a component explicitly forwards the ref to a native element or child component. Named local callback refs on native elements are now lowered through the DOM ref lifecycle path, enabling composed local/public refs.

  Align intrinsic label/output typing and diagnostics so LitSX-authored native elements can use the DOM-aligned `for` attribute while `htmlFor` remains compatibility syntax.

- Updated dependencies [8b39fd6]
  - @litsx/babel-plugin-shared-hooks@0.6.3

## 0.4.6

### Patch Changes

- Updated dependencies [1e586fa]
  - @litsx/babel-plugin-shared-hooks@0.6.0

## 0.4.5

### Patch Changes

- 1c9b206: Recognize `useId` imported from `@litsx/core` and `useContext` imported from `@litsx/core/context` as LitSX runtime hooks during shared custom-hook analysis so custom hooks that call them are compiled with the active host instead of being treated as unresolved imported hooks. The preset now classifies LitSX runtime hooks by known runtime import source plus the public `useX` naming convention instead of maintaining a duplicated hook allowlist.

  Rename compiler-facing structural runtime helpers from `useStructuralEntry(...)` and `useStructuralStaticEntry(...)` to `resolveStructuralEntry(...)` and `resolveStructuralStaticEntry(...)`. These helpers are emitted by the compiler/runtime bridge and are no longer named like authored user-space hooks.

- Updated dependencies [1c9b206]
  - @litsx/babel-plugin-shared-hooks@0.5.0

## 0.4.4

### Patch Changes

- 69264c9: Add host middleware runtime plumbing and structural hook compiler wiring. `defineHook({ static, setup, middlewares, use })` is the public mixed structural-hook authoring API and returns a callable hook value enriched with compiler/runtime metadata. The compiler now separates class/type structural work from instance work: static-only hooks lower to `useStructuralStaticEntry(...)` and generated `structuralStaticEntries` without `HostMiddlewareMixin(...)`, while mixed/instance hooks lower to `useStructuralEntry(...)`, generated hosts are wrapped with `HostMiddlewareMixin(...)`, and direct structural hook callsites emit static `structuralEntries` so lifecycle middleware exists before first render. Local and imported custom hooks can carry compiled structural metadata, structural hook readers can expand nested structural usage, and structural hooks that call other structural hooks from `use(...)` now expose metadata for imported consumers. The preset can discover named or namespace structural hook imports from authored modules using relative, path-alias, or TypeScript module resolution, including imported static-only hooks. Structural entries remain one-to-one with authored callsites; resource dedupe belongs in hook-specific runtimes. Unsupported dynamic structural-hook patterns such as aliases, object/array containers, runtime selection, and computed namespace access now fail during transform with actionable code-frame diagnostics.

  The native preset also now creates an early static IR for inferred properties, authored `static properties`, element candidates, imported element candidates, and light-DOM intent so future static-hoist migrations can consume compiler metadata before late class-member emission. Element candidate analysis, scoped-elements, React lazy, and static-hoist processing now use that IR instead of parallel private annotations.

- Updated dependencies [69264c9]
  - @litsx/babel-plugin-shared-hooks@0.4.0

## 0.4.3

### Patch Changes

- 05bb013: Resolve scoped element candidates declared as top-level aliases of namespace imports.
- Updated dependencies [73790b9]
- Updated dependencies [d7cb8a1]
  - @litsx/typescript-session@0.2.3
  - @litsx/babel-plugin-shared-hooks@0.3.1

## 0.4.2

### Patch Changes

- c432761: Declare direct runtime dependencies explicitly so strict package managers such as Yarn Plug'n'Play can resolve the published LitSX toolchain without undeclared dependency errors.

## 0.4.1

### Patch Changes

- 0394450: Unify package build configuration on the shared Rollup helper and improve LitSX editor diagnostics for destructured component props without explicit metadata.

## 0.4.0

### Minor Changes

- 677553b: Normalize DOM runtime mixins around root mode: `ShadowDomMixin` and `LightDomMixin` are now the canonical mixins, and `LightDomMixin` also handles scoped light-DOM elements when `static elements` is present.

## 0.3.0

### Minor Changes

- 191fc0d: Introduce canonical package names for the LitSX runtime, TypeScript integration, and authored JSX tooling.

  `@litsx/core`, `@litsx/typescript`, and `@litsx/authoring` are now the recommended packages. The previous `@litsx/litsx`, `@litsx/typescript-plugin`, and `@litsx/jsx-authoring` packages remain available as compatibility wrappers.

  Generated scaffolds, compiler output, presets, and tooling defaults now target the canonical package names while preserving compatibility with projects that still use the previous names. The canonical element/scoped-registry helpers now live at `@litsx/core/elements`; `@litsx/litsx/runtime-infrastructure` remains available as the legacy compatibility subpath. Rendering helpers now live at `@litsx/core/rendering`, and TypeScript source virtualization helpers now live at `@litsx/typescript/virtualization`.

### Patch Changes

- Updated dependencies [191fc0d]
  - @litsx/babel-plugin-shared-hooks@0.3.0

## 0.2.2

### Patch Changes

- 63a9d36: Fix scoped custom element registry races across shadow DOM, light DOM, global registrations, authored static element maps, projected renderer output, and Storybook Vite optimize-deps configuration.

## 0.2.1

### Patch Changes

- b7266d8: Publish internal public dependencies with semver ranges instead of `workspace:` and keep generated scaffold package versions aligned for npm installs.
- Updated dependencies [b7266d8]
  - @litsx/babel-plugin-shared-hooks@0.2.1

## 0.2.0

### Minor Changes

- cef2428: Publish the scoped runtime as `@litsx/litsx` and realign the public package surface on `0.2.0`.

### Patch Changes

- Updated dependencies [cef2428]
  - @litsx/babel-plugin-shared-hooks@0.2.0

## 0.1.0

### Minor Changes

- 5321478: Publish the initial public npm release as version 0.1.0 through the automated Changesets pipeline.

### Patch Changes

- Updated dependencies [5321478]
  - @litsx/babel-plugin-shared-hooks@0.1.0
