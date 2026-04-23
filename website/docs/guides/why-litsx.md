# Why Lit<sup>sx</sup>

Lit<sup>sx</sup> exists for teams that want the platform model of web components and the ergonomics of JSX in the same place.

## The Pitch

Use Lit<sup>sx</sup> if you want to:

- author components in JSX
- keep Lit as the rendering foundation
- ship web components as the runtime unit
- avoid coupling the runtime to React
- keep a migration path for legacy React code when necessary

## What Lit<sup>sx</sup> Adds

Lit already gives you an excellent base for web components. Lit<sup>sx</sup> adds a different authoring experience on top of that base:

- JSX as the primary language for composing component trees
- less ceremony around view authoring
- a more functional way to express UI as data + composition
- a framework-level runtime surface for state, suspense, and authoring patterns
- editor and TypeScript support tuned for Lit-flavored JSX
- a compatibility layer for bringing React code into a web-component architecture progressively

The point is not to reimplement React. The point is to make Lit-based component authoring feel more expressive and more familiar for teams that prefer JSX.

## Why JSX for Web Components

JSX is useful here because it gives a compact, component-oriented way to express UI trees:

- nested structure is easier to scan
- composition reads naturally
- the syntax is familiar to many frontend teams
- functional decomposition reads naturally in plain JavaScript
- conditional UI and list rendering are usually less verbose than template-literal alternatives
- the authoring model works well for design systems and application shells alike

Lit<sup>sx</sup> keeps that authoring benefit while still targeting Lit and the web platform.

## Less Verbosity, More Composition

One of the practical reasons to use Lit<sup>sx</sup> is reduction of authoring noise.

Instead of thinking in terms of string-like templates, interpolation boundaries, and nested template helpers, you stay in a component tree:

- components compose as values
- markup-like structure stays readable
- view logic can be split into small functional pieces
- the code tends to read closer to "UI as a function of state"

That functional feel is especially useful in:

- design systems with many small presentational components
- shells and layouts built from composition
- codebases where JSX is already the most readable way for the team to think about UI

## Who It Is For

Lit<sup>sx</sup> is a good fit for:

- teams building design systems as web components
- product teams that want framework-independent UI primitives
- teams that like JSX but want to target the platform directly
- codebases that need a staged migration path away from React runtime assumptions

It is less interesting if you are already fully happy writing tagged template literals directly in Lit and do not want a JSX-based authoring layer.

## Runtime Positioning

The runtime story is straightforward:

- Lit<sup>sx</sup> is the framework
- Lit is the rendering engine underneath
- web components are the execution and distribution model
- React compatibility is optional and exists only for migration

That separation is intentional. It keeps the framework's identity clear.

## Read Next

- [Getting Started](../getting-started.md)
- [How to write Lit<sup>sx</sup>](./jsx-authoring.md)
- [Primitives](./primitives.md)
- [Refs](./refs.md)
- [Migrating from React](./migrating-from-react.md)
