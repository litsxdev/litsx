# create-litsx-app

## 0.2.6

### Patch Changes

- 8a00d7c: Refresh the generated demo branding with the LitSX flame wordmark, a fuller
  marketing-style visual treatment, and shadow-safe component styling for the
  starter components.

  Update the design-system scaffold to Storybook 10.x while keeping the generated
  SuspenseBoundary usage on property bindings so the starter demo renders
  correctly.

## 0.2.5

### Patch Changes

- Refresh the generated demo branding with a LitSX wordmark, a full-screen
  marketing-style background, and more polished starter surfaces.

  Fix the default design-system template to pass `SuspenseBoundary` renderers as
  property bindings so the boundary content actually renders.

## 0.2.4

### Patch Changes

- fcc829d: Fix lazy scoped element registration inside `SuspenseBoundary` content renderers
  when the boundary inherits its scoped custom element registry from the enclosing
  shadow root.

  Refresh the generated `create-litsx-app` demo styling to better match the LitSX
  brand direction with stronger typography, warmer surfaces, and more intentional
  starter layouts.

## 0.2.3

### Patch Changes

- 2eedea3: Load the scoped custom element registry polyfill before booting generated apps so
  scaffolded components using authored child imports render correctly in Vite.

  Remove the runtime dependency on `@open-wc/scoped-elements` and resolve scoped
  element registries directly through native or polyfilled `CustomElementRegistry`
  support.

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
