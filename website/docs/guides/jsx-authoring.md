# JSX Authoring

Lit<sup>sx</sup> treats JSX as the primary authoring format for writing Lit-based web components.

The payoff is not only syntax familiarity. It is also a more compact and more functional way to describe UI.

## Flavor

The intended authored model is Lit-first:

- event listeners use `@event`
- property bindings use `.prop`
- boolean attributes use `?attr`
- JSX remains the authoring format even when the runtime target is Lit and web components

The TypeScript plugin and parser work together so that the IDE can reason about that syntax without forcing you to think in terms of transformed output.

## What You Are Writing

When you write Lit<sup>sx</sup>, you are writing:

- JSX-authored components
- backed by Lit
- executed as web components

## Why This Feels Different

JSX gives Lit<sup>sx</sup> two authoring advantages:

- less verbosity when expressing nested UI
- a more functional composition model for view code

In practice that means:

- small view fragments are easy to extract into functions
- conditionals and lists stay close to normal JavaScript
- component trees are usually easier to scan than heavily nested template expressions

## Authoring Priorities

- clarity of authored JSX
- native Lit<sup>sx</sup> primitives
- Lit-flavored bindings
- component composition in web-component land

Do not optimize for the generated code. The transform output is a runtime detail.

## Lit-First Bindings

The authored syntax is easiest to understand when you can poke it directly. This example keeps the surface small on purpose:

- `@input` and `@change` attach listeners
- `.value` writes to the DOM property instead of the HTML attribute
- `?checked` toggles a boolean attribute from state

Switch to `Emitted` to see how the authored JSX stays Lit-flavored while compiling down to runtime-compatible output.

<script setup>
import {
  jsxAuthoringExampleSource,
  litDirectivesExampleSource,
} from "../.vitepress/theme/components/playground-example-source.js";
</script>

<ClientOnly>
  <litsx-playground
    exportname="Composer"
    previewtagname="docs-jsx-composer-preview"
    filename="/playground/Composer.tsx"
    panelmaxheight="30rem"
  >{{ jsxAuthoringExampleSource }}</litsx-playground>
</ClientOnly>

## Lit Directives

Lit<sup>sx</sup> compiles JSX down to Lit templates, so Lit directives are part of the native authoring model.

That means two things:

- you can use built-in Lit directives such as `keyed(...)`, `when(...)`, `repeat(...)`, `cache(...)`, `guard(...)`, or `until(...)` directly in authored Lit<sup>sx</sup> code
- you should prefer those directives when the problem is already a Lit template concern, instead of trying to rebuild the same behavior with framework-specific helpers

For example:

```tsx
import { keyed } from "lit/directives/keyed.js";
import { when } from "lit/directives/when.js";

function Example({ cycle, ready }) {
  return (
    <section>
      {keyed(
        cycle,
        <div>{when(ready, () => <span>Ready</span>, () => <span>Loading</span>)}</div>
      )}
    </section>
  );
}
```

This is not a compatibility trick. It is the intended native model: Lit<sup>sx</sup> owns the authored JSX surface, and Lit still owns the template runtime underneath it.

Custom directives are also supported. If you already have a directive built with Lit's directive APIs, or you want to create one for your own project, you can import and use it in Lit<sup>sx</sup> the same way as any built-in directive.

In other words:

- use Lit directives when the concern belongs to templating
- use Lit<sup>sx</sup> hooks and primitives when the concern belongs to component state, lifecycle, refs, async UI, or public events

This example shows that split directly:

- `repeat(...)` owns keyed list rendering
- `when(...)` owns the empty-state branch
- `keyed(...)` forces a remount when the cycle changes

<ClientOnly>
  <litsx-playground
    exportname="DirectiveInbox"
    previewtagname="docs-directive-inbox-preview"
    filename="/playground/DirectiveInbox.tsx"
    panelmaxheight="32rem"
  >{{ litDirectivesExampleSource }}</litsx-playground>
</ClientOnly>

## Static Hoists

Lit<sup>sx</sup> also supports authored static hoists with `^name(...)`.

This is a compile-time macro, not a runtime import:

- `^styles(...)` is the obvious fit for component-owned CSS
- `^properties(...)` is the obvious fit for Lit property metadata
- `^shadowRootOptions(...)` or any other `^name(...)` can attach additional static class metadata when Lit, Lit<sup>sx</sup>, or your own runtime code consumes it

Every static hoist lowers to a memoized static getter on the generated class.
Static hoists also have one placement rule: they must appear as top-level statements in the component body.

The one special case is `^expose(...)`, which lowers to static class methods instead of to a getter. That keeps class-level imperative APIs separate from [`useExpose`](../reference/generated/useexpose.md), which is still the instance-level ref primitive.

## Where To Look Next

- [Static Hoists](./static-hoists.md)
- [Styling](./styling.md)
- [Primitives](./primitives.md)
- [Examples](../examples/)
