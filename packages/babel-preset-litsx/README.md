# `@litsx/babel-preset-litsx`

[![npm](https://img.shields.io/badge/npm-@litsx%2Fbabel--preset--litsx-CB3837)](https://www.npmjs.com/package/@litsx/babel-preset-litsx)
[![Release](https://img.shields.io/badge/release-public-2ea44f)](../../RELEASING.md)
[![Module](https://img.shields.io/badge/module-ESM%20%2B%20CJS-0366d6)](./package.json)
[![Provenance](https://img.shields.io/badge/npm_provenance-enabled-2ea44f)](../../RELEASING.md)

Canonical native Babel preset for LitSX-authored source.

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
- Standard JSX listener names preserve declared component callback props. When
  no `onX` prop exists, component and custom-element tags use `onPrimaryAction`
  as a listener for `primary-action`; known DOM listeners such as
  `onAnimationEnd` retain their browser event name (`animationend`). Explicit
  `.onPrimaryAction` and `@primary-action` bindings always override inference.
- Literal events emitted through `useEmit()` are published on the generated
  component as static event metadata. Typed `useEmit<EventMap>()` declarations
  also carry payload types through the TypeScript tooling surface. Dynamic event
  names mark the inferred contract as incomplete, keeping unknown listeners
  available to consumers.
- A library-authored `Component.events = { events, complete }` declaration is
  treated as the public contract and is preserved. The compiler additionally
  emits the symbol-keyed runtime form without replacing the public declaration.
- Canonical completion spelling is word-based (`url-change` → `onUrlChange`).
  Explicit `@event` syntax remains the escape hatch for names containing `:` or
  `.`, and for literal event names ending in `-capture`.
