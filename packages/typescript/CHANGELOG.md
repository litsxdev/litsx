# @litsx/typescript

## 0.8.2

### Patch Changes

- 8b39fd6: Fix native ref forwarding so authored `ref` props are not overwritten by the host fallback when a component explicitly forwards the ref to a native element or child component. Named local callback refs on native elements are now lowered through the DOM ref lifecycle path, enabling composed local/public refs.

  Align intrinsic label/output typing and diagnostics so LitSX-authored native elements can use the DOM-aligned `for` attribute while `htmlFor` remains compatibility syntax.

## 0.8.1

### Patch Changes

- 3be001f: Refine `useExpose()` so it can publish imperative methods directly on the host instance or through an explicit ref channel.

  Host-targeted `useExpose()` calls now install methods on the component instance itself, while ref-targeted calls continue to support forwarded imperative handles. When multiple `useExpose()` calls publish the same method on the same target, the last publisher wins and earlier implementations are restored automatically if later publishers disappear.

  TypeScript-authored tooling now reports duplicate static `useExpose()` method declarations as warning `91023` instead of treating them as hard failures, which keeps composed imperative surfaces flexible while still surfacing likely mistakes.

  The React compatibility preset keeps lowering `useImperativeHandle()` onto the explicit ref-targeted `useExpose()` signature so forwarded refs continue to map to the intended imperative channel.

## 0.8.0

### Minor Changes

- 47c474e: Route soft suspense through an internal capture scope so SuspenseBoundary can capture async work from projected descendant updates without relying on DOM boundary lookup.

  SuspenseBoundary and ErrorBoundary now use the authored `fallback` + children contract and the compiler lowers that shape to internal `.fallback`/`.content` renderers. The old boundary-specific `.fallbackRenderer`/`.contentRenderer` contract is removed.

## 0.7.2

### Patch Changes

- a6c8424: Fix `litsx-tsc` virtualization for `.litsx` modules discovered through transparent module resolution, including projects that still keep a `declare module "*.litsx"` shim. Imported authored modules now pass through the same LitSX source virtualization as root files before TypeScript parses them.
- Updated dependencies [a6c8424]
  - @litsx/typescript-session@0.2.4

## 0.7.1

### Patch Changes

- 73790b9: Resolve `.litsx` and `.litsx.jsx` source module imports without requiring ambient `declare module "*.litsx"` declarations.
- Updated dependencies [73790b9]
  - @litsx/typescript-session@0.2.3

## 0.7.0

### Minor Changes

- 29582a0: Add implicit `children` projection for LitSX components as a default-slot transform, and report unsupported `children` usages consistently across the compiler and TypeScript tooling. Also extract the shared authored-semantics helpers behind those checks into `@litsx/authoring`.

### Patch Changes

- Updated dependencies [29582a0]
  - @litsx/authoring@0.5.0

## 0.6.5

### Patch Changes

- 3b44e44: Avoid warning `91020` for destructured component props that already declare default values, since those defaults provide implicit prop metadata.

## 0.6.4

### Patch Changes

- c432761: Declare direct runtime dependencies explicitly so strict package managers such as Yarn Plug'n'Play can resolve the published LitSX toolchain without undeclared dependency errors.

## 0.6.3

### Patch Changes

- 0394450: Unify package build configuration on the shared Rollup helper and improve LitSX editor diagnostics for destructured component props without explicit metadata.

## 0.6.2

### Patch Changes

- 24fef97: Fix LitSX editor false positives for authored components with JSX children, static light DOM hoists, default JSX options, and destructured component props.

## 0.6.1

### Patch Changes

- 887ecb2: Normalize escaped newlines in hover documentation and add a preformatted `markdown` field to `editor-session` hover results for editor integrations.

## 0.6.0

### Minor Changes

- 191fc0d: Introduce canonical package names for the LitSX runtime, TypeScript integration, and authored JSX tooling.

  `@litsx/core`, `@litsx/typescript`, and `@litsx/authoring` are now the recommended packages. The previous `@litsx/litsx`, `@litsx/typescript-plugin`, and `@litsx/jsx-authoring` packages remain available as compatibility wrappers.

  Generated scaffolds, compiler output, presets, and tooling defaults now target the canonical package names while preserving compatibility with projects that still use the previous names. The canonical element/scoped-registry helpers now live at `@litsx/core/elements`; `@litsx/litsx/runtime-infrastructure` remains available as the legacy compatibility subpath. Rendering helpers now live at `@litsx/core/rendering`, and TypeScript source virtualization helpers now live at `@litsx/typescript/virtualization`.

## 0.5.0

### Minor Changes

- be88410: Release every public package that is currently ahead of its latest published tag.

  This includes the LitSX TypeScript editor-session and completion improvements, refreshed scaffolded VS Code defaults, and the pending source, metadata, and packaging updates already present in the other affected packages.

## 0.4.0

### Minor Changes

- ca6ccbf: Add a shared `editor-session` entrypoint that exposes project-backed LitSX diagnostics, hover, and completions for editor integrations outside the tsserver plugin host.

## 0.3.2

### Patch Changes

- 8c4a4b6: Strip TypeScript-only syntax from final compiler output after consumer output plugins run, including interfaces, type aliases, assertions, and generics in `.litsx` compilation.

  Improve authored attribute completions to rank camel-case word segment matches more naturally.

## 0.3.1

### Patch Changes

- 0fd14c4: Remove legacy caret-based hoist metadata from the shared LitSX tooling so editor integrations only surface current `static ... = ...` hoists.

## 0.3.0

### Minor Changes

- 4a81cd6: Add `static ... = ...` as the primary static hoist syntax across LitSX authoring, formatting, tooling, and scaffolding.

  Legacy `^...` hoists still work in this release, but they now emit deprecation warnings so projects can migrate before removal.

## 0.2.1

### Patch Changes

- 791414f: Added support for renderer helpers imported across files, package specifiers, and project aliases such as `@/...`, so imported renderers can participate correctly in native lowering and static elements analysis.

  Improved compiler performance for repeated project builds by caching imported renderer module analysis per compilation session, which significantly reduces warm compile times for multi-file and alias-heavy projects.

  Improved `@litsx/typescript-plugin` project typecheck performance by caching stable diagnostics across repeated runs when project files have not changed, reducing repeated `litsx-tsc` costs while preserving invalidation when source versions move.

## 0.2.0

### Minor Changes

- cef2428: Publish the scoped runtime as `@litsx/litsx` and realign the public package surface on `0.2.0`.

## 0.1.0

### Minor Changes

- 5321478: Publish the initial public npm release as version 0.1.0 through the automated Changesets pipeline.
