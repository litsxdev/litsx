# @litsx/eslint-plugin

## 0.3.7

### Patch Changes

- Updated dependencies [3e5ba90]
  - @litsx/typescript@0.9.0

## 0.3.6

### Patch Changes

- 8b39fd6: Fix native ref forwarding so authored `ref` props are not overwritten by the host fallback when a component explicitly forwards the ref to a native element or child component. Named local callback refs on native elements are now lowered through the DOM ref lifecycle path, enabling composed local/public refs.

  Align intrinsic label/output typing and diagnostics so LitSX-authored native elements can use the DOM-aligned `for` attribute while `htmlFor` remains compatibility syntax.

- Updated dependencies [8b39fd6]
  - @litsx/typescript@0.8.2

## 0.3.5

### Patch Changes

- Updated dependencies [47c474e]
  - @litsx/typescript@0.8.0

## 0.3.4

### Patch Changes

- Updated dependencies [29582a0]
  - @litsx/authoring@0.5.0
  - @litsx/typescript@0.7.0

## 0.3.3

### Patch Changes

- 191fc0d: Introduce canonical package names for the LitSX runtime, TypeScript integration, and authored JSX tooling.

  `@litsx/core`, `@litsx/typescript`, and `@litsx/authoring` are now the recommended packages. The previous `@litsx/litsx`, `@litsx/typescript-plugin`, and `@litsx/jsx-authoring` packages remain available as compatibility wrappers.

  Generated scaffolds, compiler output, presets, and tooling defaults now target the canonical package names while preserving compatibility with projects that still use the previous names. The canonical element/scoped-registry helpers now live at `@litsx/core/elements`; `@litsx/litsx/runtime-infrastructure` remains available as the legacy compatibility subpath. Rendering helpers now live at `@litsx/core/rendering`, and TypeScript source virtualization helpers now live at `@litsx/typescript/virtualization`.

- Updated dependencies [191fc0d]
  - @litsx/typescript@0.6.0

## 0.3.2

### Patch Changes

- Updated dependencies [be88410]
  - @litsx/typescript-plugin@0.5.0

## 0.3.1

### Patch Changes

- Updated dependencies [ca6ccbf]
  - @litsx/typescript-plugin@0.4.0

## 0.3.0

### Minor Changes

- 4a81cd6: Add `static ... = ...` as the primary static hoist syntax across LitSX authoring, formatting, tooling, and scaffolding.

  Legacy `^...` hoists still work in this release, but they now emit deprecation warnings so projects can migrate before removal.

### Patch Changes

- Updated dependencies [4a81cd6]
  - @litsx/typescript-plugin@0.3.0

## 0.2.1

### Patch Changes

- b7266d8: Publish internal public dependencies with semver ranges instead of `workspace:` and keep generated scaffold package versions aligned for npm installs.

## 0.2.0

### Minor Changes

- cef2428: Publish the scoped runtime as `@litsx/litsx` and realign the public package surface on `0.2.0`.

### Patch Changes

- Updated dependencies [cef2428]
  - @litsx/typescript-plugin@0.2.0

## 0.1.0

### Minor Changes

- 5321478: Publish the initial public npm release as version 0.1.0 through the automated Changesets pipeline.

### Patch Changes

- Updated dependencies [5321478]
  - @litsx/typescript-plugin@0.1.0
