# @litsx/tailwind

## 1.0.0-next.4

### Patch Changes

- c16b18d: Infer nested LitSX light-DOM hydration boundaries in both server and browser
  templates, including pure Lit parents authored in project-local JavaScript or
  TypeScript modules. Hydration now adopts the server-rendered child part so
  subsequent child updates preserve node identity, while disconnecting and
  reconnecting the child leaves connection ownership with the parent render.

  Keep statically enumerable Tailwind candidates in real Vite builds and attach
  scoped light-DOM utilities to their owning host without leaking them into the
  document or sibling components.

  Treat pure Lit class bodies as opaque in both utility integrations. Their
  templates and static styles remain owned by Lit; only LitSX component classes
  and genuinely free document JSX participate in utility extraction.

- Updated dependencies [c16b18d]
  - @litsx/compiler@1.0.0-next.9
  - @litsx/vite-plugin@1.0.0-next.1

## 1.0.0-next.3

### Patch Changes

- f720ee5: Keep normalized opening and closing custom-element tags aligned, and preserve global UnoCSS and Tailwind utilities from free light-DOM templates in modules that also declare LitSX components without leaking component-only utilities.
- Updated dependencies [f720ee5]
  - @litsx/compiler@1.0.0-next.7

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
