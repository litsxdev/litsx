---
"@litsx/authoring": minor
"@litsx/babel-plugin-transform-jsx-html-template": minor
"@litsx/babel-plugin-shared-hooks": minor
"@litsx/babel-preset-litsx": minor
"@litsx/babel-preset-react-compat": minor
"@litsx/compiler": minor
"@litsx/core": minor
"@litsx/scoped-registry-shim": minor
"@litsx/storybook": minor
"@litsx/vite-plugin": minor
"create-litsx-app": minor
---

Make standard JSX and TSX the recommended LitSX authoring surface. Infer Lit attribute, boolean, and property bindings from ordinary prop names; add the explicit `on:event` listener convention for HTML and custom elements; preserve native lowercase handler properties; type published custom-event metadata; and keep React `onX` conversion isolated to react-compat.

Make standard `.jsx` and `.tsx` the only authored source formats. Generate projects with ordinary component props, `Component.styles = css\`...\`` assignments, native `tsc` type-checking, standard Prettier formatting, and TSX Storybook stories. Remove the unreleased `.litsx`, prefixed binding, static-hoist, custom TypeScript, Prettier-plugin, and syntax-highlighting compatibility surfaces.

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
