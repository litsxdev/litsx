# `@litsx/babel-preset-litsx`

[![npm](https://img.shields.io/badge/npm-@litsx%2Fbabel--preset--litsx-CB3837)](https://www.npmjs.com/package/@litsx/babel-preset-litsx)
[![Release](https://img.shields.io/badge/release-public-2ea44f)](../../RELEASING.md)
[![Module](https://img.shields.io/badge/module-ESM%20%2B%20CJS-0366d6)](./package.json)
[![Provenance](https://img.shields.io/badge/npm_provenance-enabled-2ea44f)](../../RELEASING.md)

Canonical native Babel preset for LitSX-authored source.

See the repository's [native authoring contract](../../AUTHORING.md) for the
source syntax this preset accepts.

Use this preset when you want the supported LitSX Babel pipeline directly, without going through `@litsx/compiler`.

It wires the native lowering stages in the supported order, then optionally runs the JSX-to-Lit-template pass.

## Usage

```json
{
  "presets": ["@litsx/babel-preset-litsx"]
}
```

## Options

- `jsxTemplate?: boolean`
- `jsxTemplateOptions?: object`
- `defaultDomMode?: "shadow" | "light"`
- `typeResolutionMode?: "auto" | "in-memory"`
- `inMemoryFiles?: Record<string, string>`
- `transformLitsx?: object`

`transformLitsx` is merged on top of the native transform options when you need to override the underlying component-lowering stage directly.

## Notes

- This is the canonical raw-Babel entrypoint for native LitSX.
- For programmatic compilation with parser setup and sourcemap chaining, prefer [`@litsx/compiler`](../compiler/README.md).
- This preset owns the supported native plugin order.
- Standard top-level assignments such as `Component.styles = css\`...\`` and
  `Component.properties = {...}` are collected before component lowering.
- Ordinary JSX prop names are classified from the destination API. Boolean
  declarations become boolean attribute parts, primitive declarations become
  attributes, and object/function/opaque declarations become properties. Lit's
  `.`, `?`, and `@` prefixes are generated IR, not native authoring syntax.
- Native LitSX uses `on:event` as its unambiguous JSX listener channel on both
  HTML and custom elements. Names such as `onPrimaryAction` remain ordinary
  component callback properties. Exact native handler properties such as
  `onclick` are assigned as properties; React-style `onClick` conversion is
  owned exclusively by react-compat.
- Literal events emitted through `useEmit()` are published on the generated
  component as static event metadata. Typed `useEmit<EventMap>()` declarations
  also carry payload types through the TypeScript tooling surface. Dynamic event
  names mark the inferred contract as incomplete, keeping unknown listeners
  available to consumers.
- A library-authored `Component.events = { events, complete }` declaration is
  treated as the public contract and is preserved. The compiler additionally
  emits the symbol-keyed runtime form without replacing the public declaration.
- Canonical completion preserves lowercase kebab-case (`url-change` →
  `on:url-change`). Events containing additional `:` or `.` separators are
  consumed with `addEventListener()`. Lit's `@event` form exists only in the
  compiler-generated template passed to the final lowering stage.
- Native refs use Lit's `.value`/`undefined` lifecycle and lower to Lit's `ref()`
  directive. React's `.current`/`null` contract is confined to react-compat.
- Native keyed identity uses Lit's `repeat()` and `keyed()` directives. Only the
  react-compat stage assigns React reconciliation meaning to JSX `key`.
