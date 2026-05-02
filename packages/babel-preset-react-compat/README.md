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
4. React hooks, `useState`, and `useRef`
5. React lazy and React suspense lowering
6. Native LitSX suspense lowering
7. React-style error boundaries
8. React `propTypes` compat lowering to native `^properties(...)`
9. scoped elements
10. React DOM/form attribute compatibility
11. React event lowering

That ordering makes compatibility for React 19-style `ref` props, `forwardRef(...)`, and wrappers such as `memo(...)` part of one explicit migration contract instead of accidental composition.

This preset is the supported public entrypoint for React migration. React event aliasing, effect lowering, wrapper lowering, ref handling, and other migration stages are internal to the preset.

`propTypes` support here should be read as migration compatibility only. Native LitSX authoring should use TypeScript prop inference or explicit `^properties(...)` hoists instead of `Component.propTypes = { ... }`.

React context support here should also be read as migration compatibility only. It lowers onto `@lit/context` through the LitSX runtime surface; it is not a native LitSX authoring primitive.

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

## Scope

This preset is for migration. Native LitSX projects should prefer the native tooling surface directly instead of authoring React-shaped source long-term.
