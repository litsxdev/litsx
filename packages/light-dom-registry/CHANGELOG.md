# @litsx/light-dom-registry

## 0.2.4

### Patch Changes

- 63a9d36: Fix scoped custom element registry races across shadow DOM, light DOM, global registrations, authored static element maps, projected renderer output, and Storybook Vite optimize-deps configuration.

## 0.2.3

### Patch Changes

- bca974f: Allow globally registered shadow-DOM LitSX components to stay newable after the light DOM registry runtime patches `HTMLElement`, including components defined before the light-DOM runtime activates.

## 0.2.2

### Patch Changes

- b3e35a4: Preserve globally registered shadow-DOM component constructors after the light DOM registry runtime patches `HTMLElement`, so subsequent instances remain newable and Storybook-style hosts do not fail after light-DOM features are activated.

## 0.2.1

### Patch Changes

- 6954190: Publish `withLightDomCreationContext` through a new `@litsx/light-dom-registry` patch release.

## 0.2.0

### Minor Changes

- cef2428: Publish the scoped runtime as `@litsx/litsx` and realign the public package surface on `0.2.0`.

## 0.1.0

### Minor Changes

- 5321478: Publish the initial public npm release as version 0.1.0 through the automated Changesets pipeline.
