# litsx

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
