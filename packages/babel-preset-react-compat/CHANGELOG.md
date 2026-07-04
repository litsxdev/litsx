# @litsx/babel-preset-react-compat

## 0.5.3

### Patch Changes

- 3be001f: Refine `useExpose()` so it can publish imperative methods directly on the host instance or through an explicit ref channel.

  Host-targeted `useExpose()` calls now install methods on the component instance itself, while ref-targeted calls continue to support forwarded imperative handles. When multiple `useExpose()` calls publish the same method on the same target, the last publisher wins and earlier implementations are restored automatically if later publishers disappear.

  TypeScript-authored tooling now reports duplicate static `useExpose()` method declarations as warning `91023` instead of treating them as hard failures, which keeps composed imperative surfaces flexible while still surfacing likely mistakes.

  The React compatibility preset keeps lowering `useImperativeHandle()` onto the explicit ref-targeted `useExpose()` signature so forwarded refs continue to map to the intended imperative channel.

## 0.5.2

### Patch Changes

- Updated dependencies [d02befd]
  - @litsx/babel-preset-litsx@0.13.0
  - @litsx/babel-plugin-shared-hooks@0.6.1

## 0.5.1

### Patch Changes

- Updated dependencies [1e586fa]
  - @litsx/babel-plugin-shared-hooks@0.6.0
  - @litsx/babel-preset-litsx@0.12.0
  - @litsx/babel-plugin-transform-litsx-scoped-elements@0.4.6

## 0.5.0

### Minor Changes

- 47c474e: Route soft suspense through an internal capture scope so SuspenseBoundary can capture async work from projected descendant updates without relying on DOM boundary lookup.

  SuspenseBoundary and ErrorBoundary now use the authored `fallback` + children contract and the compiler lowers that shape to internal `.fallback`/`.content` renderers. The old boundary-specific `.fallbackRenderer`/`.contentRenderer` contract is removed.

### Patch Changes

- Updated dependencies [c36e6f5]
- Updated dependencies [47c474e]
  - @litsx/babel-preset-litsx@0.11.0

## 0.4.3

### Patch Changes

- 1c9b206: Recognize `useId` imported from `@litsx/core` and `useContext` imported from `@litsx/core/context` as LitSX runtime hooks during shared custom-hook analysis so custom hooks that call them are compiled with the active host instead of being treated as unresolved imported hooks. The preset now classifies LitSX runtime hooks by known runtime import source plus the public `useX` naming convention instead of maintaining a duplicated hook allowlist.

  Rename compiler-facing structural runtime helpers from `useStructuralEntry(...)` and `useStructuralStaticEntry(...)` to `resolveStructuralEntry(...)` and `resolveStructuralStaticEntry(...)`. These helpers are emitted by the compiler/runtime bridge and are no longer named like authored user-space hooks.

- Updated dependencies [1c9b206]
  - @litsx/babel-plugin-shared-hooks@0.5.0
  - @litsx/babel-preset-litsx@0.10.0
  - @litsx/babel-plugin-transform-litsx-scoped-elements@0.4.5

## 0.4.2

### Patch Changes

- 69264c9: Add host middleware runtime plumbing and structural hook compiler wiring. `defineHook({ static, setup, middlewares, use })` is the public mixed structural-hook authoring API and returns a callable hook value enriched with compiler/runtime metadata. The compiler now separates class/type structural work from instance work: static-only hooks lower to `useStructuralStaticEntry(...)` and generated `structuralStaticEntries` without `HostMiddlewareMixin(...)`, while mixed/instance hooks lower to `useStructuralEntry(...)`, generated hosts are wrapped with `HostMiddlewareMixin(...)`, and direct structural hook callsites emit static `structuralEntries` so lifecycle middleware exists before first render. Local and imported custom hooks can carry compiled structural metadata, structural hook readers can expand nested structural usage, and structural hooks that call other structural hooks from `use(...)` now expose metadata for imported consumers. The preset can discover named or namespace structural hook imports from authored modules using relative, path-alias, or TypeScript module resolution, including imported static-only hooks. Structural entries remain one-to-one with authored callsites; resource dedupe belongs in hook-specific runtimes. Unsupported dynamic structural-hook patterns such as aliases, object/array containers, runtime selection, and computed namespace access now fail during transform with actionable code-frame diagnostics.

  The native preset also now creates an early static IR for inferred properties, authored `static properties`, element candidates, imported element candidates, and light-DOM intent so future static-hoist migrations can consume compiler metadata before late class-member emission. Element candidate analysis, scoped-elements, React lazy, and static-hoist processing now use that IR instead of parallel private annotations.

