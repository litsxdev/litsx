# @litsx/babel-preset-litsx

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
