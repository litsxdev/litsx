# @litsx/storybook

## 1.0.0-next.1

### Patch Changes

- 7cd6053: Centralize component-tag derivation and hook authoring diagnostics in
  `@litsx/authoring`. Component identifiers must now map directly to a valid
  custom-element name: LitSX no longer invents framework prefixes for short names
  such as `Switch` or `App`, while namespace members retain mappings such as
  `Controls.Switch` to `controls-switch`.

  Use the shared hook analyzer from the compiler, direct Babel transforms and new
  recommended ESLint rules. Report hooks in unstable control flow, async render
  scopes, handlers, deferred `useAsyncState` actions and nested hook definitions
  with stable diagnostic codes. Keep React-specific primitives, including Radix's
  polymorphic `Slot`, inside the optional react-compat adapter.

- Updated dependencies [7cd6053]
  - @litsx/authoring@1.0.0-next.3
  - @litsx/compiler@1.0.0-next.4

## 1.0.0-next.0

### Major Changes

- 83d757e: Stabilize the complete public LitSX package graph as the 1.0 release line.

  This release establishes standard JSX and TSX authoring, SSR and hydration,
  React compatibility, scoped custom-element registration, structural hooks,
  Storybook and Vite integration, and Shadow DOM and Light DOM UnoCSS support as
  the stable public contract.

### Minor Changes

- 1aa0135: Add the UnoCSS integration with shared project-level preflight,
  module-local Shadow DOM utilities, client and SSR support, and generic Vite
  plugin phases around the LitSX Storybook compiler. Add component-owned static
  utility guards with exact export resolution, runtime-safe CSSResult
  materialization, extensible authoring style types, and dependency-aware HMR.
  Expose a build-tool-neutral engine for extraction, guard materialization,
  module utility generation, preflight finalization and dependency invalidation.
  Keep Vite lifecycle and HMR policy in the optional `/vite` adapter. Compose
  UnoCSS's official global mode onto the same resolved context so applications
  can import `virtual:uno.css` for page-level light DOM without a second config,
  token store, preflight generator or UnoCSS instance.
  Add the generic `scoped`, `global`, and `none` light-DOM style routes. UnoCSS
  uses stable compiler-generated scope identities and CSS scope end boundaries
  to prevent utility selectors crossing into nested light-DOM components, while
  SSR preserves the same short opaque scope identity for hydration.
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
  - @litsx/vite-plugin@1.0.0-next.0

## 0.1.2

### Patch Changes

- 1d8601a: Run authored-story registration before existing LitSX Vite transforms so
  generated Storybook previews register and render their custom elements. Validate
  property-bound stories with compiled CSF and cover the rendered browser runtime
  in the Storybook compatibility matrix.
- 3ebfab2: Keep LitSX story registration compatible with Storybook 10.4 and 10.5 by
  normalizing CSF loader options with a safe `makeTitle` fallback. Generate
  idiomatic authored-component stories and align new design-system projects with
  the verified Storybook release line.

## 0.1.1

### Patch Changes

- 8057814: Publish the official compiler-backed Storybook integration for LitSX stories.

  Design-system projects generated by `create-litsx-app` now consume
  `@litsx/storybook` for story indexing and structural custom-element registration.

- Updated dependencies [8057814]
  - @litsx/compiler@0.10.0
  - @litsx/vite-plugin@0.3.2
