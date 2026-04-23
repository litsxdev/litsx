# Getting Started

The recommended entry point for a new Lit<sup>sx</sup> project is `create-litsx-app`.

```sh
create-litsx-app my-app --template app
create-litsx-app my-components --template component
create-litsx-app my-design-system --template design-system --visual-tests
```

## The Default Model

By default, think in native Lit<sup>sx</sup> terms:

- JSX is the authoring format
- Lit powers rendering
- the deployed unit is a web component
- prop types are the source of truth for generated property metadata
- static hoists such as `^name(...)` belong to the component type

In practice, a static hoist such as `^styles(...)` or `^properties(...)`:

- is authored syntax, not a runtime import
- must appear as a top-level statement in the component body
- lowers to a memoized static getter on the generated class

## Workspace Expectations

- `litsx` is the runtime package
- Babel transforms handle native Lit<sup>sx</sup> JSX
- the TypeScript plugin improves authored JSX tooling
- Storybook and visual testing can be scaffolded for component and design-system workflows

In practice, a Lit<sup>sx</sup> project has three layers working together:

- authored component code in JSX and TypeScript
- transforms that lower that code to Lit-compatible output
- web components as the runtime artifact

## Good Fit

Start with Lit<sup>sx</sup> if your team wants:

- component authoring in JSX
- web components as the shipped artifact
- Lit as the rendering layer
- strong design-system ergonomics

It is especially a good fit when you want the authoring model itself to stay explicit:

- typed props drive web-component properties
- static CSS stays attached to the component
- dynamic styling flows through CSS custom properties and hooks

## Next Steps

- [Why Lit<sup>sx</sup>](./guides/why-litsx.md)
- [JSX Authoring](./guides/jsx-authoring.md)
- [Static Hoists](./guides/static-hoists.md)
- [Styling](./guides/styling.md)
- [Property Inference](./guides/property-inference.md)
- [Primitives](./guides/primitives.md)
- [Refs](./guides/refs.md)
- [Tooling](./guides/tooling.md)
- [Examples](./examples/)
