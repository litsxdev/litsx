# @litsx/babel-plugin-shared-hooks

## 0.8.0

### Minor Changes

- 3e5ba90: Add structural `props()` middleware support across runtime, compiler, and TypeScript tooling so shared public host properties compose without leaking internal `accessors()`.

  Structural hooks can now declare public Lit property options through `props(host, state, next)` while keeping internal runtime capabilities in `accessors(host, state, next)`. LitSX now composes both channels as middleware, rejects cross-channel collisions, warns when same-channel structural props or accessors overwrite one another, and keeps FACE accessors out of the public component API.

  TypeScript tooling and editor completions now infer structural public props across local and imported hooks, so PascalCase component surfaces expose shared structural properties in authored LitSX without redeclaring them on every component.

## 0.7.0

### Minor Changes

- 1dfa4f1: Add structural hook `props` support so shared host properties can participate in component surface metadata alongside runtime `accessors`.

## 0.6.3

### Patch Changes

- 8b39fd6: Fix native ref forwarding so authored `ref` props are not overwritten by the host fallback when a component explicitly forwards the ref to a native element or child component. Named local callback refs on native elements are now lowered through the DOM ref lifecycle path, enabling composed local/public refs.

  Align intrinsic label/output typing and diagnostics so LitSX-authored native elements can use the DOM-aligned `for` attribute while `htmlFor` remains compatibility syntax.

## 0.6.2

### Patch Changes

- 207a577: Add generic structural-hook `accessors` support for publishing host instance getters and setters through `defineHook()`.

  Structural hooks can now return host accessor descriptors from `accessors(host, state, meta, entry)`, and LitSX installs those properties directly on the component host with stable override and restoration behavior across multiple structural entries.

  The structural runtime and compiler now treat hooks with `accessors` as instance-phase hooks, so authored accessors compile through the host middleware path instead of the static-only structural path.

  FACE primitives in `@litsx/core` now use that low-level mechanism to expose `form`, `validity`, `validationMessage`, and `willValidate` on the host surface without adding higher-level form semantics.

## 0.6.1

### Patch Changes

- d02befd: Add `useFormValue()` as a form-associated structural hook in `@litsx/core`, including FACE lifecycle plumbing for `formAssociatedCallback`, `formDisabledCallback`, `formResetCallback`, and `formStateRestoreCallback`.

  Expose the new hook through the LitSX transforms so authored components can import it from `@litsx/core` and compile correctly through the preset and compiler facade.

  Also improve renderer-prop lowering for stored JSX expressions and avoid false external-component warnings when PascalCase LitSX components are re-exported through intermediary modules.

## 0.6.0

### Minor Changes

- 1e586fa: Publish compiled LitSX runtime metadata for hooks and components, preserve that
  metadata in built package outputs, and align the compiler/runtime pipeline so
  compiled entities can be recognized reliably across package boundaries.

## 0.5.1

### Patch Changes

- 7b7a4fa: Add framework-level soft suspense for render hooks without an enclosing SuspenseBoundary. Compiled render methods now wrap hook execution so thrown thenables suspend the host, render `nothing`, and request an update when resolved, while preserving explicit SuspenseBoundary handling.

## 0.5.0

### Minor Changes

- 1c9b206: Recognize `useId` imported from `@litsx/core` and `useContext` imported from `@litsx/core/context` as LitSX runtime hooks during shared custom-hook analysis so custom hooks that call them are compiled with the active host instead of being treated as unresolved imported hooks. The preset now classifies LitSX runtime hooks by known runtime import source plus the public `useX` naming convention instead of maintaining a duplicated hook allowlist.

  Rename compiler-facing structural runtime helpers from `useStructuralEntry(...)` and `useStructuralStaticEntry(...)` to `resolveStructuralEntry(...)` and `resolveStructuralStaticEntry(...)`. These helpers are emitted by the compiler/runtime bridge and are no longer named like authored user-space hooks.

## 0.4.1

### Patch Changes

- ac837c5: Detect imported custom hooks that call LitSX runtime hooks and inject the active host at their callsites so the compiled hook signature and consumer calls stay aligned.

## 0.4.0

### Minor Changes

- 69264c9: Add host middleware runtime plumbing and structural hook compiler wiring. `defineHook({ static, setup, middlewares, use })` is the public mixed structural-hook authoring API and returns a callable hook value enriched with compiler/runtime metadata. The compiler now separates class/type structural work from instance work: static-only hooks lower to `useStructuralStaticEntry(...)` and generated `structuralStaticEntries` without `HostMiddlewareMixin(...)`, while mixed/instance hooks lower to `useStructuralEntry(...)`, generated hosts are wrapped with `HostMiddlewareMixin(...)`, and direct structural hook callsites emit static `structuralEntries` so lifecycle middleware exists before first render. Local and imported custom hooks can carry compiled structural metadata, structural hook readers can expand nested structural usage, and structural hooks that call other structural hooks from `use(...)` now expose metadata for imported consumers. The preset can discover named or namespace structural hook imports from authored modules using relative, path-alias, or TypeScript module resolution, including imported static-only hooks. Structural entries remain one-to-one with authored callsites; resource dedupe belongs in hook-specific runtimes. Unsupported dynamic structural-hook patterns such as aliases, object/array containers, runtime selection, and computed namespace access now fail during transform with actionable code-frame diagnostics.

  The native preset also now creates an early static IR for inferred properties, authored `static properties`, element candidates, imported element candidates, and light-DOM intent so future static-hoist migrations can consume compiler metadata before late class-member emission. Element candidate analysis, scoped-elements, React lazy, and static-hoist processing now use that IR instead of parallel private annotations.

## 0.3.1

### Patch Changes

- d7cb8a1: Add `useStableId()` as a public callsite-stable identity primitive, with LitSX transform support that injects deterministic authored callsite metadata for SSR/client consistency.

## 0.3.0

### Minor Changes

- 191fc0d: Introduce canonical package names for the LitSX runtime, TypeScript integration, and authored JSX tooling.

  `@litsx/core`, `@litsx/typescript`, and `@litsx/authoring` are now the recommended packages. The previous `@litsx/litsx`, `@litsx/typescript-plugin`, and `@litsx/jsx-authoring` packages remain available as compatibility wrappers.

  Generated scaffolds, compiler output, presets, and tooling defaults now target the canonical package names while preserving compatibility with projects that still use the previous names. The canonical element/scoped-registry helpers now live at `@litsx/core/elements`; `@litsx/litsx/runtime-infrastructure` remains available as the legacy compatibility subpath. Rendering helpers now live at `@litsx/core/rendering`, and TypeScript source virtualization helpers now live at `@litsx/typescript/virtualization`.

## 0.2.2

### Patch Changes

- be88410: Release every public package that is currently ahead of its latest published tag.

  This includes the LitSX TypeScript editor-session and completion improvements, refreshed scaffolded VS Code defaults, and the pending source, metadata, and packaging updates already present in the other affected packages.

## 0.2.1

### Patch Changes

- b7266d8: Publish internal public dependencies with semver ranges instead of `workspace:` and keep generated scaffold package versions aligned for npm installs.

## 0.2.0

### Minor Changes

- cef2428: Publish the scoped runtime as `@litsx/litsx` and realign the public package surface on `0.2.0`.

## 0.1.0

### Minor Changes

- 5321478: Publish the initial public npm release as version 0.1.0 through the automated Changesets pipeline.
