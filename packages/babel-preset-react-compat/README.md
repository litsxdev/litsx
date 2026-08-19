# `@litsx/babel-preset-react-compat`

[![npm](https://img.shields.io/badge/npm-@litsx%2Fbabel--preset--react--compat-CB3837)](https://www.npmjs.com/package/@litsx/babel-preset-react-compat)
[![Release](https://img.shields.io/badge/release-public-2ea44f)](../../RELEASING.md)
[![Module](https://img.shields.io/badge/module-ESM%20%2B%20CJS-0366d6)](./package.json)
[![Provenance](https://img.shields.io/badge/npm_provenance-enabled-2ea44f)](../../RELEASING.md)

Canonical Babel preset for migrating React-authored source onto the LitSX runtime model.

## What It Includes

This preset wires the supported React compatibility pipeline in a fixed order:

1. React attribute aliases such as `className`
2. React context lowering (`createContext`, `Provider`, `Consumer`, `useContext`)
3. LitSX component lowering
4. React `key` lowering onto Lit's `repeat` and `keyed` directives
5. React hooks, `useState`, and `useRef`
6. React lazy and React suspense lowering
7. Native LitSX suspense lowering
8. React-style error boundaries
9. React `propTypes` compat lowering to native static properties
10. scoped elements
11. React DOM/form attribute compatibility
12. React event lowering

That ordering makes compatibility for React 19-style `ref` props, `forwardRef(...)`, and wrappers such as `memo(...)` part of one explicit migration contract instead of accidental composition.

This preset is the supported public entrypoint for React migration. React event aliasing, effect lowering, wrapper lowering, ref handling, and other migration stages are internal to the preset.

React `onClick`-style names are interpreted as events only on DOM and custom-element tags. An `onAction` passed to `<Child>` remains an ordinary component property. Native LitSX uses `on:event` instead, so the React convention never leaks into the native pipeline.

`propTypes` support here should be read as migration compatibility only. Native LitSX authoring should use TypeScript prop inference or explicit `Component.properties = ...` assignments instead of `Component.propTypes = { ... }`.

React context support here should also be read as migration compatibility only. It lowers onto `@lit/context` through the LitSX runtime surface; it is not a native LitSX authoring primitive.

Imported custom hooks are rewritten only when LitSX can prove that their implementation is part of
the current compilation, or when a published package exposes LitSX hook metadata. An opaque hook
from a React package is rejected: preserving `useTheme()` would still require React's hook
dispatcher, while changing it to `useTheme(this)` would corrupt the package API without compiling
its implementation. Migrate those calls through a local LitSX adapter or use a package compiled for
LitSX.

Raw React hook packages can opt into the same transformation with `transformDependencies`:

```json
{
  "presets": [
    [
      "@litsx/babel-preset-react-compat",
      { "transformDependencies": ["resize-hooks"] }
    ]
  ]
}
```

Every module from an allowlisted package must pass through this preset. Its custom hooks receive the
LitSX host, supported React hooks are lowered, and compiled hooks are marked with
`Symbol.for("litsx.hook")`. Traversal stops with a diagnostic when it reaches an unsupported React
hook or a non-allowlisted external hook dependency. With Vite, prefer the official
`reactCompat.transformDependencies` option because it also configures dependency optimization and
SSR externalization correctly.

## Wrapper Semantics

`memo(...)` is accepted as a migration wrapper so React-authored components can pass through the
compatibility pipeline without being rewritten first. The transform emits a warning because LitSX
removes `memo(...)` during lowering, and `memo(Component, areEqual)` emits an additional warning
because the comparator is ignored.

In React, `memo` is commonly used because parent renders can re-run child components even when their
props have not changed. LitSX does not use that same re-render model: a host updates from its own
reactive properties and state rather than from a parent repeatedly re-invoking a component tree.

So `memo(...)` support here should be read as compatibility with existing source, not as a promise
of React-style bailout semantics or as a native LitSX performance primitive.

## Usage

```json
{
  "presets": ["@litsx/babel-preset-react-compat"]
}
```

By default the preset compiles all the way to Lit `html` tagged templates. Set `jsxTemplate: false` when you intentionally want the intermediate JSX-shaped LitSX output instead:

```json
{
  "presets": [
    ["@litsx/babel-preset-react-compat", { "jsxTemplate": false }]
  ]
}
```

Use `domMode: "light"` when a migration needs every authored component in that compilation to participate in global CSS instead of shadow-root encapsulation:

```json
{
  "presets": [
    ["@litsx/babel-preset-react-compat", { "domMode": "light" }]
  ]
}
```

`domMode` defaults to `"shadow"`. This option only affects components lowered by the preset in the current compilation; it does not rewrite imported components from elsewhere.

React `key` compatibility is enabled only in this preset. A concise keyed
`items.map(item => <Row key={item.id} />)` expression lowers to Lit's `repeat`,
while a standalone keyed element lowers to `keyed`. Complex keyed `map`
callbacks with a final JSX return are decorated once per item before lowering,
preserving their pre-return statements and avoiding duplicate evaluation. Set
`reactKeys: false` to disable this stage:

```json
{
  "presets": [
    ["@litsx/babel-preset-react-compat", { "reactKeys": false }]
  ]
}
```

## Scope

This preset is for migration. Native LitSX projects should prefer the native tooling surface directly instead of authoring React-shaped source long-term.
