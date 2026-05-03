# create-litsx-app

## 0.2.2

### Patch Changes

- 3b78d4e: Load the scoped custom element registry polyfill before booting generated apps so
  scaffolded components using authored child imports render correctly in Vite.

## 0.2.1

### Patch Changes

- b7266d8: Publish internal public dependencies with semver ranges instead of `workspace:` and keep generated scaffold package versions aligned for npm installs.

## 0.2.0

### Minor Changes

- cef2428: Publish the scoped runtime as `@litsx/litsx` and realign the public package surface on `0.2.0`.

## 0.1.0

### Minor Changes

- 5321478: Publish the initial public npm release as version 0.1.0 through the automated Changesets pipeline.
