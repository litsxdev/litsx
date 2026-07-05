# create-litsx-app

## 0.5.7

### Patch Changes

- 8b39fd6: Fix native ref forwarding so authored `ref` props are not overwritten by the host fallback when a component explicitly forwards the ref to a native element or child component. Named local callback refs on native elements are now lowered through the DOM ref lifecycle path, enabling composed local/public refs.

  Align intrinsic label/output typing and diagnostics so LitSX-authored native elements can use the DOM-aligned `for` attribute while `htmlFor` remains compatibility syntax.

## 0.5.6

### Patch Changes

- 47c474e: Route soft suspense through an internal capture scope so SuspenseBoundary can capture async work from projected descendant updates without relying on DOM boundary lookup.

  SuspenseBoundary and ErrorBoundary now use the authored `fallback` + children contract and the compiler lowers that shape to internal `.fallback`/`.content` renderers. The old boundary-specific `.fallbackRenderer`/`.contentRenderer` contract is removed.

## 0.5.5

### Patch Changes

- 1c9b206: Recognize `useId` imported from `@litsx/core` and `useContext` imported from `@litsx/core/context` as LitSX runtime hooks during shared custom-hook analysis so custom hooks that call them are compiled with the active host instead of being treated as unresolved imported hooks. The preset now classifies LitSX runtime hooks by known runtime import source plus the public `useX` naming convention instead of maintaining a duplicated hook allowlist.

  Rename compiler-facing structural runtime helpers from `useStructuralEntry(...)` and `useStructuralStaticEntry(...)` to `resolveStructuralEntry(...)` and `resolveStructuralStaticEntry(...)`. These helpers are emitted by the compiler/runtime bridge and are no longer named like authored user-space hooks.

## 0.5.4

### Patch Changes

- 607f553: Publish the scaffolded package version refresh so newly generated projects consume the matching `@litsx/core` and compiler versions from the structural hooks release.

## 0.5.3

### Patch Changes

- d99b2f9: Improve authored Storybook DX by auto-registering imported LitSX components and local story hosts in generated scaffolds, allowing local PascalCase story hosts to be rendered directly with natural JSX props, and materializing bare `props` references as prop snapshots instead of reading a synthetic `this.props` field while preserving destructuring rewrites such as `const { title } = props`.

## 0.5.2

### Patch Changes

- cc2eb1d: Refresh the scaffolded `@litsx/core`, `@litsx/typescript`, and `@litsx/vite-plugin` versions so published design-system starters do not install a broken runtime/tooling combination.

## 0.5.1

### Patch Changes

- 9f19379: Use the synchronized published `@litsx/compiler` version in the design-system Storybook template instead of a stale hardcoded dependency.

## 0.5.0

### Minor Changes

- 191fc0d: Introduce canonical package names for the LitSX runtime, TypeScript integration, and authored JSX tooling.

  `@litsx/core`, `@litsx/typescript`, and `@litsx/authoring` are now the recommended packages. The previous `@litsx/litsx`, `@litsx/typescript-plugin`, and `@litsx/jsx-authoring` packages remain available as compatibility wrappers.

  Generated scaffolds, compiler output, presets, and tooling defaults now target the canonical package names while preserving compatibility with projects that still use the previous names. The canonical element/scoped-registry helpers now live at `@litsx/core/elements`; `@litsx/litsx/runtime-infrastructure` remains available as the legacy compatibility subpath. Rendering helpers now live at `@litsx/core/rendering`, and TypeScript source virtualization helpers now live at `@litsx/typescript/virtualization`.

## 0.4.5

### Patch Changes

- be88410: Release every public package that is currently ahead of its latest published tag.

  This includes the LitSX TypeScript editor-session and completion improvements, refreshed scaffolded VS Code defaults, and the pending source, metadata, and packaging updates already present in the other affected packages.

## 0.4.4

### Patch Changes

- 63a9d36: Fix scoped custom element registry races across shadow DOM, light DOM, global registrations, authored static element maps, projected renderer output, and Storybook Vite optimize-deps configuration.

## 0.4.3

### Patch Changes

- 0bb6457: Reset suspense boundary state cleanly across disconnects and stop sharing scoped shadow registries between host instances. Update the design-system scaffold so Storybook stories and StarterGuide use the revised runtime behavior.

## 0.4.2

### Patch Changes

- 26913b7: Make the `app` template the default scaffold, align its starter layout with the current home-style onboarding components, and fix authored `static styles` template output so generated files no longer include legacy `` `); `` hoist closers.

## 0.4.1

### Patch Changes

- ffe097a: Fix the packaged CLI tarball so `npx create-litsx-app` includes the scaffold flame asset at runtime.

## 0.4.0

### Minor Changes

- 4a81cd6: Add `static ... = ...` as the primary static hoist syntax across LitSX authoring, formatting, tooling, and scaffolding.

  Legacy `^...` hoists still work in this release, but they now emit deprecation warnings so projects can migrate before removal.

## 0.3.0

### Minor Changes

- 97df32d: Improve authored renderer handling across the compiler and runtime, and refresh the generated starter templates.

  Compiler and preset updates now keep renderer-context analysis in the semantic pass, add a final JSX-to-`html` lowering pass, support renderer call-site rewrites so projected renderer content keeps the right authored context, and validate `PascalCase` JSX against real scope bindings instead of relying on the older top-level-name heuristic.

  Runtime updates align `ErrorBoundary` with `SuspenseBoundary` and keep the shared renderer-context helpers used by compiler output on the main runtime path.

  The scaffold generated by `create-litsx-app` now ships the current hero, starter guide, button primitives, updated stories/docs, and the matching starter asset set.

## 0.2.7

### Patch Changes

- 79e9356: Fix the generated Storybook setup so it uses a published, installable dependency
  set instead of pinning unavailable Storybook package versions.

  Update the Vite plugin to configure dependency optimization via
  `optimizeDeps.rolldownOptions` so it no longer triggers Vite's
  `optimizeDeps.esbuildOptions` deprecation warning.

## 0.2.6

### Patch Changes

- 8a00d7c: Refresh the generated demo branding with the LitSX flame wordmark, a fuller
  marketing-style visual treatment, and shadow-safe component styling for the
  starter components.

  Update the design-system scaffold to Storybook 10.x while keeping the generated
  SuspenseBoundary usage on property bindings so the starter demo renders
  correctly.

## 0.2.5

### Patch Changes

- Refresh the generated demo branding with a LitSX wordmark, a full-screen
  marketing-style background, and more polished starter surfaces.

  Fix the default design-system template to pass `SuspenseBoundary` renderers as
  property bindings so the boundary content actually renders.

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

- 2eedea3: Load the scoped custom element registry polyfill before booting generated apps so
  scaffolded components using authored child imports render correctly in Vite.

  Remove the runtime dependency on `@open-wc/scoped-elements` and resolve scoped
  element registries directly through native or polyfilled `CustomElementRegistry`
  support.

## 0.2.2

### Patch Changes

- 3b78d4e: Load the scoped custom element registry polyfill before booting generated apps so
  scaffolded components using authored child imports render correctly in Vite.

## 0.2.1

### Patch Changes

- b7266d8: Publish internal public dependencies with semver ranges instead of `workspace:` and keep generated scaffold package versions aligned for npm installs.

## 0.2.0

### Minor Changes

- cef2428: Publish the scoped runtime as `@litsx/litsx` and realign the public package surface on `0.2.0`.

## 0.1.0

### Minor Changes

- 5321478: Publish the initial public npm release as version 0.1.0 through the automated Changesets pipeline.
