# @litsx/babel-plugin-transform-litsx-scoped-elements

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
