# @litsx/vite-plugin

## 1.0.0-next.2

### Patch Changes

- ee1f0b9: Preserve bare side-effect imports so ordinary Vite CSS and `virtual:uno.css`
  remain linked in dev, Storybook, and production builds. Compile expression-bodied
  local PascalCase story hosts as Lit elements, and keep optimize-deps compilation
  away from dependencies, generated chunks, assets, virtual ids, and prebundled
  cache output.
- ac35124: Move the Vite-backed `createSsrDevServer` integration from `@litsx/ssr` to the
  opt-in `@litsx/vite-plugin/ssr` entrypoint. `@litsx/ssr` now exposes a generic
  authored-module loader contract and no longer declares, imports, or types Vite.
  Update generated SSR projects to use the new entrypoint. This intentionally
  removes the prerelease `createSsrDevServer` export from `@litsx/ssr`; migrate
  imports to `@litsx/vite-plugin/ssr`.
- Updated dependencies [ee1f0b9]
- Updated dependencies [ac35124]
  - @litsx/compiler@1.0.0-next.11
  - @litsx/ssr@1.0.0-next.5

## 1.0.0-next.1

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

## 1.0.0-next.0

### Major Changes

- 83d757e: Stabilize the complete public LitSX package graph as the 1.0 release line.

  This release establishes standard JSX and TSX authoring, SSR and hydration,
  React compatibility, scoped custom-element registration, structural hooks,
  Storybook and Vite integration, and Shadow DOM and Light DOM UnoCSS support as
  the stable public contract.

### Minor Changes

- accc7aa: Make standard JSX and TSX the recommended LitSX authoring surface. Infer Lit attribute, boolean, and property bindings from ordinary prop names; add the explicit `on:event` listener convention for HTML and custom elements; preserve native lowercase handler properties; type published custom-event metadata; and keep React `onX` conversion isolated to react-compat.

  Make standard `.jsx` and `.tsx` the only authored source formats. Generate projects with ordinary component props, `Component.styles = css\`...\``assignments, native`tsc`type-checking, standard Prettier formatting, and TSX Storybook stories. Remove the unreleased`.litsx`, prefixed binding, static-hoist, custom TypeScript, Prettier-plugin, and syntax-highlighting compatibility surfaces.

  Allow React-authored hook dependencies to opt into recursive react-compat transformation. Vite now keeps selected packages out of dependency prebundling and SSR externalization, transforms their JavaScript and TypeScript modules, propagates the LitSX host through custom-hook graphs, emits compiled-hook metadata, and stops with a diagnostic at unsupported React hook boundaries.

  Normalize statically analyzable output from React's classic and automatic JSX runtimes before react-compat lowering. Allowlisted compiled dependencies can now recover named components, fragments, props and spreads, children, keys, refs, minified public component aliases, and effect sequences from `createElement`, `jsx`, `jsxs`, and `jsxDEV`, while unsupported dynamic element operations stop with explicit diagnostics.

  Recover effect-only React components that render `null`, trailing named component exports, namespace `useRef` calls, and statically bounded polymorphic `asChild` aliases. Resolve host-aware hooks from the ESM implementation of allowlisted dependencies, and emit valid quoted property metadata and computed instance access for hyphenated TypeScript props such as `aria-label`.

  Preserve object-rest component props as one reactive forwarding bag instead of expanding utility types such as `React.ComponentProps<"button">` into the generated custom-element API. Publish a runtime rest-props contract on compiled classes and route local and third-party component inputs through it in both client rendering and SSR.

  Lower native JSX refs directly to Lit's `ref()` directive and adopt Lit's `.value`/`undefined` contract throughout the core runtime, component forwarding, imperative handles, spreads, SSR, and hydration. React compatibility now creates `.current`/`null` facades over Lit refs and adapts callback and external refs at compiled React boundaries, preserving React-authored consumers without leaking React ref semantics into native LitSX.

  Align native JSX types, examples, fixtures, and package documentation with the same contract. Native intrinsic elements no longer advertise React-only `className`, `htmlFor`, `onClick`, or `key` props; use `class`, `for`, `on:event`, and Lit's `repeat()`/`keyed()` directives instead. React-authored source retains those forms through react-compat.

  Make light DOM the default for react-compat migrations and restore contextual scoped-element registries for light hosts. Activate the registry shim only when a component needs scoped elements, preserve initialization across nested light/shadow trees, projected renderers, asynchronous definitions, reconnects, and native/global custom-element coexistence, and retain `domMode: "shadow"` as an explicit opt-in.

  Use the modern `document.importNode()` registry option as Lit's creation scope when the browser provides native scoped custom-element registries, so nested shadow components initialize without the legacy registry polyfill.

  Register imported authored components after Storybook's CSF transforms so extensionless local TSX imports remain defined and initialized in both development and static Storybook builds.

  Escape literal backticks and backslashes in JSX text when emitting Lit template literals, so documentation and code examples remain valid standard JSX.

### Patch Changes

- 57a20ff: Complete the public SSR surface with streaming metadata, hydration payload support, browser hydration coverage, and release integration for the SSR packages.
- 53939a2: Add SSR-safe dynamic fallback rendering for the LitSX `<noscript>` intrinsic.
- 92e1dbe: Add phase 1 SSR support for generic custom elements across the LitSX SSR and
  compiler pipelines.

  LitSX now recognizes hydratable non-Lit custom element constructors, carries
  their SSR metadata through compiled scoped-element registries and SSR root
  rewrites, and supports host-only SSR plus hydration payload collection for
  generic `HTMLElement` roots.

  `@litsx/ssr` also exposes a new `renderCustomElementSsr(...)` hook so consumer
  frameworks can take over SSR for hydratable non-Lit custom elements, contribute
  client imports, preloads, head tags, and opaque adapter artifacts, while
  preserving LitSX root metadata and hydration orchestration.

- Updated dependencies [c02e682]
- Updated dependencies [2678438]
- Updated dependencies [57a20ff]
- Updated dependencies [53939a2]
- Updated dependencies [92e1dbe]
- Updated dependencies [60b2e98]
- Updated dependencies [9fe2f77]
- Updated dependencies [c2f7eb8]
- Updated dependencies [1aa0135]
- Updated dependencies [83d757e]
- Updated dependencies [0a1ed42]
- Updated dependencies [accc7aa]
- Updated dependencies [43aa10a]
- Updated dependencies [5eb7392]
  - @litsx/compiler@1.0.0-next.0

## 0.3.2

### Patch Changes

- Updated dependencies [8057814]
  - @litsx/compiler@0.10.0

## 0.3.1

### Patch Changes

- 8b39fd6: Fix native ref forwarding so authored `ref` props are not overwritten by the host fallback when a component explicitly forwards the ref to a native element or child component. Named local callback refs on native elements are now lowered through the DOM ref lifecycle path, enabling composed local/public refs.

  Align intrinsic label/output typing and diagnostics so LitSX-authored native elements can use the DOM-aligned `for` attribute while `htmlFor` remains compatibility syntax.

- Updated dependencies [8b39fd6]
  - @litsx/compiler@0.9.2

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