- Updated dependencies [69264c9]
  - @litsx/babel-plugin-shared-hooks@0.4.0
  - @litsx/babel-preset-litsx@0.9.0
  - @litsx/babel-plugin-transform-litsx-scoped-elements@0.4.4

## 0.4.1

### Patch Changes

- Updated dependencies [29582a0]
  - @litsx/babel-preset-litsx@0.8.0
  - @litsx/babel-plugin-transform-jsx-html-template@0.3.5

## 0.4.0

### Minor Changes

- 677553b: Normalize DOM runtime mixins around root mode: `ShadowDomMixin` and `LightDomMixin` are now the canonical mixins, and `LightDomMixin` also handles scoped light-DOM elements when `static elements` is present.

### Patch Changes

- Updated dependencies [677553b]
  - @litsx/babel-plugin-transform-litsx-scoped-elements@0.4.0
  - @litsx/babel-preset-litsx@0.7.0

## 0.3.0

### Minor Changes

- 191fc0d: Introduce canonical package names for the LitSX runtime, TypeScript integration, and authored JSX tooling.

  `@litsx/core`, `@litsx/typescript`, and `@litsx/authoring` are now the recommended packages. The previous `@litsx/litsx`, `@litsx/typescript-plugin`, and `@litsx/jsx-authoring` packages remain available as compatibility wrappers.

  Generated scaffolds, compiler output, presets, and tooling defaults now target the canonical package names while preserving compatibility with projects that still use the previous names. The canonical element/scoped-registry helpers now live at `@litsx/core/elements`; `@litsx/litsx/runtime-infrastructure` remains available as the legacy compatibility subpath. Rendering helpers now live at `@litsx/core/rendering`, and TypeScript source virtualization helpers now live at `@litsx/typescript/virtualization`.

### Patch Changes

- Updated dependencies [191fc0d]
  - @litsx/babel-preset-litsx@0.6.0
  - @litsx/babel-plugin-shared-hooks@0.3.0
  - @litsx/babel-plugin-transform-litsx-scoped-elements@0.3.0
  - @litsx/babel-plugin-transform-jsx-html-template@0.3.2

## 0.2.4

### Patch Changes

- 63a9d36: Fix scoped custom element registry races across shadow DOM, light DOM, global registrations, authored static element maps, projected renderer output, and Storybook Vite optimize-deps configuration.
- Updated dependencies [63a9d36]
  - @litsx/babel-plugin-transform-litsx-scoped-elements@0.2.2
  - @litsx/babel-preset-litsx@0.5.1

## 0.2.3

### Patch Changes

- Updated dependencies [4a81cd6]
  - @litsx/babel-preset-litsx@0.5.0

## 0.2.2

### Patch Changes

- Updated dependencies [791414f]
  - @litsx/babel-preset-litsx@0.4.0

## 0.2.1

### Patch Changes

- 97df32d: Improve authored renderer handling across the compiler and runtime, and refresh the generated starter templates.

  Compiler and preset updates now keep renderer-context analysis in the semantic pass, add a final JSX-to-`html` lowering pass, support renderer call-site rewrites so projected renderer content keeps the right authored context, and validate `PascalCase` JSX against real scope bindings instead of relying on the older top-level-name heuristic.

  Runtime updates align `ErrorBoundary` with `SuspenseBoundary` and keep the shared renderer-context helpers used by compiler output on the main runtime path.

  The scaffold generated by `create-litsx-app` now ships the current hero, starter guide, button primitives, updated stories/docs, and the matching starter asset set.

- Updated dependencies [97df32d]
  - @litsx/babel-plugin-transform-jsx-html-template@0.3.0
  - @litsx/babel-preset-litsx@0.3.0

## 0.2.0

### Minor Changes

- cef2428: Publish the scoped runtime as `@litsx/litsx` and realign the public package surface on `0.2.0`.

### Patch Changes

- Updated dependencies [cef2428]
  - @litsx/babel-preset-litsx@0.2.0
  - @litsx/babel-plugin-transform-jsx-html-template@0.2.0
  - @litsx/babel-plugin-transform-litsx-scoped-elements@0.2.0
  - @litsx/babel-plugin-litsx-proptypes@0.2.0
  - @litsx/babel-plugin-shared-hooks@0.2.0

## 0.1.0

### Minor Changes

- 5321478: Publish the initial public npm release as version 0.1.0 through the automated Changesets pipeline.

### Patch Changes

- Updated dependencies [5321478]
  - @litsx/babel-preset-litsx@0.1.0
  - @litsx/babel-plugin-transform-jsx-html-template@0.1.0
  - @litsx/babel-plugin-transform-litsx-scoped-elements@0.1.0
  - @litsx/babel-plugin-litsx-proptypes@0.1.0
  - @litsx/babel-plugin-shared-hooks@0.1.0
