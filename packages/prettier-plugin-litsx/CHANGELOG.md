# prettier-plugin-litsx

## 0.3.2

### Patch Changes

- 191fc0d: Introduce canonical package names for the LitSX runtime, TypeScript integration, and authored JSX tooling.

  `@litsx/core`, `@litsx/typescript`, and `@litsx/authoring` are now the recommended packages. The previous `@litsx/litsx`, `@litsx/typescript-plugin`, and `@litsx/jsx-authoring` packages remain available as compatibility wrappers.

  Generated scaffolds, compiler output, presets, and tooling defaults now target the canonical package names while preserving compatibility with projects that still use the previous names. The canonical element/scoped-registry helpers now live at `@litsx/core/elements`; `@litsx/litsx/runtime-infrastructure` remains available as the legacy compatibility subpath. Rendering helpers now live at `@litsx/core/rendering`, and TypeScript source virtualization helpers now live at `@litsx/typescript/virtualization`.

- Updated dependencies [191fc0d]
  - @litsx/authoring@0.4.0
  - @litsx/babel-parser@0.2.4

## 0.3.1

### Patch Changes

- be88410: Release every public package that is currently ahead of its latest published tag.

  This includes the LitSX TypeScript editor-session and completion improvements, refreshed scaffolded VS Code defaults, and the pending source, metadata, and packaging updates already present in the other affected packages.

- Updated dependencies [be88410]
  - @litsx/babel-parser@0.2.3
  - @litsx/jsx-authoring@0.3.1

## 0.3.0

### Minor Changes

- 4a81cd6: Add `static ... = ...` as the primary static hoist syntax across LitSX authoring, formatting, tooling, and scaffolding.

  Legacy `^...` hoists still work in this release, but they now emit deprecation warnings so projects can migrate before removal.

### Patch Changes

- Updated dependencies [4a81cd6]
  - @litsx/jsx-authoring@0.3.0
  - @litsx/babel-parser@0.2.2

## 0.2.1

### Patch Changes

- b7266d8: Publish internal public dependencies with semver ranges instead of `workspace:` and keep generated scaffold package versions aligned for npm installs.
- Updated dependencies [b7266d8]
  - @litsx/babel-parser@0.2.1
  - @litsx/jsx-authoring@0.2.1

## 0.2.0

### Minor Changes

- cef2428: Publish the scoped runtime as `@litsx/litsx` and realign the public package surface on `0.2.0`.

### Patch Changes

- Updated dependencies [cef2428]
  - @litsx/babel-parser@0.2.0
  - @litsx/jsx-authoring@0.2.0

## 0.1.0

### Minor Changes

- 5321478: Publish the initial public npm release as version 0.1.0 through the automated Changesets pipeline.

### Patch Changes

- Updated dependencies [5321478]
  - @litsx/babel-parser@0.1.0
  - @litsx/jsx-authoring@0.1.0
