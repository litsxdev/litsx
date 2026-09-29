# @litsx/babel-plugin-litsx-proptypes

## 1.0.0-next.1

### Patch Changes

- 4b34759: Move the compiler and lint integrations to Babel 8, ESLint 10, and Node 24 while retaining ESLint 9 compatibility. Refresh generated Storybook and Playwright versions, consume patched transitive dependencies, and support Chromium's native scoped-registry creation scope across shadow and projected light DOM.

## 1.0.0-next.0

### Major Changes

- 83d757e: Stabilize the complete public LitSX package graph as the 1.0 release line.

  This release establishes standard JSX and TSX authoring, SSR and hydration,
  React compatibility, scoped custom-element registration, structural hooks,
  Storybook and Vite integration, and Shadow DOM and Light DOM UnoCSS support as
  the stable public contract.

### Patch Changes

- Updated dependencies [83d757e]
  - @litsx/prop-types@1.0.0-next.0

## 0.2.4

### Patch Changes

- c432761: Declare direct runtime dependencies explicitly so strict package managers such as Yarn Plug'n'Play can resolve the published LitSX toolchain without undeclared dependency errors.

## 0.2.3

### Patch Changes

- 0394450: Unify package build configuration on the shared Rollup helper and improve LitSX editor diagnostics for destructured component props without explicit metadata.

## 0.2.2

### Patch Changes

- be88410: Release every public package that is currently ahead of its latest published tag.

  This includes the LitSX TypeScript editor-session and completion improvements, refreshed scaffolded VS Code defaults, and the pending source, metadata, and packaging updates already present in the other affected packages.

- Updated dependencies [be88410]
  - @litsx/prop-types@0.2.2

## 0.2.1

### Patch Changes

- b7266d8: Publish internal public dependencies with semver ranges instead of `workspace:` and keep generated scaffold package versions aligned for npm installs.
- Updated dependencies [b7266d8]
  - @litsx/prop-types@0.2.1

## 0.2.0

### Minor Changes

- cef2428: Publish the scoped runtime as `@litsx/litsx` and realign the public package surface on `0.2.0`.

### Patch Changes

- Updated dependencies [cef2428]
  - @litsx/prop-types@0.2.0

## 0.1.0

### Minor Changes

- 5321478: Publish the initial public npm release as version 0.1.0 through the automated Changesets pipeline.

### Patch Changes

- Updated dependencies [5321478]
  - @litsx/prop-types@0.1.0
