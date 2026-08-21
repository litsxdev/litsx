# @litsx/babel-plugin-transform-jsx-html-template

## 1.0.0-next.1

### Patch Changes

- 954fff8: Preserve imported component constructors across JSX lowering so direct props,
  declared attribute aliases, and spreads resolve through one component API in
  browser and SSR builds. Finalize Lit property metadata before runtime inference,
  make compiled SSR spread templates explicit, and hydrate them without replacing
  the server-rendered host or structural branch. Select the client ElementPart
  path when SSR-transformed modules execute in a browser, keep the client marker
  out of server-only imports, and let component defaults handle `undefined`
  spread overrides while preserving explicit `null`. Keep virtual JSX position
  remapping linear as complex templates add generated Lit bindings.
- Updated dependencies [954fff8]
  - @litsx/authoring@1.0.0-next.1

## 1.0.0-next.0

### Major Changes

- 83d757e: Stabilize the complete public LitSX package graph as the 1.0 release line.

  This release establishes standard JSX and TSX authoring, SSR and hydration,
  React compatibility, scoped custom-element registration, structural hooks,
  Storybook and Vite integration, and Shadow DOM and Light DOM UnoCSS support as
  the stable public contract.

### Minor Changes

- ad185f4: Render JSX spread attributes through an `ElementPart` in the browser while retaining regular Lit parts during SSR. Add digest reconciliation and hydration wrappers that preserve server DOM identity without patching Lit, infer third-party component properties from their constructors, and avoid redundant attribute writes during hydration.
- 53939a2: Add SSR-safe dynamic fallback rendering for the LitSX `<noscript>` intrinsic.
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

- 9fe2f77: Preserve precise source mappings from generated LitSX render templates back to authored component returns, JSX nodes, attributes, and children projection.
- c2f7eb8: Prevent generated sourcemap anchors from matching ordinary strings, and preserve source locations for authored static styles.
- 43aa10a: Tighten the `.tsx` `style` contract to reject object-valued JSX `style`
  bindings, document the string-only inline style behavior, and keep the public
  types aligned with that runtime/compiler rule.

  Fix authored component lowering so destructuring from opaque `props` aliases
  continues to resolve against the host instance, preserving SSR output for
  hydrated components that read values like `href`, `label`, `title`, or `body`
  from `props`.

  Escape backticks and literal interpolation markers in generated SSR template
  segments so authored text content containing `` ` `` or `${...}` survives
  compilation without producing invalid output.

- Updated dependencies [83d757e]
- Updated dependencies [accc7aa]
  - @litsx/authoring@1.0.0-next.0

## 0.3.6

### Patch Changes

- d99b2f9: Improve authored Storybook DX by auto-registering imported LitSX components and local story hosts in generated scaffolds, allowing local PascalCase story hosts to be rendered directly with natural JSX props, and materializing bare `props` references as prop snapshots instead of reading a synthetic `this.props` field while preserving destructuring rewrites such as `const { title } = props`.

## 0.3.5

### Patch Changes

- Updated dependencies [29582a0]
  - @litsx/authoring@0.5.0

## 0.3.4

### Patch Changes

- c432761: Declare direct runtime dependencies explicitly so strict package managers such as Yarn Plug'n'Play can resolve the published LitSX toolchain without undeclared dependency errors.
- c432761: Declare `source-map-js` explicitly so Yarn Plug'n'Play and other strict resolvers can load the published compiler pipeline without undeclared dependency errors.

## 0.3.3

### Patch Changes

- 0394450: Unify package build configuration on the shared Rollup helper and improve LitSX editor diagnostics for destructured component props without explicit metadata.

## 0.3.2

### Patch Changes

- 191fc0d: Introduce canonical package names for the LitSX runtime, TypeScript integration, and authored JSX tooling.

  `@litsx/core`, `@litsx/typescript`, and `@litsx/authoring` are now the recommended packages. The previous `@litsx/litsx`, `@litsx/typescript-plugin`, and `@litsx/jsx-authoring` packages remain available as compatibility wrappers.

  Generated scaffolds, compiler output, presets, and tooling defaults now target the canonical package names while preserving compatibility with projects that still use the previous names. The canonical element/scoped-registry helpers now live at `@litsx/core/elements`; `@litsx/litsx/runtime-infrastructure` remains available as the legacy compatibility subpath. Rendering helpers now live at `@litsx/core/rendering`, and TypeScript source virtualization helpers now live at `@litsx/typescript/virtualization`.

## 0.3.1

### Patch Changes

- be88410: Release every public package that is currently ahead of its latest published tag.

  This includes the LitSX TypeScript editor-session and completion improvements, refreshed scaffolded VS Code defaults, and the pending source, metadata, and packaging updates already present in the other affected packages.

## 0.3.0

### Minor Changes

- 97df32d: Improve authored renderer handling across the compiler and runtime, and refresh the generated starter templates.

  Compiler and preset updates now keep renderer-context analysis in the semantic pass, add a final JSX-to-`html` lowering pass, support renderer call-site rewrites so projected renderer content keeps the right authored context, and validate `PascalCase` JSX against real scope bindings instead of relying on the older top-level-name heuristic.

  Runtime updates align `ErrorBoundary` with `SuspenseBoundary` and keep the shared renderer-context helpers used by compiler output on the main runtime path.

  The scaffold generated by `create-litsx-app` now ships the current hero, starter guide, button primitives, updated stories/docs, and the matching starter asset set.

## 0.2.1

### Patch Changes

- b7266d8: Publish internal public dependencies with semver ranges instead of `workspace:` and keep generated scaffold package versions aligned for npm installs.

## 0.2.0

### Minor Changes

- cef2428: Publish the scoped runtime as `@litsx/litsx` and realign the public package surface on `0.2.0`.

## 0.1.0

### Minor Changes

- 5321478: Publish the initial public npm release as version 0.1.0 through the automated Changesets pipeline.
