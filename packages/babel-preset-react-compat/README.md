# `@litsx/babel-preset-react-compat`

[![npm](https://img.shields.io/badge/npm-@litsx%2Fbabel--preset--react--compat-CB3837)](https://www.npmjs.com/package/@litsx/babel-preset-react-compat)
[![Release](https://img.shields.io/badge/release-public-2ea44f)](../../RELEASING.md)
[![Module](https://img.shields.io/badge/module-ESM%20%2B%20CJS-0366d6)](./package.json)
[![Provenance](https://img.shields.io/badge/npm_provenance-enabled-2ea44f)](../../RELEASING.md)

Canonical Babel preset for migrating React-authored source onto the LitSX runtime model.

This preset is intentionally separate from the repository's
[native LitSX authoring contract](../../AUTHORING.md). It accepts React source
and translates React-specific contracts at the compatibility boundary; it does
not redefine native LitSX syntax.

## What It Includes

This preset wires the supported React compatibility pipeline in a fixed order:

1. Compiled React element runtimes (`createElement`, `jsx`, `jsxs`, and `jsxDEV`)
2. React attribute aliases such as `className`
3. React context lowering (`createContext`, `Provider`, `Consumer`, `useContext`)
4. LitSX component lowering
5. React `key` lowering onto Lit's `repeat` and `keyed` directives
6. React hooks, `useState`, and `useRef`
7. React lazy and React suspense lowering
8. Native LitSX suspense lowering
9. React-style error boundaries
10. React `propTypes` compat lowering to native static properties
11. scoped elements
12. React DOM/form attribute compatibility
13. React event lowering

That ordering makes compatibility for React 19-style `ref` props, `forwardRef(...)`, and wrappers such as `memo(...)` part of one explicit migration contract instead of accidental composition.

Refs are Lit-native after lowering. React `useRef` and `createRef` calls produce
stable facades whose `.current` property observes the underlying Lit `.value`,
and callback refs translate Lit's `undefined` cleanup to React's `null` cleanup.
React 19 callback refs that return a cleanup function run that cleanup instead.
The same adapter is applied at native-element, component, `forwardRef`, spread,
SSR, and hydration boundaries. Existing React source keeps using `.current` and
`null`; native LitSX code uses `.value` and `undefined`.

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

Allowlisted dependencies may already contain output from React's classic or automatic JSX
runtime. The preset reconstructs JSX from static `React.createElement`, imported `createElement`,
and `jsx`/`jsxs`/`jsxDEV` calls before running the ordinary compatibility pipeline. Named HTML
tags, named components, member-expression components, fragments, props objects and spreads,
children, `key`, and `ref` are supported. Minified public component exports are recovered from
aliases, and comma-separated effect calls remain transformable.

This is deliberately a static compilation boundary, not a React element-runtime emulator. Dynamic
element types, `cloneElement`, portals, computed prop definitions, and keyed or attributed
fragments stop with a diagnostic instead of producing output whose identity or lifecycle would be
incorrect.

React component recovery also covers effect-only components that render `null`, components exposed
through trailing named exports, namespace hook calls such as `React.useRef(...)`, and statically
bounded polymorphic aliases such as `const Comp = asChild ? Slot : "button"`. Polymorphic aliases
are expanded into their two JSX branches before component lowering; arbitrary dynamic element
types remain outside the static contract. For allowlisted dependencies, hook analysis follows the
ESM implementation selected by the package's import surface rather than inspecting a sibling
CommonJS build or declarations file.

Object-rest component props stay dynamic. Given `({ variant, ...props })`, react-compat exposes
`variant` as an ordinary reactive property and stores the remaining inputs in one internal reactive
bag. It does not expand `React.ComponentProps<"button">` into hundreds of host properties. Calls to
local rest-prop components and imported components are routed through `jsxSpreadElement`, which
uses `Symbol.for("litsx.restProps")` metadata on compiled destination classes to split their declared
API from the forwarded rest object. The same contract is used during browser rendering and SSR.

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

## Options

| Option | Type | Default | Purpose |
| --- | --- | --- | --- |
| `domMode` | `"light" \| "shadow"` | `"light"` | Selects the render root for components lowered in the current compilation. |
| `jsxTemplate` | `boolean` | `true` | Runs the final JSX-to-Lit `html` template lowering. |
| `jsxTemplateOptions` | `object` | `{}` | Forwards bounded configuration to the final template-lowering stage. |
| `reactKeys` | `boolean` | `true` | Lowers React `key` semantics through Lit's `repeat()` and `keyed()` directives. |
| `transformDependencies` | `string[]` | `[]` | Allows hook implementations from named React-authored packages to participate in compilation. |

The preset also accepts the type-resolution options shared with the native LitSX pipeline:

- `typeResolutionMode?: "auto" | "in-memory"`
- `inMemoryFiles?: Record<string, string>`
- `compilerOptions?: object`
- `typescriptSession?: object`

These are primarily useful to compiler and build-tool integrations. Application Babel configs normally only need the five options in the table.

### `domMode`

React compatibility defaults to light DOM so migrated component trees preserve React's DOM nesting and global CSS behavior. Scoped JSX dependencies still compile to `static elements` and resolve through the nearest contextual light DOM registry. The registry shim activates only for components that actually need that map; a plain light DOM component does not activate it.

React compatibility also forces the generic `lightDomStyles` route to
`"global"`. This preserves React's document-level CSS cascade instead of
silently introducing per-component style boundaries. Style integrations such
as `@litsx/unocss` must therefore publish React-compatible utilities through
their global stylesheet. The setting is harmless with `domMode: "shadow"`,
because shadow components still receive their required local styles.

Use shadow DOM when the migrated tree intentionally wants style and DOM encapsulation:

```json
{
  "presets": [
    ["@litsx/babel-preset-react-compat", { "domMode": "shadow" }]
  ]
}
```

This option only affects components lowered in the current compilation. It does not rewrite the render mode of imported, already-compiled components. Light and shadow components may be nested in either direction.

### `jsxTemplate` and `jsxTemplateOptions`

By default the preset compiles all the way to Lit `html` tagged templates. Set `jsxTemplate: false` when you intentionally want the intermediate JSX-shaped LitSX output instead:

```json
{
  "presets": [
    ["@litsx/babel-preset-react-compat", { "jsxTemplate": false }]
  ]
}
```

`jsxTemplateOptions` is forwarded to `@litsx/babel-plugin-transform-jsx-html-template`. It is intended for build-tool integration and focused output configuration; it does not change the React compatibility stages that run before final template generation.

### `reactKeys`

React `key` compatibility is enabled only in this preset. A concise keyed `items.map(item => <Row key={item.id} />)` expression lowers to Lit's `repeat`, while a standalone keyed element lowers to `keyed`. Complex keyed `map` callbacks with a final JSX return are decorated once per item before lowering, preserving their pre-return statements and avoiding duplicate evaluation.

Set `reactKeys: false` to disable identity lowering. In that mode `key` continues through the ordinary JSX binding path and does not preserve keyed reconciliation:

```json
{
  "presets": [
    ["@litsx/babel-preset-react-compat", { "reactKeys": false }]
  ]
}
```

### `transformDependencies`

This allowlist is required when application code imports a custom hook whose implementation still uses supported React hooks and must therefore be compiled too:

```json
{
  "presets": [
    [
      "@litsx/babel-preset-react-compat",
      { "transformDependencies": ["resize-hooks", "@scope/theme-hooks"] }
    ]
  ]
}
```

The raw Babel preset uses the allowlist for analysis, but Babel itself does not discover and transform every module in those packages. The build tool must send each selected dependency module through this preset. With Vite, configure the same option under `reactCompat`; the LitSX plugin also disables prebundling for those packages and adds them to `ssr.noExternal`:

```js
litsx({
  reactCompat: {
    transformDependencies: ["resize-hooks"],
  },
});
```

An allowlisted dependency still fails with a precise diagnostic if traversal reaches an unsupported React hook, React private internals, or a non-allowlisted opaque hook dependency.

### Internal stage options

The implementation accepts per-stage option bags used by LitSX's own compiler and tests. Those names mirror internal Babel plugins and are not a stable consumer API. Prefer the options above; if a migration needs a new behavioral switch, it should be added as an explicit preset option rather than depending on pipeline ordering or an internal plugin object.

## Scope

This preset is for migration. Native LitSX projects should prefer the native tooling surface directly instead of authoring React-shaped source long-term.
