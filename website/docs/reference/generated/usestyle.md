# useStyle

Apply a dynamic style property to the current component host. Think of useStyle as the authored way to drive CSS custom properties or individual host style values from component state.

- Kind: `Styling`

## Reference

```ts
import { useStyle } from "@litsx/litsx";
```

```ts
useStyle(propertyName: string, value: LitsxStyleValue): void
useStyle(propertyName: string, compute: LitsxStyleFactory): void
useStyle(propertyName: string, compute: LitsxStyleFactory, deps: unknown[]): void
```

## Usage

Use useStyle for dynamic theme values, layout measurements, or other single style properties that change with state.

This is especially useful for CSS custom properties such as `--accent-color` that your stylesheet consumes.

Prefer useStyle over rebuilding a full stylesheet string when only one or two host-level style values are dynamic.

Pass a compute function when the style value should be derived after commit. Add a dependency array only when that derived value should be recalculated for specific reactive inputs instead of every commit.

## Behavior

- Lit<sup>sx</sup> applies the style property to the host element after commit.
- Passing `null`, `undefined`, or `false` removes the property from the host.
- The property is applied through the host's inline style object, making it a good fit for CSS variables and host-level overrides.

## Mental Model

useStyle lets JavaScript decide a value while CSS keeps ownership of how that value is consumed.

## Examples

```ts
useStyle("--accent-color", accent);
useStyle("--panel-width", `${width}px`);
useStyle("--panel-gap", () => `${gap}px`);
useStyle("--panel-gap", () => `${gap}px`, [gap]);
```

## Pitfalls

- Do not use useStyle to move large amounts of visual styling into JavaScript. Keep most presentation in CSS rules and use this hook only for the dynamic edge.
- When the value naturally belongs on a child element rather than the host, prefer a normal JSX `style` binding or a class/attribute-based selector.
- Keep compute functions pure. Omitting the dependency array means the compute function runs after every commit.

## Parameters

### `propertyName`

Type: `string`

CSS property name to set on the current host.

### `value`

Type: `LitsxStyleValue`

Direct value assigned to that property for the current commit.

### `compute`

Type: `LitsxStyleFactory`

Pure function that returns the value to assign after commit.

### `deps?`

Type: `unknown[]`

Optional reactive inputs that control when the computed value should be recalculated. Omit them to recompute on every commit.

## Related

- [Styling](../../guides/styling.md)