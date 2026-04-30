# Property Inference

Lit<sup>sx</sup> generates the web-component property descriptor at compile time.

The starting point is the strongest prop information the compiler can resolve. In practice, that usually means:

1. TypeScript prop types
2. destructured prop names in the component signature
3. direct opaque member access such as `props.title`

If you add `^properties(...)`, Lit<sup>sx</sup> treats it as an override layer on top of whatever descriptor was inferred.
The transform lowers that authored macro to a memoized static getter on the generated class, so object-valued metadata keeps a stable identity per component class.
`^properties(...)` is just one named use of the general `^name(...)` hoist model, but it is the one that Lit property inference cares about directly.

## The Mental Model

Think in this order:

1. write the props type
2. let Lit<sup>sx</sup> infer the Lit property descriptor
3. use `^properties(...)` only when a property needs explicit Lit options

In day-to-day authoring, `Props` should stay as the source of truth. The generated class metadata is an implementation detail, but it is an implementation detail that Lit<sup>sx</sup> needs to derive correctly.

## What Infers Cleanly

These prop shapes map directly to stable Lit property descriptors:

- `string` -> `String`
- `number` -> `Number`
- `boolean` -> `Boolean`
- `Date` -> `Date`
- arrays and tuples -> `Array`
- object-like values -> `Object`
- callbacks and function props -> `Object` with `attribute: false`

String enums and string literal unions also infer to `String`. Numeric enums infer to `Number`.

That means most authored component types do not need any extra property metadata.

## Inference Priority

Lit<sup>sx</sup> prefers the strongest available source of truth.

- explicit TypeScript prop types
- destructured prop names from the component signature
- explicit `^properties(...)` overrides layered on top
- fallback inference from direct `props.foo` member access

That means these two inputs are combinable, not exclusive:

- TypeScript gives the base runtime `type`
- `^properties(...)` enriches Lit-specific behavior such as `reflect`, `attribute`, or `converter`

If both exist, Lit<sup>sx</sup> does not choose one or the other. It starts from the typed descriptor and then merges the authored `^properties(...)` overrides inside that memoized static getter.

## Example

The easiest way to inspect the inference model is to look at the emitted module. In this playground, the authored `Props` type establishes the base descriptor, and `^properties(...)` only enriches Lit-specific behavior.

<script setup>
import { propertyInferenceExampleSource } from "../.vitepress/theme/components/playground-example-source.js";
</script>

<ClientOnly>
  <litsx-playground
    exportname="ProfileCard"
    previewtagname="docs-profile-card-preview"
    filename="/playground/ProfileCard.tsx"
    panelmaxheight="30rem"
  >{{ propertyInferenceExampleSource }}</litsx-playground>
</ClientOnly>

```tsx
type CardProps = {
  title: string;
  active: boolean;
  createdAt: Date;
  tags: string[];
  onSelect: (id: string) => void;
};

export function Card(props: CardProps) {
  return (
    <article>
      <h2>{props.title}</h2>
      <p>{props.active ? "on" : "off"}</p>
      <p>{props.createdAt.toISOString()}</p>
      <p>{props.tags.length}</p>
      <button onClick={() => props.onSelect(props.title)}>select</button>
    </article>
  );
}
```

This starts from a property descriptor equivalent to:

```js
{
  title: { type: String },
  active: { type: Boolean },
  createdAt: { type: Date },
  tags: { type: Array },
  onSelect: { type: Object, attribute: false },
}
```

## Using `^properties(...)`

Use `^properties(...)` when the inferred type is correct but the Lit behavior needs more detail.

```tsx
type CardProps = {
  title: string;
  active: boolean;
  payload: Record<string, unknown>;
  onSelect: (id: string) => void;
};

export function Card(props: CardProps) {
  ^properties<CardProps>({
    active: { reflect: true },
    payload: { attribute: false },
    onSelect: { attribute: false },
  });

  return <article>{props.title}</article>;
}
```

That produces a descriptor shaped like:

```js
{
  title: { type: String },
  active: { type: Boolean, reflect: true },
  payload: { type: Object, attribute: false },
  onSelect: { type: Object, attribute: false },
}
```

The important distinction is:

- inference decides the base `type`
- `^properties(...)` refines Lit-specific behavior such as `reflect`, `attribute`, `converter`, or `hasChanged`

That also means `^properties(...)` is useful even when TypeScript inference is already correct. It is the place to enrich the descriptor, not to replace typing entirely.

## Untyped Props Fallback

If a component uses an opaque `props` object without TypeScript types, Lit<sup>sx</sup> still tries to recover usable metadata from direct member access.

```jsx
export function Banner(props) {
  return <section>{props.title} {props.count}</section>;
}
```

This compiles to a descriptor like:

```js
{
  title: { type: String },
  count: { type: String },
}
```

and the component body is lowered to instance properties:

```js
return <section>{this.title} {this.count}</section>;
```

That fallback exists to make `function Component(props)` usable, but it is deliberately weak. Without types or destructuring, Lit<sup>sx</sup> cannot prove whether `props.count` was really a number, string, boolean, or something richer.

So the fallback rule is intentionally conservative:

- direct `props.foo` access can produce property metadata
- untyped opaque member access falls back to `String`
- stronger sources such as TypeScript types or `^properties(...)` still win

## When Lit<sup>sx</sup> Degrades to `Object`

Some TypeScript shapes do not map cleanly to a single Lit constructor.

Typical examples:

- mixed unions like `string | number`
- conditional types
- mapped types that describe dynamic object shape
- generic wrappers where the final runtime shape is object-like

In those cases, Lit<sup>sx</sup> degrades to `Object` instead of failing compilation.

```tsx
type ValueOrFactory<T> = T extends string ? T | (() => T) : T;

type PanelProps = {
  displayValue: ValueOrFactory<string>;
};
```

This resolves to a property descriptor like:

```js
{
  displayValue: { type: Object },
}
```

That fallback is intentional. If Lit<sup>sx</sup> cannot prove that a prop cleanly maps to `String`, `Number`, `Boolean`, `Date`, or `Array`, it prefers a stable `Object` descriptor over a wrong guess.

## Compile Warnings For Weak Inference

When Lit<sup>sx</sup> has to infer a property only from opaque member access like `props.title`, it emits a compiler warning in metadata:

- `code: "LITSX_PROP_FALLBACK_STRING"`

The warning means:

- the prop was discovered from `props.foo`
- Lit<sup>sx</sup> had to fall back to `String`
- you should prefer one of:
  - TypeScript prop types
  - destructuring in the component signature
  - explicit `^properties(...)`

That warning is there because the component still compiles, but the inferred property descriptor is weaker than it could be.

## Good Practice

- keep `Props` as the source of truth
- use destructuring when the component shape is simple
- let inference do the default work
- use `function Component(props)` only when you really want an opaque prop object
- use `^properties(...)` only for Lit-specific behavior
- treat `props.foo` fallback inference as a recovery path, not the ideal authoring style
- prefer degradation to `Object` over manually duplicating every property unless you need explicit options

## Related

- [Styling](./styling.md)
- [JSX Authoring](./jsx-authoring.md)
- [Tooling](./tooling.md)
