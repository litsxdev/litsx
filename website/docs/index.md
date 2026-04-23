# Lit<sup>sx</sup>

Lit<sup>sx</sup> is a framework for authoring Lit-based web components with JSX. The framework has its own runtime model, its own primitives, and its own tooling story.

It is designed around one authored model:

- JSX is the language for describing UI
- prop types drive generated web-component property metadata
- static declarations stay with the component
- the runtime target is always Lit and web components

## Why Lit<sup>sx</sup>

Lit<sup>sx</sup> is for teams that want:

- JSX as the language for building component trees
- Lit as the rendering foundation
- web components as the runtime and distribution model
- less verbose UI authoring
- a more functional style of component composition

The framework is opinionated about one thing: when you write Lit<sup>sx</sup>, it must feel like JSX on top of Lit.

That means the important surface is the code you author:

- typed props
- JSX bindings
- static hoists such as `^properties(...)`, `^styles(...)`, and other `^name(...)` declarations
- runtime hooks such as `useStyle(...)`

## What You Get

- Native Lit<sup>sx</sup> runtime primitives for JSX and web components
- TypeScript language-service support for Lit-flavored authored JSX
- Compile-time inference for generated Lit property descriptors from typed props
- Static hoists that lower to memoized static getters on the generated class
- Project scaffolding through `create-litsx-app`

## Who It Is For

- design systems shipped as web components
- product teams that want JSX authoring without a React runtime dependency
- teams building framework-independent UI primitives

## Start Here

- [Why Lit<sup>sx</sup>](./guides/why-litsx.md)
- [How to write Lit<sup>sx</sup>](./guides/jsx-authoring.md)
- [How to style components](./guides/styling.md)
- [What primitives exist](./guides/primitives.md)
- [How refs resolve](./guides/refs.md)
- [How to configure tooling](./guides/tooling.md)
- [How to migrate from React](./guides/migrating-from-react.md)
- [Real examples](./examples/)

## Reference

- [Examples](./examples/)
