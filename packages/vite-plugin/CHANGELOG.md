# @litsx/vite-plugin

## 0.3.0

### Minor Changes

- 1e586fa: Publish compiled LitSX runtime metadata for hooks and components, preserve that
  metadata in built package outputs, and align the compiler/runtime pipeline so
  compiled entities can be recognized reliably across package boundaries.

### Patch Changes

- Updated dependencies [1e586fa]
  - @litsx/compiler@0.9.0

## 0.2.9

### Patch Changes

- Updated dependencies [29582a0]
  - @litsx/compiler@0.8.0

## 0.2.8

### Patch Changes

- Updated dependencies [677553b]
  - @litsx/compiler@0.7.0

## 0.2.7

### Patch Changes

- Updated dependencies [191fc0d]
  - @litsx/compiler@0.6.0

## 0.2.6

### Patch Changes

- 63a9d36: Fix scoped custom element registry races across shadow DOM, light DOM, global registrations, authored static element maps, projected renderer output, and Storybook Vite optimize-deps configuration.

## 0.2.5

### Patch Changes

- Updated dependencies [4a81cd6]
  - @litsx/compiler@0.5.0

## 0.2.4

### Patch Changes

- Updated dependencies [791414f]
  - @litsx/compiler@0.4.0

## 0.2.3

### Patch Changes

- Updated dependencies [97df32d]
  - @litsx/compiler@0.3.0

## 0.2.2

### Patch Changes

- 79e9356: Fix the generated Storybook setup so it uses a published, installable dependency
  set instead of pinning unavailable Storybook package versions.

  Update the Vite plugin to configure dependency optimization via
  `optimizeDeps.rolldownOptions` so it no longer triggers Vite's
  `optimizeDeps.esbuildOptions` deprecation warning.

## 0.2.1

### Patch Changes

- b7266d8: Publish internal public dependencies with semver ranges instead of `workspace:` and keep generated scaffold package versions aligned for npm installs.
- Updated dependencies [b7266d8]
  - @litsx/compiler@0.2.1

## 0.2.0

### Minor Changes

- cef2428: Publish the scoped runtime as `@litsx/litsx` and realign the public package surface on `0.2.0`.

### Patch Changes

- Updated dependencies [cef2428]
  - @litsx/compiler@0.2.0

## 0.1.0

### Minor Changes

- 5321478: Publish the initial public npm release as version 0.1.0 through the automated Changesets pipeline.

### Patch Changes

- Updated dependencies [5321478]
  - @litsx/compiler@0.1.0
