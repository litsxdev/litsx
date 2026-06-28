# @litsx/compiler

## 0.8.4

### Patch Changes

- 1c9b206: Recognize `useId` imported from `@litsx/core` and `useContext` imported from `@litsx/core/context` as LitSX runtime hooks during shared custom-hook analysis so custom hooks that call them are compiled with the active host instead of being treated as unresolved imported hooks. The preset now classifies LitSX runtime hooks by known runtime import source plus the public `useX` naming convention instead of maintaining a duplicated hook allowlist.

  Rename compiler-facing structural runtime helpers from `useStructuralEntry(...)` and `useStructuralStaticEntry(...)` to `resolveStructuralEntry(...)` and `resolveStructuralStaticEntry(...)`. These helpers are emitted by the compiler/runtime bridge and are no longer named like authored user-space hooks.

- Updated dependencies [1c9b206]
  - @litsx/babel-preset-litsx@0.10.0

## 0.8.3

### Patch Changes

- 0427477: Keep imported custom-hook module analysis in its own compiler-session cache so shared-hook analysis cannot poison element-candidate analysis for imported renderer helpers.
- Updated dependencies [0427477]
  - @litsx/babel-preset-litsx@0.9.2

## 0.8.2

### Patch Changes

- ac837c5: Detect imported custom hooks that call LitSX runtime hooks and inject the active host at their callsites so the compiled hook signature and consumer calls stay aligned.
- Updated dependencies [ac837c5]
  - @litsx/babel-preset-litsx@0.9.1

## 0.8.1

### Patch Changes

- Updated dependencies [69264c9]
  - @litsx/babel-preset-litsx@0.9.0

## 0.8.0

### Minor Changes

- 29582a0: Add implicit `children` projection for LitSX components as a default-slot transform, and report unsupported `children` usages consistently across the compiler and TypeScript tooling. Also extract the shared authored-semantics helpers behind those checks into `@litsx/authoring`.

### Patch Changes

- Updated dependencies [29582a0]
  - @litsx/authoring@0.5.0
  - @litsx/babel-preset-litsx@0.8.0
  - @litsx/typescript@0.7.0
  - @litsx/babel-plugin-transform-jsx-html-template@0.3.5

## 0.7.1

### Patch Changes

- c432761: Declare direct runtime dependencies explicitly so strict package managers such as Yarn Plug'n'Play can resolve the published LitSX toolchain without undeclared dependency errors.
- c432761: Declare `source-map-js` explicitly so Yarn Plug'n'Play and other strict resolvers can load the published compiler pipeline without undeclared dependency errors.
- Updated dependencies [c432761]
- Updated dependencies [c432761]
  - @litsx/babel-plugin-transform-jsx-html-template@0.3.4
  - @litsx/babel-preset-litsx@0.7.1
  - @litsx/typescript@0.6.4

## 0.7.0

### Minor Changes

- 677553b: Normalize DOM runtime mixins around root mode: `ShadowDomMixin` and `LightDomMixin` are now the canonical mixins, and `LightDomMixin` also handles scoped light-DOM elements when `static elements` is present.

### Patch Changes

- Updated dependencies [677553b]
  - @litsx/babel-preset-litsx@0.7.0

## 0.6.0

### Minor Changes

- 191fc0d: Introduce canonical package names for the LitSX runtime, TypeScript integration, and authored JSX tooling.

  `@litsx/core`, `@litsx/typescript`, and `@litsx/authoring` are now the recommended packages. The previous `@litsx/litsx`, `@litsx/typescript-plugin`, and `@litsx/jsx-authoring` packages remain available as compatibility wrappers.

  Generated scaffolds, compiler output, presets, and tooling defaults now target the canonical package names while preserving compatibility with projects that still use the previous names. The canonical element/scoped-registry helpers now live at `@litsx/core/elements`; `@litsx/litsx/runtime-infrastructure` remains available as the legacy compatibility subpath. Rendering helpers now live at `@litsx/core/rendering`, and TypeScript source virtualization helpers now live at `@litsx/typescript/virtualization`.

