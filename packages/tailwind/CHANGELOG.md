# @litsx/tailwind

## 1.0.0-next.2

### Patch Changes

- 5efc754: Resolve queried Tailwind preflight virtual modules during real Vite builds, and
  cover parallel component, client/SSR, and multi-entry style isolation alongside
  the equivalent shared-engine UnoCSS behavior.
- Updated dependencies [c9d0c29]
  - @litsx/compiler@1.0.0-next.6

## 1.0.0-next.1

### Minor Changes

- f7ed4f7: Expose build-tool-neutral utility-class analysis from the compiler, refactor
  UnoCSS to consume it, and add the official Tailwind CSS v4 Vite integration.

  Tailwind utilities are extracted per component from literal and finite class
  bindings, explicit local style guards, and only matching safelist candidates.
  Shadow components receive isolated CSSResults; light DOM supports global and
  native `@scope` output; shared preflight, theme, and inert property
  infrastructure cover HMR, lazy imports, SSR, hydration, and property-backed
  utilities without leaking component selectors globally.

### Patch Changes

- Updated dependencies [f7ed4f7]
  - @litsx/compiler@1.0.0-next.5
