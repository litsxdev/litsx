# @litsx/babel-preset-litsx

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
