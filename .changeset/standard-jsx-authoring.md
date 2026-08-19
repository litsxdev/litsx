---
"@litsx/authoring": minor
"@litsx/babel-plugin-transform-jsx-html-template": minor
"@litsx/babel-plugin-shared-hooks": minor
"@litsx/babel-preset-litsx": minor
"@litsx/babel-preset-react-compat": minor
"@litsx/compiler": minor
"@litsx/core": minor
"@litsx/storybook": minor
"@litsx/vite-plugin": minor
"create-litsx-app": minor
---

Make standard JSX and TSX the recommended LitSX authoring surface. Infer Lit attribute, boolean, and property bindings from ordinary prop names; add the explicit `on:event` listener convention for HTML and custom elements; preserve native lowercase handler properties; type published custom-event metadata; and keep React `onX` conversion isolated to react-compat.

Make standard `.jsx` and `.tsx` the only authored source formats. Generate projects with ordinary component props, `Component.styles = css\`...\`` assignments, native `tsc` type-checking, standard Prettier formatting, and TSX Storybook stories. Remove the unreleased `.litsx`, prefixed binding, static-hoist, custom TypeScript, Prettier-plugin, and syntax-highlighting compatibility surfaces.

Allow React-authored hook dependencies to opt into recursive react-compat transformation. Vite now keeps selected packages out of dependency prebundling and SSR externalization, transforms their JavaScript and TypeScript modules, propagates the LitSX host through custom-hook graphs, emits compiled-hook metadata, and stops with a diagnostic at unsupported React hook boundaries.

Normalize statically analyzable output from React's classic and automatic JSX runtimes before react-compat lowering. Allowlisted compiled dependencies can now recover named components, fragments, props and spreads, children, keys, refs, minified public component aliases, and effect sequences from `createElement`, `jsx`, `jsxs`, and `jsxDEV`, while unsupported dynamic element operations stop with explicit diagnostics.

Recover effect-only React components that render `null`, trailing named component exports, namespace `useRef` calls, and statically bounded polymorphic `asChild` aliases. Resolve host-aware hooks from the ESM implementation of allowlisted dependencies, and emit valid quoted property metadata and computed instance access for hyphenated TypeScript props such as `aria-label`.