### Patch Changes

- Updated dependencies [191fc0d]
  - @litsx/authoring@0.4.0
  - @litsx/babel-preset-litsx@0.6.0
  - @litsx/babel-plugin-transform-jsx-html-template@0.3.2

## 0.5.1

### Patch Changes

- 8c4a4b6: Strip TypeScript-only syntax from final compiler output after consumer output plugins run, including interfaces, type aliases, assertions, and generics in `.litsx` compilation.

  Improve authored attribute completions to rank camel-case word segment matches more naturally.

## 0.5.0

### Minor Changes

- 4a81cd6: Add `static ... = ...` as the primary static hoist syntax across LitSX authoring, formatting, tooling, and scaffolding.

  Legacy `^...` hoists still work in this release, but they now emit deprecation warnings so projects can migrate before removal.

### Patch Changes

- Updated dependencies [4a81cd6]
  - @litsx/jsx-authoring@0.3.0
  - @litsx/babel-preset-litsx@0.5.0

## 0.4.0

### Minor Changes

- 791414f: Added support for renderer helpers imported across files, package specifiers, and project aliases such as `@/...`, so imported renderers can participate correctly in native lowering and static elements analysis.

  Improved compiler performance for repeated project builds by caching imported renderer module analysis per compilation session, which significantly reduces warm compile times for multi-file and alias-heavy projects.

  Improved `@litsx/typescript-plugin` project typecheck performance by caching stable diagnostics across repeated runs when project files have not changed, reducing repeated `litsx-tsc` costs while preserving invalidation when source versions move.

### Patch Changes

- Updated dependencies [791414f]
  - @litsx/babel-preset-litsx@0.4.0

## 0.3.0

### Minor Changes

- 97df32d: Improve authored renderer handling across the compiler and runtime, and refresh the generated starter templates.

  Compiler and preset updates now keep renderer-context analysis in the semantic pass, add a final JSX-to-`html` lowering pass, support renderer call-site rewrites so projected renderer content keeps the right authored context, and validate `PascalCase` JSX against real scope bindings instead of relying on the older top-level-name heuristic.

  Runtime updates align `ErrorBoundary` with `SuspenseBoundary` and keep the shared renderer-context helpers used by compiler output on the main runtime path.

  The scaffold generated by `create-litsx-app` now ships the current hero, starter guide, button primitives, updated stories/docs, and the matching starter asset set.

### Patch Changes

- Updated dependencies [97df32d]
  - @litsx/babel-plugin-transform-jsx-html-template@0.3.0
  - @litsx/babel-preset-litsx@0.3.0

## 0.2.1

### Patch Changes

- b7266d8: Publish internal public dependencies with semver ranges instead of `workspace:` and keep generated scaffold package versions aligned for npm installs.
- Updated dependencies [b7266d8]
  - @litsx/babel-preset-litsx@0.2.1
  - @litsx/babel-plugin-transform-jsx-html-template@0.2.1
  - @litsx/jsx-authoring@0.2.1
  - @litsx/typescript-session@0.2.1

## 0.2.0

### Minor Changes

- cef2428: Publish the scoped runtime as `@litsx/litsx` and realign the public package surface on `0.2.0`.

### Patch Changes

- Updated dependencies [cef2428]
  - @litsx/jsx-authoring@0.2.0
  - @litsx/babel-preset-litsx@0.2.0
  - @litsx/babel-plugin-transform-jsx-html-template@0.2.0
  - @litsx/typescript-session@0.2.0

## 0.1.0

### Minor Changes

- 5321478: Publish the initial public npm release as version 0.1.0 through the automated Changesets pipeline.

### Patch Changes

- Updated dependencies [5321478]
  - @litsx/jsx-authoring@0.1.0
  - @litsx/babel-preset-litsx@0.1.0
  - @litsx/babel-plugin-transform-jsx-html-template@0.1.0
  - @litsx/typescript-session@0.1.0
