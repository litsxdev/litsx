# Static Hoists

Lit<sup>sx</sup> uses `^name(...)` for static component metadata that belongs to the generated class rather than to render-time execution.

That means:

- `^styles(...)` attaches static stylesheet metadata
- `^properties(...)` attaches Lit property metadata
- any other direct `^name(...)` can attach additional static class metadata when Lit, Lit<sup>sx</sup>, or your own runtime code knows how to consume it

This is authored syntax, not a runtime import.

## Mental Model

Treat `^name(...)` as a compile-time static hoist.

The transform lowers each hoist to a memoized static getter on the generated class:

- the getter resolves once per component class
- object and array values keep stable identity

In practice, the authored form:

```tsx
^styles(`
  :host {
    display: block;
  }
`);
```

becomes a generated class getter, not a runtime statement inside `render()`.

That distinction matters: a hoist is still authored inside the component function, but semantically it belongs to the generated class shape.

## Accepted Shapes

`^name(...)` accepts one argument.

That argument must be a direct static value.

Examples:

```tsx
^styles(`
  :host {
    display: block;
  }
`);

^properties({
  active: { reflect: true },
});

^shadowRootOptions({
  delegatesFocus: true,
});

^lightDom();
```

## Static Method Exposure

`^expose(...)` is the exception to the getter model. It lowers to real static class methods rather than to a memoized getter.

Do not confuse that with [`useExpose`](../reference/generated/useexpose.md). `useExpose(...)` publishes an instance handle through a ref. `^expose(...)` defines class-level static methods that other components can call imperatively.

`^expose(...)` keeps the same authored signature shape as other hoists:

- pass an object literal to define methods directly

For example:

```tsx
^expose({
  canHandle(type) {
    return type === "dialog";
  },
});
```

`^expose(...)` is useful when a child component owns domain logic that a parent wants to call imperatively at the class level.

## Light DOM

`^lightDom()` opts a component out of the default shadow root and lowers to:

```js
createRenderRoot() {
  return this;
}
```

`^lightDom()` is incompatible with:

- `^shadowRootOptions(...)`

Imported Lit<sup>SX</sup> components used from a `^lightDom()` component keep their base custom-element tag and resolve through a contextual light DOM registry at runtime.

In the example below:

- the component opts into `^lightDom()`
- the demo stays in a single playground file
- two light DOM hosts both render the same `<profile-chip>` tag
- each host resolves that tag to a different implementation through `static elements`

<script setup>
import {
  lightDomExampleSource,
  staticExposeExampleSource,
} from "../.vitepress/theme/components/playground-example-source.js";
</script>

<ClientOnly>
  <litsx-playground
    exportname="LightDomPalette"
    previewtagname="docs-light-dom-hoist-preview"
    filename="/playground/LightDomPalette.tsx"
    panelmaxheight="34rem"
  >{{ lightDomExampleSource }}</litsx-playground>
</ClientOnly>

## Static Expose Example

Use `^expose(...)` when the parent should call static class-level behavior such as registries, presets, classification, or factory methods.

Use [`useExpose`](../reference/generated/useexpose.md) when the parent needs an imperative handle for one rendered instance, such as `focus()`, `open()`, or `reset()`.

In the example below:

- `ProfileChip` exposes static methods with `^expose(...)`
- the parent calls those methods to ask the child for the next preset and tone
- the rendered child still receives normal props, but the imperative coordination lives on the child class API

<ClientOnly>
  <litsx-playground
    exportname="StaticExposeDemo"
    previewtagname="docs-static-expose-preview"
    filename="/playground/StaticExposeDemo.tsx"
    panelmaxheight="34rem"
  >{{ staticExposeExampleSource }}</litsx-playground>
</ClientOnly>

## Top-Level Only

Static hoists must appear as top-level statements in the component body.

Valid:

```tsx
export function Card() {
  ^styles(`
    :host {
      display: block;
    }
  `);

  return <article>ready</article>;
}
```

Invalid:

```tsx
export function Card({ active }) {
  if (active) {
    ^styles(`:host { display: block; }`);
  }

  return <article>ready</article>;
}
```

The second form is rejected because hoists belong to the component type, not to control flow inside a render path.

## Relationship To Runtime

The generated getters rely on runtime support from `@litsx/litsx/runtime-infrastructure`.

That module exists to support compiler output. It is runtime support code, not part of the normal authored surface you import in application code.

## Related

- [JSX Authoring](./jsx-authoring.md)
- [Styling](./styling.md)
- [Property Inference](./property-inference.md)
- [Tooling](./tooling.md)
